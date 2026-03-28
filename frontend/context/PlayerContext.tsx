'use client';

import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import Hls from 'hls.js';
import { ProbeData, Capabilities, TranscodeStats } from '@/lib/types';
import { generateUUID } from '@/lib/utils';

interface PlayerContextType {
  isVisible: boolean;
  filePath: string | null;
  quality: string;
  probeData: ProbeData | null;
  capabilities: Capabilities | null;
  transcodeStats: TranscodeStats;
  videoRef: React.RefObject<HTMLVideoElement>;
  startPlayback: (filePath: string, seekTime?: number) => Promise<void>;
  stopPlayback: () => void;
  changeQuality: (key: string) => Promise<void>;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerContextProvider({ children }: { children: React.ReactNode }) {
  const [isVisible, setIsVisible] = useState(false);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [quality, setQuality] = useState('source');
  const [probeData, setProbeData] = useState<ProbeData | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [transcodeStats, setTranscodeStats] = useState<TranscodeStats>({});

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcodeStatsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qualityRef = useRef('source');

  // Sync qualityRef to quality state
  useEffect(() => {
    qualityRef.current = quality;
  }, [quality]);

  // Fetch transcode stats
  const fetchTranscodeStats = async () => {
    try {
      const resp = await fetch('/api/debug/state');
      if (!resp.ok) return;
      const data = await resp.json();
      const active = data.jobs?.find(
        (j: any) => !j.has_exited && j.transcode_fps > 0
      );
      setTranscodeStats(
        active
          ? { fps: active.transcode_fps, speed: active.transcode_speed }
          : {}
      );
    } catch (e) {
      // Silently fail
    }
  };

  // Start playback
  const startPlayback = async (newFilePath: string, seekTime = 0) => {
    if (!videoRef.current) return;

    const sid = generateUUID();
    sessionIdRef.current = sid;
    setFilePath(newFilePath);
    setIsVisible(true);

    try {
      // Probe the file
      const probeResp = await fetch(
        `/api/probe?path=${encodeURIComponent(newFilePath)}`
      );
      if (!probeResp.ok) throw new Error('Probe failed');
      const probe = await probeResp.json();
      setProbeData(probe);

      // Get capabilities
      const capsResp = await fetch('/api/capabilities');
      if (!capsResp.ok) throw new Error('Capabilities failed');
      const caps = await capsResp.json();
      setCapabilities(caps);

      // Build playlist URL
      const playlistUrl = `/api/playlist/${sid}/main.m3u8?path=${encodeURIComponent(
        newFilePath
      )}&quality=${qualityRef.current}&segment_length=6`;

      // Clean up old HLS instance
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      const video = videoRef.current;
      video.pause();
      video.src = '';

      // Load with HLS.js if supported
      if (Hls.isSupported()) {
        const hls = new Hls({
          debug: false,
          enableWorker: true,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          backBufferLength: 10,
          maxBufferSize: 100 * 1000 * 1000, // 100 MB
        });

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
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
        // Native HLS support (Safari)
        video.src = playlistUrl;
        video.play();
      }

      // Start ping loop (10 seconds)
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(() => {
        fetch(`/api/ping/${sid}`, { method: 'POST' }).catch(
          (e) => console.warn(e)
        );
      }, 10000);

      // Start transcode stats poll (2 seconds)
      if (transcodeStatsIntervalRef.current)
        clearInterval(transcodeStatsIntervalRef.current);
      transcodeStatsIntervalRef.current = setInterval(
        fetchTranscodeStats,
        2000
      );
    } catch (e) {
      console.error('startPlayback error:', e);
      setIsVisible(false);
      setFilePath(null);
    }
  };

  // Stop playback
  const stopPlayback = () => {
    // Clear intervals
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (transcodeStatsIntervalRef.current) {
      clearInterval(transcodeStatsIntervalRef.current);
      transcodeStatsIntervalRef.current = null;
    }

    // Destroy HLS
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Stop video
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = '';
    }

    // Send stop signal
    if (sessionIdRef.current) {
      fetch(`/api/stop/${sessionIdRef.current}`, { method: 'POST' }).catch(
        (e) => console.warn(e)
      );
    }

    // Update state
    setIsVisible(false);
    setFilePath(null);
    setProbeData(null);
    setTranscodeStats({});
  };

  // Change quality
  const changeQuality = async (newQuality: string) => {
    if (newQuality === quality) return;

    const video = videoRef.current;
    if (!video) return;

    const seekTime = video.currentTime;

    // Stop current playback
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

    // Stop old session
    if (sessionIdRef.current) {
      try {
        await fetch(`/api/stop/${sessionIdRef.current}`, { method: 'POST' });
      } catch (e) {
        console.warn(e);
      }
    }

    // Update quality and restart playback
    setQuality(newQuality);
    if (filePath) {
      await startPlayback(filePath, seekTime);
    }
  };

  // beforeunload handler
  useEffect(() => {
    const handler = () => {
      if (sessionIdRef.current) {
        navigator.sendBeacon(`/api/stop/${sessionIdRef.current}`, '');
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, []);

  const value: PlayerContextType = {
    isVisible,
    filePath,
    quality,
    probeData,
    capabilities,
    transcodeStats,
    videoRef,
    startPlayback,
    stopPlayback,
    changeQuality,
  };

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
