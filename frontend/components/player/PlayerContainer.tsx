'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { usePlayerContext } from '@/context/PlayerContext';
import { useLutContext } from '@/context/LutContext';
import { formatTime, getResolutionLabel } from '@/lib/utils';

// SVG Icon components
const IconPlay = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const IconPause = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </svg>
);

const IconStop = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" />
  </svg>
);

const IconVolumeHigh = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.26 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
  </svg>
);

const IconVolumeMute = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M16.6915026,16.4744748 L3.50612381,3.40206348 L1.15159189,5.72513399 L3.34111861,7.8846814 L3.34111861,17 C3.34111861,18.1045695 4.24547152,19 5.35044864,19 L13.5253407,19 C14.0152284,19 14.4859089,18.8393171 14.8703704,18.5821394 L15.0152284,18.6744749 L16.6915026,16.4744748 Z M20.8035549,15.0151496 L19.1272806,12.8151495 C19.6563168,12.0722284 20,11.1244748 20,10.1067227 C20,7.90190751 18.6563168,6.05394527 16.8733832,5.30512821 L16.8733832,10.1067227 C16.8733832,10.4744747 16.6915026,10.8422267 16.3286814,11.1544748 L16.4563168,11.2895906 L20.8035549,15.0151496 Z M1,10.1067227 L1,13.0396851 L4.43213296,13.0396851 L10.8733832,19.3993289 L10.8733832,3.82405901 L4.43213296,3.82405901 L1,10.1067227 Z" />
  </svg>
);

const IconFullscreen = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
  </svg>
);

const IconInfo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
  </svg>
);

const IconLUT = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="8" cy="8" r="4" opacity="0.7" />
    <circle cx="16" cy="8" r="4" opacity="0.7" />
    <circle cx="12" cy="14" r="4" opacity="0.7" />
  </svg>
);

const IconSkipForward = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M15 6H9v12h6V6zm4-3v18h2V3h-2z" />
  </svg>
);

const IconSkipBack = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M9 18h6V6H9v12zm-4-15v18h2V3H5z" />
  </svg>
);

export default function PlayerContainer() {
  const {
    isVisible,
    filePath,
    quality,
    probeData,
    capabilities,
    transcodeStats,
    videoRef,
    canvasRef,
    stopPlayback,
    changeQuality,
    changeLut,
  } = usePlayerContext();

  const { availableLuts, activeLutId, lutMode, setLutMode, lutStrength, setLutStrength, applyLut, clearLut } = useLutContext();

  // Local state
  const [isPlaying, setIsPlaying] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [infoVisible, setInfoVisible] = useState(false);
  const [infoHtml, setInfoHtml] = useState('');
  const [qualityPopoverOpen, setQualityPopoverOpen] = useState(false);
  const [lutDropdownOpen, setLutDropdownOpen] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [bufferedPct, setBufferedPct] = useState(0);
  const [currentTimeStr, setCurrentTimeStr] = useState('0:00');
  const [totalTimeStr, setTotalTimeStr] = useState('0:00');
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [playPauseFlash, setPlayPauseFlash] = useState<'play' | 'pause' | null>(null);

  // Refs for avoiding stale closures
  const viewportRef = useRef<HTMLDivElement>(null);
  const controlsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = useRef(false);
  const qualityPopoverOpenRef = useRef(false);
  const infoVisibleRef = useRef(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync refs to state
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => {
    qualityPopoverOpenRef.current = qualityPopoverOpen;
  }, [qualityPopoverOpen]);
  useEffect(() => {
    infoVisibleRef.current = infoVisible;
  }, [infoVisible]);

  // Computed values
  const { sourceResLabel, sourceMbps } = useMemo(() => {
    if (!probeData) return { sourceResLabel: 'Source', sourceMbps: '—' };
    return { sourceResLabel: getResolutionLabel(probeData.height), sourceMbps: (probeData.bitrate / 1_000_000).toFixed(1) };
  }, [probeData]);

  const qualityLabel = quality === 'source' ? sourceResLabel : quality;

  const filteredTiers = useMemo(() => {
    return capabilities?.bitrate_tiers?.filter((tier) => {
      if (probeData) {
        if (tier.max_height && tier.max_height > probeData.height) return false;
        if (tier.bitrate >= probeData.bitrate) return false;
      }
      return true;
    }) || [];
  }, [probeData, capabilities]);

  // Extract filename from path
  const filename = filePath ? filePath.split('/').pop() : 'Video';

  // Helper: format info section
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

  // Update info panel
  const updateInfoPanel = useCallback(() => {
    if (!infoVisibleRef.current) return;
    if (!videoRef.current) return;

    const v = videoRef.current;
    const q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : {};

    let bufferedSec = 0;
    if (v.buffered && v.buffered.length > 0) {
      bufferedSec = Number((v.buffered.end(v.buffered.length - 1) - v.currentTime).toFixed(1));
    }

    const encoderLabel = capabilities?.hardware?.h264_videotoolbox
      ? 'VideoToolbox'
      : capabilities?.hardware?.h264_nvenc
        ? 'NVENC'
        : capabilities?.hardware?.h264_qsv
          ? 'QSV'
          : capabilities?.hardware?.h264_vaapi
            ? 'VAAPI'
            : 'libx264 (software)';

    const container = filePath ? filePath.split('.').pop()?.toUpperCase() : '—';
    const sourceMbpsStr = probeData ? (probeData.bitrate / 1_000_000).toFixed(1) + ' Mbps' : '—';
    const sourceRes = probeData ? `${probeData.width}×${probeData.height}` : '—';
    const srcCodec = probeData?.video_codec?.toUpperCase() || '—';
    const srcBitDepth = probeData?.bit_depth ? `${probeData.bit_depth}-bit` : '—';
    const srcAudioCodec = probeData?.audio_codec?.toUpperCase() || '—';
    const srcPixFmt = probeData?.pix_fmt || '—';
    const isDirectCopy = quality === 'source';
    const tgtVideoCodec = isDirectCopy ? srcCodec : 'H.264 (AVC)';
    const tgtBitDepth = isDirectCopy ? srcBitDepth : '8-bit';
    const tgtAudioCodec = isDirectCopy ? srcAudioCodec : 'AAC';
    const tgtPixFmt = isDirectCopy ? srcPixFmt : 'yuv420p';

    const sections = [
      formatInfoSection('Player', [
        ['Play method', quality === 'source' ? 'Direct copy' : 'Transcoded HLS'],
        ['Quality', quality === 'source' ? sourceResLabel : quality],
        ['Encoder', quality === 'source' ? 'Copy (no encode)' : encoderLabel],
        ['Segment length', '6s'],
        ['Transcode FPS', transcodeStats.fps ? `${transcodeStats.fps.toFixed(0)} fps` : '—'],
        ['Speed', transcodeStats.speed ? `${transcodeStats.speed.toFixed(2)}x real-time` : '—'],
      ]),
      formatInfoSection('Video (live)', [
        ['Dimensions', `${v.videoWidth}×${v.videoHeight}`],
        ['Current time', formatTime(v.currentTime)],
        ['Buffered ahead', `${bufferedSec}s`],
        ['Dropped frames', (q as VideoPlaybackQuality).droppedVideoFrames ?? '—'],
      ]),
      formatInfoSection('Codecs', [
        ['Source video', `${srcCodec} · ${srcBitDepth}`],
        ['Source audio', srcAudioCodec],
        ['Source pixel fmt', srcPixFmt],
        ['Output video', `${tgtVideoCodec} · ${tgtBitDepth}`],
        ['Output audio', tgtAudioCodec],
        ['Output pixel fmt', tgtPixFmt],
      ]),
      formatInfoSection('Original Media', [
        ['Container', container || '—'],
        ['Resolution', sourceRes],
        ['Bitrate', sourceMbpsStr],
        ['Duration', probeData ? formatTime(probeData.duration_seconds) : '—'],
      ]),
    ];

    setInfoHtml(sections.join(''));
  }, [filePath, quality, probeData, capabilities, transcodeStats, videoRef, sourceResLabel]);

  // Update time display
  const updateTimeDisplay = useCallback(() => {
    if (!videoRef.current) return;
    setCurrentTimeStr(formatTime(videoRef.current.currentTime));
    setTotalTimeStr(formatTime(videoRef.current.duration));
  }, []);

  // Update seekbar
  const updateSeekBar = useCallback(() => {
    if (!videoRef.current?.duration) return;
    setProgressPct((videoRef.current.currentTime / videoRef.current.duration) * 100);
  }, []);

  // Update buffered range
  const updateBufferedRange = useCallback(() => {
    if (!videoRef.current?.buffered || videoRef.current.buffered.length === 0) return;
    const end = videoRef.current.buffered.end(videoRef.current.buffered.length - 1);
    const pct = videoRef.current.duration ? (end / videoRef.current.duration) * 100 : 0;
    setBufferedPct(pct);
  }, []);

  // Show controls
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsHideTimerRef.current) {
      clearTimeout(controlsHideTimerRef.current);
      controlsHideTimerRef.current = null;
    }
    if (isPlayingRef.current) {
      scheduleControlsHide();
    }
  }, []);

  // Schedule controls hide (3 seconds)
  const scheduleControlsHide = useCallback(() => {
    controlsHideTimerRef.current = setTimeout(() => {
      if (isPlayingRef.current && !qualityPopoverOpenRef.current) {
        setControlsVisible(false);
      }
    }, 3000);
  }, []);

  // Video event listeners
  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;

    const onPlay = () => {
      setIsPlaying(true);
      setPlayPauseFlash('play');
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setPlayPauseFlash(null), 300);
      showControls();
    };
    const onPause = () => {
      setIsPlaying(false);
      setPlayPauseFlash('pause');
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setPlayPauseFlash(null), 300);
      showControls();
    };
    const onTimeUpdate = () => {
      updateTimeDisplay();
      updateSeekBar();
      updateInfoPanel();
    };
    const onLoadedMetadata = () => {
      updateTimeDisplay();
    };
    const onProgress = () => {
      updateBufferedRange();
    };
    const onWaiting = () => {
      setIsBuffering(true);
    };
    const onCanPlay = () => {
      setIsBuffering(false);
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('progress', onProgress);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
    };
  }, [showControls, updateTimeDisplay, updateSeekBar, updateBufferedRange, updateInfoPanel]);

  // Controls auto-hide on mousemove/mouseleave
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onMove = () => showControls();
    const onLeave = () => {
      if (isPlayingRef.current) {
        scheduleControlsHide();
      }
    };

    viewport.addEventListener('mousemove', onMove);
    viewport.addEventListener('mouseleave', onLeave);

    return () => {
      viewport.removeEventListener('mousemove', onMove);
      viewport.removeEventListener('mouseleave', onLeave);
    };
  }, [showControls, scheduleControlsHide]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (!filePath) return;

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
        case '?':
          e.preventDefault();
          setHelpVisible((v) => !v);
          break;
        case 'escape':
          stopPlayback();
          break;
        case 'arrowleft':
          if (video) {
            video.currentTime = Math.max(0, video.currentTime - 10);
          }
          break;
        case 'arrowright':
          if (video) {
            video.currentTime = Math.min(video.duration, video.currentTime + 10);
          }
          break;
      }
    };

    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
    };
  }, [filePath, stopPlayback, videoRef]);

  // Handlers
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

  // JSX
  return (
    <div
      id="playerContainer"
      className="flex flex-col h-screen bg-black"
      style={{ display: isVisible ? 'flex' : 'none' }}
    >
      <div id="videoViewport" ref={viewportRef} className="relative flex-1 bg-black overflow-hidden">
        <video ref={videoRef} className="w-full h-full object-contain" style={{ visibility: lutMode === 'client' && activeLutId ? 'hidden' : 'visible' }} />

        {/* WebGL canvas for client-side LUT */}
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            maxWidth: '100%',
            maxHeight: '100%',
            width: 'auto',
            height: 'auto',
            display: lutMode === 'client' && activeLutId ? 'block' : 'none',
            pointerEvents: 'none',
          }}
        />

        {/* Title bar */}
        <div className={`absolute top-0 left-0 right-0 px-5 py-4 text-center bg-gradient-to-b from-black/60 to-transparent transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0'}`}>
          <h3 className="text-gray-100 text-sm font-medium truncate">{filename}</h3>
        </div>

        {/* Back button */}
        <button
          onClick={stopPlayback}
          className="absolute top-3 left-3 z-40 flex items-center gap-1.5 px-2.5 py-1.5 bg-black/60 hover:bg-black/90 rounded-lg text-xs text-gray-400 hover:text-gray-100 backdrop-blur-sm transition-all border border-gray-700/50 hover:border-gray-600"
          title="Back (Esc)"
        >
          ← Library
        </button>

        {/* Play/Pause flash overlay */}
        {playPauseFlash && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ animation: 'fadeOut 0.3s ease-out' }}>
            <div className="text-amber-500 text-8xl opacity-60">
              {playPauseFlash === 'play' ? <IconPlay /> : <IconPause />}
            </div>
          </div>
        )}

        {/* Buffering spinner */}
        {isBuffering && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/40">
            <div className="w-12 h-12 border-4 border-gray-700 border-t-amber-500 rounded-full animate-spin" />
          </div>
        )}

        {/* Info Panel */}
        <div className={`absolute top-4 right-4 bottom-16 w-80 bg-black/80 backdrop-blur-sm rounded-xl border border-gray-700 overflow-y-auto z-50 flex flex-col text-xs font-mono ${infoVisible ? 'flex' : 'hidden'}`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
            <span className="text-sm font-semibold text-gray-100 font-sans">Playback Info</span>
            <button onClick={() => setInfoVisible(false)} className="text-gray-500 hover:text-gray-200 transition-colors">
              ✕
            </button>
          </div>
          <div className="px-4 py-3 space-y-4 overflow-y-auto" dangerouslySetInnerHTML={{ __html: infoHtml }} />
        </div>

        {/* Keyboard shortcuts help */}
        {helpVisible && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-gray-900 rounded-2xl border border-gray-700 p-8 max-w-sm">
              <h3 className="text-gray-100 font-semibold mb-4 text-base">Keyboard Shortcuts</h3>
              <div className="space-y-2 text-sm text-gray-300">
                <div className="flex justify-between">
                  <span>Space</span>
                  <span className="text-gray-500">Play/Pause</span>
                </div>
                <div className="flex justify-between">
                  <span>F</span>
                  <span className="text-gray-500">Fullscreen</span>
                </div>
                <div className="flex justify-between">
                  <span>M</span>
                  <span className="text-gray-500">Mute</span>
                </div>
                <div className="flex justify-between">
                  <span>I</span>
                  <span className="text-gray-500">Info</span>
                </div>
                <div className="flex justify-between">
                  <span>← / →</span>
                  <span className="text-gray-500">±10 seconds</span>
                </div>
                <div className="flex justify-between">
                  <span>Esc</span>
                  <span className="text-gray-500">Stop</span>
                </div>
                <div className="flex justify-between">
                  <span>?</span>
                  <span className="text-gray-500">Help</span>
                </div>
              </div>
              <button
                onClick={() => setHelpVisible(false)}
                className="mt-6 w-full px-4 py-2 bg-amber-500 text-stone-950 font-semibold rounded-lg hover:bg-amber-400 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Controls Overlay */}
        <div
          className={`absolute bottom-0 left-0 right-0 transition-opacity duration-300 bg-gradient-to-t from-black/90 to-transparent px-5 pt-16 pb-5 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
          {/* Seekbar */}
          <div className="flex flex-col gap-1 mb-4">
            <div
              className="w-full h-1 hover:h-1.5 bg-gray-600/40 rounded-full cursor-pointer relative transition-all group"
              onClick={handleSeekClick}
            >
              <div className="absolute inset-y-0 left-0 bg-gray-500/50 rounded-full pointer-events-none" style={{ width: `${bufferedPct}%` }} />
              <div className="absolute inset-y-0 left-0 rounded-full pointer-events-none" style={{ background: '#e5a00d', width: `${progressPct}%` }} />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-amber-500 rounded-full shadow-lg hidden group-hover:block"
                style={{ left: `${progressPct}%`, transform: 'translate(-50%, -50%)' }}
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
            {/* Left group: play, skip */}
            <button
              onClick={() => {
                if (videoRef.current) {
                  if (videoRef.current.paused) videoRef.current.play();
                  else videoRef.current.pause();
                }
              }}
              className="text-gray-100 hover:text-amber-400 text-xl transition-colors p-1 w-7 h-7 flex items-center justify-center"
              title="Play/Pause (Space)"
            >
              {isPlaying ? <IconPause /> : <IconPlay />}
            </button>

            <button
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
                }
              }}
              className="text-gray-400 hover:text-amber-400 text-lg transition-colors p-1 w-7 h-7 flex items-center justify-center"
              title="Skip back 10s"
            >
              <IconSkipBack />
            </button>

            <button
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.currentTime = Math.min(videoRef.current.duration, videoRef.current.currentTime + 10);
                }
              }}
              className="text-gray-400 hover:text-amber-400 text-lg transition-colors p-1 w-7 h-7 flex items-center justify-center"
              title="Skip forward 10s"
            >
              <IconSkipForward />
            </button>

            {/* Quality pill */}
            <div className="relative">
              <button
                onClick={() => setQualityPopoverOpen((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-xs text-gray-100 hover:border-amber-500 transition-colors cursor-pointer"
                title="Change quality"
              >
                <span>{qualityLabel}</span>
                <span className="text-gray-500 text-xs">▾</span>
              </button>
              {qualityPopoverOpen && (
                <div className="absolute bottom-full left-0 mb-1 bg-gray-900 border border-gray-700 rounded-lg overflow-hidden z-50 min-w-max shadow-2xl">
                  <div
                    onClick={() => {
                      setQualityPopoverOpen(false);
                      changeQuality('source');
                    }}
                    className="px-3 py-2.5 cursor-pointer text-xs border-b border-gray-800 last:border-0 hover:opacity-80 transition-colors font-semibold"
                    style={{ background: '#e5a00d', color: '#0d0d0d' }}
                  >
                    Source — {sourceResLabel} · {sourceMbps} Mbps
                  </div>
                  {filteredTiers.map((tier) => (
                    <div
                      key={tier.key}
                      onClick={() => {
                        setQualityPopoverOpen(false);
                        changeQuality(tier.key);
                      }}
                      className="px-3 py-2.5 cursor-pointer text-xs text-gray-100 border-b border-gray-800 last:border-0 hover:bg-gray-800 transition-colors"
                    >
                      {tier.label}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Volume */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleVolumeMute}
                className="text-gray-100 hover:text-amber-400 text-lg transition-colors p-1 w-7 h-7 flex items-center justify-center"
                title="Mute (M)"
              >
                {isMuted ? <IconVolumeMute /> : <IconVolumeHigh />}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 cursor-pointer bg-gray-600/40 rounded-full appearance-none"
                title="Volume"
              />
              <span className="text-xs text-gray-400 w-6 text-right">{volume}%</span>
            </div>

            <span className="flex-1" />

            {/* Right group: info, lut, fullscreen, stop */}
            <button
              onClick={() => setInfoVisible((v) => !v)}
              className="text-gray-400 hover:text-amber-400 text-lg transition-colors p-1 w-7 h-7 flex items-center justify-center"
              title="Info (I)"
            >
              <IconInfo />
            </button>

            <div className="relative">
              <button
                onClick={() => setLutDropdownOpen((v) => !v)}
                className={`transition-colors p-1 w-7 h-7 flex items-center justify-center text-lg ${activeLutId ? 'text-amber-400' : 'text-gray-400 hover:text-amber-400'}`}
                title="LUT (Color grading)"
              >
                <IconLUT />
              </button>
              {lutDropdownOpen && (
                <div className="absolute bottom-full right-0 mb-1 bg-gray-900 border border-gray-700 rounded-lg overflow-hidden z-50 min-w-max shadow-2xl">
                  {/* Mode Toggle Pills */}
                  <div className="flex gap-1 p-2 border-b border-gray-800 bg-gray-800/50">
                    <button
                      onClick={() => {
                        setLutMode('client');
                        if (activeLutId) {
                          changeLut(activeLutId);
                        }
                      }}
                      className={`px-2.5 py-1 text-xs rounded transition-colors ${
                        lutMode === 'client' ? 'bg-amber-400/30 text-amber-300 border border-amber-400/50' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                    >
                      Client
                    </button>
                    <button
                      onClick={() => {
                        setLutMode('server');
                        if (activeLutId) {
                          changeLut(activeLutId);
                        }
                      }}
                      className={`px-2.5 py-1 text-xs rounded transition-colors ${
                        lutMode === 'server' ? 'bg-amber-400/30 text-amber-300 border border-amber-400/50' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                    >
                      Server
                    </button>
                  </div>

                  {/* Strength Slider */}
                  {lutMode === 'client' && activeLutId && (
                    <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-2">
                      <label className="text-xs text-gray-400 whitespace-nowrap">Strength:</label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={lutStrength}
                        onChange={(e) => setLutStrength(parseFloat(e.target.value))}
                        className="w-20 h-1 bg-gray-600 rounded-full appearance-none cursor-pointer"
                      />
                      <span className="text-xs text-gray-400 w-8 text-right">{lutStrength.toFixed(2)}</span>
                    </div>
                  )}

                  {/* LUT Selection */}
                  <div
                    onClick={() => {
                      clearLut();
                      changeLut(null);
                      setLutDropdownOpen(false);
                    }}
                    className="px-3 py-2.5 cursor-pointer text-xs text-gray-400 hover:bg-gray-800 border-b border-gray-800"
                  >
                    None
                  </div>
                  {availableLuts.map((lut) => (
                    <div
                      key={lut.id}
                      onClick={() => {
                        applyLut(lut.id);
                        changeLut(lut.id);
                        setLutDropdownOpen(false);
                      }}
                      className={`px-3 py-2.5 cursor-pointer text-xs border-b border-gray-800 last:border-0 hover:bg-gray-800 ${
                        activeLutId === lut.id ? 'text-amber-400' : 'text-gray-100'
                      }`}
                    >
                      {lut.name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={toggleFullscreen}
              className="text-gray-100 hover:text-amber-400 text-lg transition-colors p-1 w-7 h-7 flex items-center justify-center"
              title="Fullscreen (F)"
            >
              <IconFullscreen />
            </button>

            <button
              onClick={stopPlayback}
              className="text-gray-400 hover:text-amber-400 text-lg transition-colors p-1 w-7 h-7 flex items-center justify-center"
              title="Stop (Esc)"
            >
              <IconStop />
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeOut {
          from { opacity: 0.6; transform: scale(1); }
          to { opacity: 0; transform: scale(1.1); }
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 10px;
          height: 10px;
          background: #e5a00d;
          border-radius: 50%;
          cursor: pointer;
        }
        input[type="range"]::-moz-range-thumb {
          width: 10px;
          height: 10px;
          background: #e5a00d;
          border-radius: 50%;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  );
}
