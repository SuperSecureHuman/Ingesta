'use client';

import React, { createContext, useContext, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Hls from 'hls.js';
import { ProbeData, Capabilities, TranscodeStats, FileComment, FileMarker } from '@/lib/types';
import { generateUUID } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { useWebGLLut } from '@/hooks/useWebGLLut';
import { useLutContext } from './LutContext';

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

interface PlayerContextType {
  isVisible: boolean;
  filePath: string | null;
  sourceRect: DOMRect | null;
  quality: string;
  probeData: ProbeData | null;
  capabilities: Capabilities | null;
  transcodeStats: TranscodeStats;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  startPlayback: (filePath: string, seekTime?: number, fileId?: string, sourceRect?: DOMRect) => Promise<void>;
  stopPlayback: () => void;
  changeQuality: (key: string) => Promise<void>;
  changeLut: (lutId: string | null) => Promise<void>;
  readOnly: boolean;
  getInitialAnnotations: (filePath: string) => { comments: FileComment[]; markers: FileMarker[] } | null;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

interface PlayerContextProviderProps {
  children: React.ReactNode;
  fetchFn?: FetchFn;
  apiBase?: string;
  xhrSetup?: (xhr: XMLHttpRequest) => void;
  readOnly?: boolean;
  initialAnnotations?: Record<string, { comments: FileComment[]; markers: FileMarker[] }>;
}

export function PlayerContextProvider({
  children,
  fetchFn: fetchFnProp,
  apiBase = '/api',
  xhrSetup,
  readOnly = false,
  initialAnnotations,
}: PlayerContextProviderProps) {
  const fetchFn: FetchFn = fetchFnProp ?? apiFetch;

  const [isVisible, setIsVisible] = useState(false);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [sourceRect, setSourceRect] = useState<DOMRect | null>(null);
  const [quality, setQuality] = useState('source');
  const [probeData, setProbeData] = useState<ProbeData | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [transcodeStats, setTranscodeStats] = useState<TranscodeStats>({});

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcodeStatsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qualityRef = useRef('source');
  const probedFilePathRef = useRef<string | null>(null);
  const playbackStartTimeRef = useRef<number | null>(null);

  const { activeLutId, lutStrength, setFileLutPref } = useLutContext();

  // Annotation injection for read-only contexts (share page)
  const annotationsRef = useRef(initialAnnotations ?? {});
  useEffect(() => { annotationsRef.current = initialAnnotations ?? {}; }, [initialAnnotations]);
  const getInitialAnnotations = useCallback(
    (path: string) => annotationsRef.current[path] ?? null,
    []
  );

  useWebGLLut({
    videoRef,
    canvasRef,
    activeLutId,
    lutStrength,
    fetchLutFile: (id) => fetch(`/api/luts/${id}/file`).then((r) => r.text()),
    enabled: !!activeLutId,
  });

  // Fetch lut-pref by path whenever the active file changes (skip for share)
  useEffect(() => {
    if (!filePath || apiBase !== '/api') {
      setFileLutPref(null);
      return;
    }
    let cancelled = false;
    apiFetch('/api/files/source-tags-by-paths', {
      method: 'POST',
      body: JSON.stringify({ paths: [filePath] }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!cancelled) {
          setFileLutPref(data?.tags?.[filePath]?.lut_id ?? null);
        }
      })
      .catch(() => { if (!cancelled) setFileLutPref(null); });
    return () => { cancelled = true; };
  }, [filePath, apiBase]);

  // Fetch transcode stats with adaptive polling backoff (logged-in only)
  const fetchTranscodeStats = async () => {
    if (apiBase !== '/api') return; // no debug endpoint on share
    try {
      const resp = await fetch('/api/debug/state');
      if (!resp.ok) return;
      const data = await resp.json();
      const active = data.jobs?.find(
        (j: any) => !j.has_exited && j.pid
      );
      if (!active && transcodeStatsIntervalRef.current) {
        clearInterval(transcodeStatsIntervalRef.current);
        transcodeStatsIntervalRef.current = null;
      }
      setTranscodeStats(
        active
          ? {
              fps: active.transcode_fps || 0,
              speed: active.transcode_speed || 0
            }
          : {}
      );
    } catch (e) {
      // Silently fail
    }
  };

  // Start playback
  const startPlayback = async (newFilePath: string, seekTime = 0, fileId?: string, rect?: DOMRect) => {
    if (!videoRef.current) return;

    const sid = generateUUID();
    sessionIdRef.current = sid;
    playbackStartTimeRef.current = Date.now();
    setFilePath(newFilePath);
    if (rect) setSourceRect(rect);
    setIsVisible(true);

    try {
      const shouldProbe = newFilePath !== probedFilePathRef.current || !probeData;

      if (shouldProbe) {
        const probeUrl = `${apiBase}/probe?path=${encodeURIComponent(newFilePath)}`;
        const capsUrl = `${apiBase}/capabilities`;

        const [probeResp, capsResp] = await Promise.all([
          fetchFn(probeUrl),
          fetchFn(capsUrl),
        ]);

        if (!probeResp.ok) throw new Error('Probe failed');

        const probe = await probeResp.json();
        const caps = capsResp.ok ? await capsResp.json() : null;
        setProbeData(probe);
        setCapabilities(caps);
        probedFilePathRef.current = newFilePath;
      }

      // Adaptive segment length
      const isTranscoding = qualityRef.current !== 'source';
      const segmentLength = isTranscoding ? 1 : 4;

      // Build playlist URL
      const playlistUrl = `${apiBase}/playlist/${sid}/main.m3u8?path=${encodeURIComponent(
        newFilePath
      )}&quality=${qualityRef.current}&segment_length=${segmentLength}`;

      // Clean up old HLS
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      const video = videoRef.current;
      video.pause();
      video.src = '';

      if (Hls.isSupported()) {
        const bufferConfig = isTranscoding
          ? {
              maxBufferLength: 60,
              maxMaxBufferLength: 120,
              backBufferLength: 5,
              lowWaterMark: 10,
              highWaterMark: 30,
            }
          : {
              maxBufferLength: 15,
              maxMaxBufferLength: 30,
              backBufferLength: 2,
              lowWaterMark: 3,
              highWaterMark: 10,
            };

        const hlsConfig: any = {
          debug: false,
          enableWorker: true,
          ...bufferConfig,
          maxBufferSize: isTranscoding ? 200 * 1000 * 1000 : 50 * 1000 * 1000,
          startLevel: -1,
          abrEwmaDefaultEstimate: 5000000,
          abrEwmaFastLive: 3,
          abrEwmaSlowLive: 9,
        };

        if (xhrSetup) {
          hlsConfig.xhrSetup = xhrSetup;
        }

        const hls = new Hls(hlsConfig);

        hls.on(Hls.Events.MANIFEST_PARSED, async () => {
          video.play();
          if (seekTime > 0) {
            video.currentTime = seekTime;
          }
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error('HLS error:', data);
        });

        hls.loadSource(playlistUrl);
        hls.attachMedia(video);
        hlsRef.current = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = playlistUrl;
        video.play();
      }

      // Ping loop
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(() => {
        fetchFn(`${apiBase}/ping/${sid}`, { method: 'POST' }).catch(
          (e) => console.warn(e)
        );
      }, 10000);

      // Transcode stats (only for non-source quality, logged-in only)
      if (apiBase === '/api' && qualityRef.current !== 'source') {
        if (transcodeStatsIntervalRef.current)
          clearInterval(transcodeStatsIntervalRef.current);

        let pollCount = 0;
        transcodeStatsIntervalRef.current = setInterval(() => {
          pollCount++;
          fetchTranscodeStats();

          if (pollCount === 15) {
            clearInterval(transcodeStatsIntervalRef.current!);
            transcodeStatsIntervalRef.current = setInterval(
              fetchTranscodeStats,
              5000
            );
          }
        }, 1000);
      }
    } catch (e) {
      console.error('startPlayback error:', e);
      setIsVisible(false);
      setFilePath(null);
    }
  };

  // Stop playback
  const stopPlayback = () => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (transcodeStatsIntervalRef.current) {
      clearInterval(transcodeStatsIntervalRef.current);
      transcodeStatsIntervalRef.current = null;
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = '';
    }

    if (sessionIdRef.current) {
      fetchFn(`${apiBase}/stop/${sessionIdRef.current}`, { method: 'POST' }).catch(
        (e) => console.warn(e)
      );
    }

    setIsVisible(false);
    setFilePath(null);
    setSourceRect(null);
    setProbeData(null);
    setTranscodeStats({});
    probedFilePathRef.current = null;
  };

  // Change quality
  const changeQuality = async (newQuality: string) => {
    if (newQuality === quality) return;

    const video = videoRef.current;
    if (!video) return;

    const seekTime = video.currentTime;

    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (transcodeStatsIntervalRef.current) {
      clearInterval(transcodeStatsIntervalRef.current);
      transcodeStatsIntervalRef.current = null;
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    video.pause();
    video.src = '';

    if (sessionIdRef.current) {
      try {
        await fetchFn(`${apiBase}/stop/${sessionIdRef.current}`, { method: 'POST' });
      } catch (e) {
        console.warn(e);
      }
    }

    qualityRef.current = newQuality;
    setQuality(newQuality);
    if (filePath) {
      await startPlayback(filePath, seekTime);
    }
  };

  // Change LUT — client-side WebGL only; activeLutId change is picked up reactively
  const changeLut = async (_newLutId: string | null) => {
    return;
  };

  // beforeunload handler
  useEffect(() => {
    const handler = () => {
      if (sessionIdRef.current) {
        navigator.sendBeacon(`${apiBase}/stop/${sessionIdRef.current}`, '');
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [apiBase]);

  const value = useMemo(
    () => ({
      isVisible,
      filePath,
      sourceRect,
      quality,
      probeData,
      capabilities,
      transcodeStats,
      videoRef,
      canvasRef,
      startPlayback,
      stopPlayback,
      changeQuality,
      changeLut,
      readOnly,
      getInitialAnnotations,
    }),
    [
      isVisible,
      filePath,
      sourceRect,
      quality,
      probeData,
      capabilities,
      transcodeStats,
      startPlayback,
      stopPlayback,
      changeQuality,
      changeLut,
      readOnly,
      getInitialAnnotations,
    ]
  );

  return (
    <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
  );
}

export function usePlayerContext() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayerContext must be used within PlayerContextProvider');
  }
  return context;
}
