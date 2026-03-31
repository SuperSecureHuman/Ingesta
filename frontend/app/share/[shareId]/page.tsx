'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Hls from 'hls.js';
import { ShareFile, ProbeData, Capabilities } from '@/lib/types';
import { generateUUID, formatTime, getResolutionLabel, getFileName } from '@/lib/utils';

// INFO PANEL HELPER
function formatInfoSection(title: string, rows: [string, string | number | null | undefined][]): string {
  const items = rows
    .map(
      ([k, v]) =>
        `<div class="flex justify-between gap-2 py-0.5">
           <span class="text-gray-500 shrink-0">${k}</span>
           <span class="text-gray-200 text-right truncate">${v ?? '—'}</span>
         </div>`
    )
    .join('');
  return `<div>
    <div class="text-gray-400 font-sans font-semibold text-xs mb-1.5 uppercase tracking-wider">${title}</div>
    <div class="space-y-0.5">${items}</div>
  </div>`;
}

export default function ShareViewerPage() {
  const params = useParams();
  // NOTE: In Next.js 15, useParams() in Client Components remains synchronous.
  // If this page is converted to a Server Component in future, params becomes
  // Promise<Params> and must be awaited.
  const shareId = params.shareId as string;
  const projectName = 'Shared Footage';

  // STATE
  const [jwt, setJwt] = useState<string | null>(null);
  const [view, setView] = useState<'password' | 'grid' | 'player'>('password');
  const [passwordError, setPasswordError] = useState('');
  const [files, setFiles] = useState<ShareFile[]>([]);

  // Player state
  const [probeData, setProbeData] = useState<ProbeData | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [quality, setQuality] = useState('source');
  const [isPlaying, setIsPlaying] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const [qualityPopoverOpen, setQualityPopoverOpen] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [bufferedPct, setBufferedPct] = useState(0);
  const [currentTimeStr, setCurrentTimeStr] = useState('0:00');
  const [totalTimeStr, setTotalTimeStr] = useState('0:00');
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [infoHtml, setInfoHtml] = useState('');
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);

  // REFS
  const videoRef = useRef<HTMLVideoElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const controlsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Refs for stale closure safety
  const isPlayingRef = useRef(false);
  const qualityPopoverOpenRef = useRef(false);
  const infoVisibleRef = useRef(false);
  const qualityRef = useRef('source');
  const jwtRef = useRef<string | null>(null);

  // Sync state to refs
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => {
    qualityPopoverOpenRef.current = qualityPopoverOpen;
  }, [qualityPopoverOpen]);
  useEffect(() => {
    infoVisibleRef.current = infoVisible;
  }, [infoVisible]);

  // INIT
  useEffect(() => {
    const stored = sessionStorage.getItem(`share_jwt_${shareId}`);
    if (stored) {
      jwtRef.current = stored;
      setJwt(stored);
      // Use async IIFE to load files
      (async () => {
        try {
          const res = await fetch(`/api/share/${shareId}/files`, {
            headers: { 'Authorization': `Bearer ${stored}` },
          });

          if (res.status === 401) {
            sessionStorage.removeItem(`share_jwt_${shareId}`);
            jwtRef.current = null;
            setJwt(null);
            return;
          }

          if (!res.ok) throw new Error('Failed to load files');

          const data = await res.json();
          setFiles(data.files || []);
          setView('grid');
        } catch (e) {
          console.error('Failed to load files:', e);
        }
      })();
    }

    // beforeunload beacon
    const handler = () => {
      if (sessionIdRef.current) {
        navigator.sendBeacon(`/api/share/${shareId}/stop/${sessionIdRef.current}`, '');
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [shareId]);

  // AUTH
  const submitPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const password = passwordInputRef.current?.value || '';
    setPasswordError('');

    try {
      const res = await fetch(`/api/share/${shareId}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setPasswordError(data.detail || 'Invalid password');
        return;
      }

      const data = await res.json();
      jwtRef.current = data.token;
      setJwt(data.token);
      sessionStorage.setItem(`share_jwt_${shareId}`, data.token);
      if (passwordInputRef.current) {
        passwordInputRef.current.value = '';
      }

      loadFiles(data.token);
    } catch (e) {
      setPasswordError('Connection error: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const loadFiles = async (token: string) => {
    try {
      const res = await fetch(`/api/share/${shareId}/files`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.status === 401) {
        logout();
        return;
      }

      if (!res.ok) throw new Error('Failed to load files');

      const data = await res.json();
      setFiles(data.files || []);
      setView('grid');
    } catch (e) {
      console.error('Failed to load files:', e);
    }
  };

  // QUALITY & PROBE
  const probeAndFetchCaps = async (filePath: string) => {
    if (!jwtRef.current) return;

    try {
      const [probeRes, capsRes] = await Promise.all([
        fetch(`/api/share/${shareId}/probe?path=${encodeURIComponent(filePath)}`, {
          headers: { 'Authorization': `Bearer ${jwtRef.current}` },
        }),
        fetch(`/api/share/${shareId}/capabilities`, {
          headers: { 'Authorization': `Bearer ${jwtRef.current}` },
        }),
      ]);

      if (!probeRes.ok) throw new Error('Probe failed');
      const probeData = await probeRes.json();
      const caps = capsRes.ok ? await capsRes.json() : null;
      setProbeData(probeData);
      setCapabilities(caps);
    } catch (e) {
      console.warn('Error probing:', e instanceof Error ? e.message : String(e));
    }
  };

  // PLAYBACK - store pending playback details in refs
  const pendingPlaybackRef = useRef<{ filePath: string; seekTime: number } | null>(null);
  const [playTrigger, setPlayTrigger] = useState(0);

  const startPlayback = useCallback(
    (filePath: string, seekTime = 0) => {
      if (!filePath) return;
      // Store the pending playback
      pendingPlaybackRef.current = { filePath, seekTime };
      if (view !== 'player') {
        setView('player');  // triggers render + effect
      } else {
        // Already in player view, force the effect to re-run for quality switch
        setPlayTrigger(n => n + 1);
      }
    },
    [view]
  );

  // Handle HLS setup when view changes to 'player' and video element is ready
  useEffect(() => {
    if (view !== 'player' || !videoRef.current || !pendingPlaybackRef.current) return;

    const { filePath, seekTime } = pendingPlaybackRef.current;
    pendingPlaybackRef.current = null;

    (async () => {
      try {
        sessionIdRef.current = generateUUID();
        const playlistUrl = `/api/share/${shareId}/playlist/${sessionIdRef.current}/main.m3u8?path=${encodeURIComponent(filePath)}&quality=${qualityRef.current}&segment_length=6`;

        if (Hls.isSupported()) {
          const hls = new Hls({
            debug: false,
            enableWorker: true,
            maxBufferLength: 30,
            xhrSetup: (xhr) => {
              if (jwtRef.current) {
                xhr.setRequestHeader('Authorization', `Bearer ${jwtRef.current}`);
              }
            },
          });

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            videoRef.current?.play();
            if (seekTime > 0 && videoRef.current) {
              videoRef.current.currentTime = seekTime;
            }
          });

          hls.on(Hls.Events.ERROR, (data) => {
            console.error('HLS error:', data);
          });

          hls.loadSource(playlistUrl);
          if (videoRef.current) {
            hls.attachMedia(videoRef.current);
          }
          hlsRef.current = hls;
        } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
          videoRef.current.src = playlistUrl;
          videoRef.current.play();
        }
      } catch (e) {
        console.error('Error starting playback:', e);
      }
    })();
  }, [view, playTrigger, shareId]);

  const backToGrid = useCallback(async () => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = '';
    }
    if (sessionIdRef.current) {
      try {
        await fetch(`/api/share/${shareId}/stop/${sessionIdRef.current}`, {
          method: 'POST',
          headers: jwtRef.current ? { 'Authorization': `Bearer ${jwtRef.current}` } : {},
        });
      } catch (e) {
        console.warn(e);
      }
      sessionIdRef.current = null;
    }
    setCurrentFilePath(null);
    setIsPlaying(false);
    setInfoVisible(false);
    setView('grid');
  }, []);

  const changeQuality = useCallback(
    async (newQuality: string) => {
      setQualityPopoverOpen(false);
      if (newQuality === qualityRef.current) return;

      qualityRef.current = newQuality;
      setQuality(newQuality);

      if (!isPlayingRef.current || !currentFilePath) return;

      const seekTime = videoRef.current?.currentTime || 0;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      try {
        await fetch(`/api/share/${shareId}/stop/${sessionIdRef.current}`, {
          method: 'POST',
          headers: jwtRef.current ? { 'Authorization': `Bearer ${jwtRef.current}` } : {},
        });
      } catch (e) {
        console.warn(e);
      }
      await startPlayback(currentFilePath, seekTime);
    },
    [currentFilePath, startPlayback]
  );

  const downloadFile = async () => {
    if (!currentFilePath || !jwtRef.current) return;

    try {
      const res = await fetch(`/api/share/${shareId}/download?path=${encodeURIComponent(currentFilePath)}`, {
        headers: { 'Authorization': `Bearer ${jwtRef.current}` },
      });
      if (!res.ok) throw new Error('Download failed');

      const blob = await res.blob();
      const filename = getFileName(currentFilePath);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'download';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Download error:', e);
      alert('Download failed');
    }
  };

  const logout = useCallback(() => {
    sessionStorage.removeItem(`share_jwt_${shareId}`);
    jwtRef.current = null;
    setJwt(null);
    backToGrid().then(() => {
      setView('password');
    });
  }, [shareId, backToGrid]);

  // TIME DISPLAY
  const updateTimeDisplay = useCallback(() => {
    if (!videoRef.current) return;
    setCurrentTimeStr(formatTime(videoRef.current.currentTime));
    setTotalTimeStr(formatTime(videoRef.current.duration));
  }, []);

  const updateSeekBar = useCallback(() => {
    if (!videoRef.current?.duration) return;
    setProgressPct((videoRef.current.currentTime / videoRef.current.duration) * 100);
  }, []);

  const updateBufferedRange = useCallback(() => {
    if (!videoRef.current?.buffered || videoRef.current.buffered.length === 0) return;
    const end = videoRef.current.buffered.end(videoRef.current.buffered.length - 1);
    const pct = videoRef.current.duration ? (end / videoRef.current.duration) * 100 : 0;
    setBufferedPct(pct);
  }, []);

  const updateInfoPanel = useCallback(() => {
    if (!infoVisibleRef.current || !probeData || !videoRef.current) return;

    const v = videoRef.current;
    let bufferedSec = 0;
    if (v.buffered && v.buffered.length > 0) {
      bufferedSec = Number((v.buffered.end(v.buffered.length - 1) - v.currentTime).toFixed(1));
    }

    const container = currentFilePath ? currentFilePath.split('.').pop()?.toUpperCase() : '—';
    const sourceMbps = probeData ? (probeData.bitrate / 1_000_000).toFixed(1) + ' Mbps' : '—';
    const sourceRes = probeData ? `${probeData.width}×${probeData.height}` : '—';
    const srcCodec = probeData?.video_codec?.toUpperCase() || '—';

    const sections = [
      formatInfoSection('Media', [
        ['Container', container],
        ['Resolution', sourceRes],
        ['Bitrate', sourceMbps],
        ['Codec', srcCodec],
        ['Duration', probeData ? formatTime(probeData.duration_seconds) : '—'],
      ]),
      formatInfoSection('Playback', [
        ['Current time', formatTime(v.currentTime)],
        ['Buffered ahead', `${bufferedSec}s`],
      ]),
    ];

    setInfoHtml(sections.join(''));
  }, [probeData, currentFilePath]);

  // VIDEO EVENTS
  useEffect(() => {
    if (!videoRef.current || view !== 'player') return;

    const video = videoRef.current;

    const onPlay = () => {
      setIsPlaying(true);
    };
    const onPause = () => {
      setIsPlaying(false);
    };
    const onTimeUpdate = () => {
      updateTimeDisplay();
      updateSeekBar();
      if (infoVisibleRef.current) updateInfoPanel();
    };
    const onLoadedMetadata = () => {
      updateTimeDisplay();
    };
    const onProgress = () => {
      updateBufferedRange();
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('progress', onProgress);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('progress', onProgress);
    };
  }, [view, updateTimeDisplay, updateSeekBar, updateBufferedRange, updateInfoPanel]);

  // CONTROLS AUTO-HIDE
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsHideTimerRef.current) {
      clearTimeout(controlsHideTimerRef.current);
    }
    if (isPlayingRef.current) {
      controlsHideTimerRef.current = setTimeout(() => {
        if (isPlayingRef.current && !qualityPopoverOpenRef.current) {
          setControlsVisible(false);
        }
      }, 3000);
    }
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onMove = () => showControls();
    const onLeave = () => {
      if (isPlayingRef.current) {
        setControlsVisible(false);
      }
    };

    viewport.addEventListener('mousemove', onMove);
    viewport.addEventListener('mouseleave', onLeave);

    return () => {
      viewport.removeEventListener('mousemove', onMove);
      viewport.removeEventListener('mouseleave', onLeave);
    };
  }, [showControls]);

  // KEYBOARD SHORTCUTS
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (view !== 'player') return;

      const video = videoRef.current;

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          if (video) {
            if (video.paused) video.play();
            else video.pause();
          }
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          toggleVolumeMute();
          break;
        case 'i':
          e.preventDefault();
          setInfoVisible((v) => !v);
          break;
        case 'escape':
          e.preventDefault();
          backToGrid();
          break;
        case 'arrowleft':
          if (video) video.currentTime = Math.max(0, video.currentTime - 10);
          break;
        case 'arrowright':
          if (video) video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
          break;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [view, backToGrid]);

  // HANDLERS
  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current?.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    videoRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * videoRef.current.duration;
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val / 100;
    }
    setIsMuted(val === 0);
  };

  const toggleVolumeMute = () => {
    if (!videoRef.current) return;
    if (videoRef.current.volume > 0) {
      videoRef.current.volume = 0;
      setVolume(0);
      setIsMuted(true);
    } else {
      videoRef.current.volume = 1;
      setVolume(100);
      setIsMuted(false);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      viewportRef.current?.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen();
    }
  };

  const handleCardClick = async (file: ShareFile) => {
    if (file.scan_status === 'pending') return;
    setCurrentFilePath(file.file_path);
    await probeAndFetchCaps(file.file_path);
    startPlayback(file.file_path, 0);
  };

  // COMPUTED
  const { sourceResLabel, sourceMbps } = useMemo(() => {
    if (!probeData) return { sourceResLabel: 'Source', sourceMbps: '—' };
    return { sourceResLabel: getResolutionLabel(probeData.height), sourceMbps: (probeData.bitrate / 1_000_000).toFixed(1) };
  }, [probeData]);

  const filteredTiers = useMemo(() => {
    return capabilities?.bitrate_tiers?.filter((tier) => {
      if (probeData) {
        if (tier.max_height && tier.max_height > probeData.height) return false;
        if (tier.bitrate >= probeData.bitrate) return false;
      }
      return true;
    }) || [];
  }, [probeData, capabilities]);

  // RENDER
  if (view === 'password') {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 px-4">
        <div className="w-full max-w-md">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 shadow-2xl">
            <h1 className="text-2xl font-bold text-gray-100 mb-2 text-center">Footage Review</h1>
            <p className="text-sm text-gray-500 text-center mb-6">Enter password to access shared footage</p>

            <form onSubmit={submitPassword}>
              <div className="mb-4">
                <input
                  ref={passwordInputRef}
                  type="password"
                  placeholder="Enter password"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-gray-100
                           placeholder-gray-500 focus:outline-none focus:border-accent transition-colors"
                  autoFocus
                />
              </div>

              {passwordError && <div className="text-red-400 text-sm mb-4">{passwordError}</div>}

              <button
                type="submit"
                className="w-full bg-accent hover:bg-amber-500 text-gray-950 font-semibold py-3 rounded-lg
                         transition-colors"
              >
                Watch
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-black">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0 bg-gray-900">
        <h1 className="text-lg font-semibold text-gray-100">{projectName}</h1>
        <button
          onClick={logout}
          className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded
                   text-gray-400 hover:text-gray-200 transition-colors"
        >
          Logout
        </button>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col">
        {/* FILE GRID VIEW */}
        {view === 'grid' && (
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {files.length === 0 ? (
                <div className="col-span-full text-center py-20 text-gray-500">No files in this share</div>
              ) : (
                files.map((file) => {
                  const fileName = getFileName(file.file_path);
                  const posterUrl = `/api/share/${shareId}/thumb?path=${encodeURIComponent(
                    file.file_path
                  )}&t=0&token=${encodeURIComponent(jwt || '')}`;
                  const durationStr = formatTime(file.duration_seconds || 0);
                  const resLabel = getResolutionLabel(file.height || 0);
                  const mbps = file.bitrate ? (file.bitrate / 1_000_000).toFixed(1) : '—';
                  const isLoading = file.scan_status === 'pending';

                  return (
                    <div
                      key={file.id}
                      onClick={() => handleCardClick(file)}
                      className={`group rounded-lg border border-gray-800 bg-gray-900 hover:border-accent overflow-hidden transition-all ${
                        isLoading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                      }`}
                    >
                      <div className="aspect-video relative bg-gray-800">
                        <img
                          src={posterUrl}
                          alt={fileName}
                          loading="lazy"
                          className="absolute inset-0 w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-4xl drop-shadow">▶</span>
                        </div>
                        {isLoading && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                            <span className="animate-spin text-2xl">↻</span>
                          </div>
                        )}
                      </div>
                      <div className="px-3 py-3">
                        <p className="text-sm text-gray-200 truncate mb-1" title={fileName}>
                          {fileName}
                        </p>
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>{durationStr}</span>
                          <span>
                            {resLabel} · {mbps}Mbps
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* PLAYER VIEW */}
        {view === 'player' && (
          <div
            ref={viewportRef}
            className="flex-1 bg-black overflow-hidden relative"
          >
            <video ref={videoRef} className="w-full h-full object-contain" />

            {/* Back button */}
            <button
              onClick={backToGrid}
              className="absolute top-3 left-3 z-40 flex items-center gap-1.5 px-2.5 py-1.5 bg-black/60 hover:bg-black/90 rounded-lg text-xs text-gray-400 hover:text-gray-100 backdrop-blur-sm transition-all border border-gray-700/50 hover:border-gray-600"
              title="Back to files (Esc)"
            >
              ← Files
            </button>

            {/* Info Panel */}
            <div
              className={`absolute top-4 right-4 bottom-16 w-80 bg-black/80 backdrop-blur-sm rounded-xl border border-gray-700 overflow-y-auto z-50 ${
                infoVisible ? 'flex flex-col' : 'hidden'
              } text-xs font-mono`}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
                <span className="text-sm font-semibold text-gray-100 font-sans">Media Info</span>
                <button
                  onClick={() => setInfoVisible(false)}
                  className="text-gray-500 hover:text-gray-200 transition-colors"
                >
                  ✕
                </button>
              </div>
              <div className="px-4 py-3 space-y-4 overflow-y-auto" dangerouslySetInnerHTML={{ __html: infoHtml }} />
            </div>

            {/* Controls Overlay */}
            <div
              className={`absolute bottom-0 left-0 right-0 transition-opacity duration-300 bg-gradient-to-t from-black/90 to-transparent px-5 pt-16 pb-5 ${
                controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              {/* Seekbar */}
              <div className="flex flex-col gap-1 mb-3">
                <div
                  className="w-full h-0.5 hover:h-[4px] bg-gray-600/40 rounded cursor-pointer relative transition-all"
                  onClick={handleSeekClick}
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-gray-500/50 rounded pointer-events-none"
                    style={{ width: `${bufferedPct}%` }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 rounded pointer-events-none"
                    style={{ background: '#e5a00d', width: `${progressPct}%` }}
                  />
                </div>
                <div className="text-xs text-gray-400 tabular-nums">
                  <span>{currentTimeStr}</span>
                  <span className="text-gray-600"> / </span>
                  <span>{totalTimeStr}</span>
                </div>
              </div>

              {/* Controls Row */}
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    if (videoRef.current) {
                      if (videoRef.current.paused) videoRef.current.play();
                      else videoRef.current.pause();
                    }
                  }}
                  className="text-gray-100 hover:text-accent text-xl transition-colors p-1"
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>

                {/* Quality pill */}
                <div className="relative">
                  <button
                    onClick={() => setQualityPopoverOpen((v) => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-xs text-gray-100 hover:border-accent transition-colors cursor-pointer"
                  >
                    <span>{quality === 'source' ? sourceResLabel : quality}</span>
                    <span className="text-gray-500">▾</span>
                  </button>
                  {qualityPopoverOpen && (
                    <div className="absolute bottom-full left-0 mb-1 bg-gray-900 border border-gray-700 rounded-lg overflow-hidden z-50 min-w-max shadow-2xl">
                      <div
                        onClick={() => changeQuality('source')}
                        className="px-3 py-2.5 cursor-pointer text-xs text-gray-950 border-b border-gray-800 last:border-0 hover:opacity-80 transition-colors font-semibold bg-accent hover:bg-amber-400"
                      >
                        Source — {sourceResLabel} · {sourceMbps} Mbps
                      </div>
                      {filteredTiers.map((tier) => (
                        <div
                          key={tier.key}
                          onClick={() => changeQuality(tier.key)}
                          className="px-3 py-2.5 cursor-pointer text-xs text-gray-100 border-b border-gray-800 last:border-0 hover:bg-gray-800 transition-colors"
                        >
                          {tier.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={toggleVolumeMute}
                  className="text-gray-100 hover:text-accent text-lg transition-colors p-1"
                >
                  {isMuted ? '🔇' : '🔊'}
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="w-20 h-0.5 cursor-pointer bg-gray-600/40 rounded appearance-none"
                />

                <span className="flex-1" />

                <button
                  onClick={() => setInfoVisible((v) => !v)}
                  className="text-gray-400 hover:text-accent text-base transition-colors p-1"
                  title="Media info (I)"
                >
                  ⓘ
                </button>

                <button
                  onClick={downloadFile}
                  className="text-gray-400 hover:text-accent text-lg transition-colors p-1"
                  title="Download original file"
                >
                  ↓
                </button>

                <button
                  onClick={toggleFullscreen}
                  className="text-gray-100 hover:text-accent text-lg transition-colors p-1"
                >
                  ⛶
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
