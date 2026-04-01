'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { usePlayerContext } from '@/context/PlayerContext';
import { useLutContext } from '@/context/LutContext';
import { formatTime, getResolutionLabel } from '@/lib/utils';

// ── Icons ─────────────────────────────────────────────────────────────────────

const IconPlay = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
);
const IconPause = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
);
const IconReplay10 = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
    <text x="12" y="15.5" textAnchor="middle" fontSize="5.5" fontWeight="bold" fill="currentColor">10</text>
  </svg>
);
const IconForward10 = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>
    <text x="12" y="15.5" textAnchor="middle" fontSize="5.5" fontWeight="bold" fill="currentColor">10</text>
  </svg>
);
const IconVolumeHigh = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.26 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
);
const IconVolumeLow = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M18.5 12A4.5 4.5 0 0 0 16 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" /></svg>
);
const IconVolumeOff = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a9 9 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" /></svg>
);
const IconFullscreen = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" /></svg>
);
const IconExitFullscreen = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" /></svg>
);
const IconInfo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" /></svg>
);
const IconLUT = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="8" cy="8" r="4" opacity="0.7" />
    <circle cx="16" cy="8" r="4" opacity="0.7" />
    <circle cx="12" cy="14" r="4" opacity="0.7" />
  </svg>
);

// ── Component ─────────────────────────────────────────────────────────────────

export default function PlayerContainer() {
  const {
    isVisible, filePath, quality, probeData, capabilities, transcodeStats,
    videoRef, canvasRef, stopPlayback, changeQuality, changeLut,
  } = usePlayerContext();

  const { availableLuts, activeLutId, lutMode, setLutMode, lutStrength, setLutStrength, applyLut, clearLut, fileLutPref } = useLutContext();

  // ── State ──────────────────────────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
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
  const [seekTooltip, setSeekTooltip] = useState<{ pct: number; time: string } | null>(null);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const viewportRef = useRef<HTMLDivElement>(null);
  const controlsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = useRef(false);
  const qualityPopoverOpenRef = useRef(false);
  const infoVisibleRef = useRef(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qualityRef = useRef<HTMLDivElement>(null);
  const lutRef = useRef<HTMLDivElement>(null);

  // ── Sync refs ──────────────────────────────────────────────────────────────
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { qualityPopoverOpenRef.current = qualityPopoverOpen; }, [qualityPopoverOpen]);
  useEffect(() => { infoVisibleRef.current = infoVisible; }, [infoVisible]);

  // ── Computed ───────────────────────────────────────────────────────────────
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

  const filename = filePath ? filePath.split('/').pop() : 'Video';

  // ── Info panel helper ──────────────────────────────────────────────────────
  function formatInfoSection(title: string, rows: [string, string | number | null | undefined][]): string {
    const items = rows.map(([k, v]) =>
      `<div class="flex justify-between gap-2 py-0.5"><span class="text-gray-500 shrink-0">${k}</span><span class="text-gray-200 text-right truncate">${v ?? '—'}</span></div>`
    ).join('');
    return `<div><div class="text-gray-400 font-sans font-semibold text-xs mb-1.5 uppercase tracking-wider">${title}</div><div class="space-y-0.5">${items}</div></div>`;
  }

  // ── Update info panel ──────────────────────────────────────────────────────
  const updateInfoPanel = useCallback(() => {
    if (!infoVisibleRef.current || !videoRef.current) return;
    const v = videoRef.current;
    const q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : {};
    let bufferedSec = 0;
    if (v.buffered && v.buffered.length > 0) {
      bufferedSec = Number((v.buffered.end(v.buffered.length - 1) - v.currentTime).toFixed(1));
    }
    const encoderLabel = capabilities?.hardware?.h264_videotoolbox ? 'VideoToolbox'
      : capabilities?.hardware?.h264_nvenc ? 'NVENC'
      : capabilities?.hardware?.h264_qsv ? 'QSV'
      : capabilities?.hardware?.h264_vaapi ? 'VAAPI'
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

  // ── Time / seekbar updates ─────────────────────────────────────────────────
  const updateTimeDisplay = useCallback(() => {
    if (!videoRef.current) return;
    setCurrentTimeStr(formatTime(videoRef.current.currentTime));
    setTotalTimeStr(formatTime(videoRef.current.duration));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateSeekBar = useCallback(() => {
    if (!videoRef.current?.duration) return;
    setProgressPct((videoRef.current.currentTime / videoRef.current.duration) * 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateBufferedRange = useCallback(() => {
    if (!videoRef.current?.buffered || videoRef.current.buffered.length === 0) return;
    const end = videoRef.current.buffered.end(videoRef.current.buffered.length - 1);
    const pct = videoRef.current.duration ? (end / videoRef.current.duration) * 100 : 0;
    setBufferedPct(pct);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Controls visibility ────────────────────────────────────────────────────
  const scheduleControlsHide = useCallback(() => {
    controlsHideTimerRef.current = setTimeout(() => {
      if (isPlayingRef.current && !qualityPopoverOpenRef.current) {
        setControlsVisible(false);
      }
    }, 3000);
  }, []);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsHideTimerRef.current) {
      clearTimeout(controlsHideTimerRef.current);
      controlsHideTimerRef.current = null;
    }
    if (isPlayingRef.current) scheduleControlsHide();
  }, [scheduleControlsHide]);

  // ── Video event listeners ──────────────────────────────────────────────────
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
    const onTimeUpdate = () => { updateTimeDisplay(); updateSeekBar(); updateInfoPanel(); };
    const onLoadedMetadata = () => updateTimeDisplay();
    const onProgress = () => updateBufferedRange();
    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => setIsBuffering(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showControls, updateTimeDisplay, updateSeekBar, updateBufferedRange, updateInfoPanel]);

  // ── Controls auto-hide ─────────────────────────────────────────────────────
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onMove = () => showControls();
    const onLeave = () => { if (isPlayingRef.current) scheduleControlsHide(); };
    viewport.addEventListener('mousemove', onMove);
    viewport.addEventListener('mouseleave', onLeave);
    return () => {
      viewport.removeEventListener('mousemove', onMove);
      viewport.removeEventListener('mouseleave', onLeave);
    };
  }, [showControls, scheduleControlsHide]);

  // ── Fullscreen state tracking ──────────────────────────────────────────────
  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // ── Click-outside to close popovers ───────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (qualityPopoverOpen && qualityRef.current && !qualityRef.current.contains(e.target as Node)) {
        setQualityPopoverOpen(false);
      }
      if (lutDropdownOpen && lutRef.current && !lutRef.current.contains(e.target as Node)) {
        setLutDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [qualityPopoverOpen, lutDropdownOpen]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!filePath) return;
      const video = videoRef.current;
      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          if (video) { if (video.paused) video.play(); else video.pause(); }
          break;
        case 'f': e.preventDefault(); toggleFullscreen(); break;
        case 'm': e.preventDefault(); toggleVolumeMute(); break;
        case 'i': e.preventDefault(); setInfoVisible((v) => !v); break;
        case '?': e.preventDefault(); setHelpVisible((v) => !v); break;
        case 'escape': stopPlayback(); break;
        case 'arrowleft': if (video) video.currentTime = Math.max(0, video.currentTime - 10); break;
        case 'arrowright': if (video) video.currentTime = Math.min(video.duration, video.currentTime + 10); break;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, stopPlayback, videoRef]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current?.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    videoRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * videoRef.current.duration;
  };

  const handleSeekHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current?.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setSeekTooltip({ pct: pct * 100, time: formatTime(pct * videoRef.current.duration) });
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    if (videoRef.current) videoRef.current.volume = val / 100;
    setIsMuted(val === 0);
  };

  const toggleVolumeMute = () => {
    if (!videoRef.current) return;
    if (videoRef.current.volume > 0) {
      videoRef.current.volume = 0; setVolume(0); setIsMuted(true);
    } else {
      videoRef.current.volume = 1; setVolume(100); setIsMuted(false);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) viewportRef.current?.requestFullscreen().catch(console.error);
    else document.exitFullscreen();
  };

  const VolumeIcon = isMuted || volume === 0 ? IconVolumeOff : volume < 50 ? IconVolumeLow : IconVolumeHigh;

  // ── JSX ────────────────────────────────────────────────────────────────────
  return (
    <div
      id="playerContainer"
      className="fixed inset-0 z-[9999] flex flex-col bg-black"
      style={{ display: isVisible ? 'flex' : 'none' }}
    >
      <div id="videoViewport" ref={viewportRef} className="relative flex-1 bg-black overflow-hidden">
        <video ref={videoRef} className="w-full h-full object-contain" style={{ visibility: lutMode === 'client' && activeLutId ? 'hidden' : 'visible' }} />

        {/* WebGL canvas */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: lutMode === 'client' && activeLutId ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', pointerEvents: 'none' }} />
        </div>

        {/* Top bar — close + title */}
        <div className={`absolute top-0 left-0 right-0 flex items-center gap-2.5 px-3 py-2.5 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0'}`}>
          <button
            onClick={stopPlayback}
            className="flex-shrink-0 h-7 w-7 flex items-center justify-center rounded-full bg-zinc-800/70 hover:bg-zinc-700/90 text-zinc-300 hover:text-white transition-colors"
            title="Close (Esc)"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
          <span className="text-zinc-300 text-sm font-medium truncate">{filename}</span>
        </div>

        {/* Play/Pause flash */}
        {playPauseFlash && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ animation: 'fadeOut 0.3s ease-out' }}>
            <div className="text-amber-500 opacity-60">
              {playPauseFlash === 'play' ? <IconPlay className="w-20 h-20" /> : <IconPause className="w-20 h-20" />}
            </div>
          </div>
        )}

        {/* Buffering spinner */}
        {isBuffering && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/40">
            <div className="w-12 h-12 border-4 border-zinc-700 border-t-amber-500 rounded-full animate-spin" />
          </div>
        )}

        {/* Info panel */}
        <div className={`absolute top-14 right-4 bottom-20 w-80 bg-zinc-950/90 backdrop-blur-sm rounded-xl border border-zinc-800 overflow-y-auto z-50 flex-col text-xs font-mono ${infoVisible ? 'flex' : 'hidden'}`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
            <span className="text-sm font-semibold text-zinc-100 font-sans">Playback Info</span>
            <button onClick={() => setInfoVisible(false)} className="text-zinc-500 hover:text-zinc-200 transition-colors">✕</button>
          </div>
          <div className="px-4 py-3 space-y-4 overflow-y-auto" dangerouslySetInnerHTML={{ __html: infoHtml }} />
        </div>

        {/* Keyboard help */}
        {helpVisible && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-zinc-900 rounded-2xl border border-zinc-700 p-8 max-w-sm w-full mx-4">
              <h3 className="text-zinc-100 font-semibold mb-4 text-base">Keyboard Shortcuts</h3>
              <div className="space-y-2 text-sm text-zinc-300">
                {[
                  ['Space', 'Play / Pause'],
                  ['← / →', '±10 seconds'],
                  ['F', 'Fullscreen'],
                  ['M', 'Mute'],
                  ['I', 'Debug info'],
                  ['Esc', 'Close player'],
                  ['?', 'This help'],
                ].map(([key, desc]) => (
                  <div key={key} className="flex justify-between">
                    <span className="font-mono text-zinc-200">{key}</span>
                    <span className="text-zinc-500">{desc}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setHelpVisible(false)}
                className="mt-6 w-full px-4 py-2 bg-amber-500 text-zinc-950 font-semibold rounded-lg hover:bg-amber-400 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* ── Controls bar ──────────────────────────────────────────────────── */}
        <div className={`absolute bottom-0 left-0 right-0 bg-zinc-950/55 backdrop-blur-md border-t border-primary/[0.07] [background-image:linear-gradient(to_top,hsl(var(--primary)/0.03),transparent)] px-4 pt-2 pb-3 transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>

          {/* Seekbar */}
          <div
            className="relative w-full h-3 flex items-center cursor-pointer group/seek"
            onClick={handleSeekClick}
            onMouseMove={handleSeekHover}
            onMouseLeave={() => setSeekTooltip(null)}
          >
            <div className="absolute inset-x-0 h-[3px] group-hover/seek:h-[5px] bg-zinc-700/60 rounded-full transition-[height] duration-150 overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-zinc-500/50 rounded-full" style={{ width: `${bufferedPct}%` }} />
              <div className="absolute inset-y-0 left-0 bg-amber-400 rounded-full" style={{ width: `${progressPct}%` }} />
            </div>
            <div
              className="absolute w-3 h-3 bg-amber-400 rounded-full shadow-md opacity-0 group-hover/seek:opacity-100 transition-opacity pointer-events-none"
              style={{ left: `${progressPct}%`, top: '50%', transform: 'translate(-50%, -50%)' }}
            />
            {seekTooltip !== null && (
              <div
                className="absolute bottom-5 -translate-x-1/2 px-1.5 py-0.5 bg-zinc-900/90 backdrop-blur-sm text-xs text-zinc-100 rounded pointer-events-none whitespace-nowrap border border-zinc-700/50"
                style={{ left: `${seekTooltip.pct}%` }}
              >
                {seekTooltip.time}
              </div>
            )}
          </div>

          {/* Button row */}
          <div className="flex items-center mt-2">

            {/* ── Left group ─────────────────────────────────────────────── */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => { if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10); }}
                className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white transition-colors rounded"
                title="Back 10s (←)"
              >
                <IconReplay10 className="w-5 h-5" />
              </button>

              <button
                onClick={() => { if (videoRef.current) { if (videoRef.current.paused) videoRef.current.play(); else videoRef.current.pause(); } }}
                className="w-9 h-9 flex items-center justify-center text-white hover:text-amber-400 transition-colors rounded"
                title="Play/Pause (Space)"
              >
                {isPlaying ? <IconPause className="w-6 h-6" /> : <IconPlay className="w-6 h-6" />}
              </button>

              <button
                onClick={() => { if (videoRef.current) videoRef.current.currentTime = Math.min(videoRef.current.duration, videoRef.current.currentTime + 10); }}
                className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white transition-colors rounded"
                title="Forward 10s (→)"
              >
                <IconForward10 className="w-5 h-5" />
              </button>

              {/* Volume — hover-expand */}
              <div className="group/vol flex items-center gap-1">
                <button
                  onClick={toggleVolumeMute}
                  className="w-8 h-8 flex items-center justify-center text-zinc-300 hover:text-white transition-colors rounded"
                  title="Mute (M)"
                >
                  <VolumeIcon className="w-5 h-5" />
                </button>
                <div className="w-0 overflow-hidden group-hover/vol:w-20 transition-[width] duration-200 ease-out">
                  <input
                    type="range" min="0" max="100" value={volume}
                    onChange={handleVolumeChange}
                    className="w-20 h-1 cursor-pointer accent-amber-400"
                    title="Volume"
                  />
                </div>
                <span className="w-0 overflow-hidden group-hover/vol:w-7 text-xs text-zinc-400 tabular-nums transition-[width] duration-200 text-right">
                  {volume}%
                </span>
              </div>

              <span className="ml-2 text-xs text-zinc-300 tabular-nums whitespace-nowrap">
                {currentTimeStr}
                <span className="text-zinc-600 mx-1">/</span>
                {totalTimeStr}
              </span>
            </div>

            <span className="flex-1" />

            {/* ── Right group ────────────────────────────────────────────── */}
            <div className="flex items-center gap-1">

              {/* LUT */}
              <div className="relative" ref={lutRef}>
                <button
                  onClick={() => setLutDropdownOpen((v) => !v)}
                  className={`w-8 h-8 flex items-center justify-center rounded transition-colors relative ${activeLutId ? 'text-amber-400' : 'text-zinc-400 hover:text-white'}`}
                  title="Color LUT"
                >
                  <IconLUT className="w-5 h-5" />
                  {activeLutId && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400" />}
                </button>
                {lutDropdownOpen && (
                  <div className="absolute bottom-full right-0 mb-2 bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden z-50 min-w-max shadow-2xl max-h-72 overflow-y-auto">
                    {/* Mode pills */}
                    <div className="flex gap-1 p-2 border-b border-zinc-800">
                      {(['client', 'server'] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => { setLutMode(mode); if (activeLutId) changeLut(activeLutId); }}
                          className={`px-2.5 py-1 text-xs rounded capitalize transition-colors ${lutMode === mode ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                    {/* Strength */}
                    {lutMode === 'client' && activeLutId && (
                      <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2">
                        <label className="text-xs text-zinc-400 whitespace-nowrap">Strength</label>
                        <input
                          type="range" min="0" max="1" step="0.01" value={lutStrength}
                          onChange={(e) => setLutStrength(parseFloat(e.target.value))}
                          className="w-20 h-1 cursor-pointer accent-amber-400"
                        />
                        <span className="text-xs text-zinc-400 w-8 text-right">{lutStrength.toFixed(2)}</span>
                      </div>
                    )}
                    {/* LUT list */}
                    {(() => {
                      const FOLDER_LABELS: Record<string, string> = { dji: 'DJI', nlog: 'N-Log', creative: 'Creative' };
                      const folderLabel = (f: string) => f.split('/').map((s) => FOLDER_LABELS[s] ?? s.charAt(0).toUpperCase() + s.slice(1)).join(' / ');
                      const lutsByFolder = availableLuts.reduce<Record<string, typeof availableLuts>>((acc, lut) => {
                        const key = lut.folder || 'other'; (acc[key] ??= []).push(lut); return acc;
                      }, {});
                      const preferredLut = fileLutPref ? availableLuts.find((l) => l.id === fileLutPref) : null;
                      return (
                        <>
                          {preferredLut && (
                            <>
                              <div className="px-3 py-1 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider bg-zinc-900 border-b border-zinc-800 select-none">★ Preferred</div>
                              <div onClick={() => { applyLut(preferredLut.id); changeLut(preferredLut.id); setLutDropdownOpen(false); }} className={`px-3 pl-5 py-2 cursor-pointer text-xs border-b border-zinc-800 hover:bg-zinc-800 ${activeLutId === preferredLut.id ? 'text-amber-400' : 'text-zinc-200'}`}>
                                {activeLutId === preferredLut.id ? '✓ ' : ''}{preferredLut.name}
                              </div>
                            </>
                          )}
                          <div onClick={() => { clearLut(); changeLut(null); setLutDropdownOpen(false); }} className="px-3 py-2 cursor-pointer text-xs text-zinc-400 hover:bg-zinc-800 border-b border-zinc-800">None</div>
                          {Object.entries(lutsByFolder).sort(([a], [b]) => a.localeCompare(b)).map(([folder, luts]) => (
                            <React.Fragment key={folder}>
                              <div className="px-3 py-1 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider bg-zinc-900 border-b border-zinc-800 select-none">{folderLabel(folder)}</div>
                              {luts.map((lut) => (
                                <div key={lut.id} onClick={() => { applyLut(lut.id); changeLut(lut.id); setLutDropdownOpen(false); }} className={`px-3 pl-5 py-2 cursor-pointer text-xs border-b border-zinc-800 last:border-0 hover:bg-zinc-800 ${activeLutId === lut.id ? 'text-amber-400' : 'text-zinc-200'}`}>
                                  {activeLutId === lut.id ? '✓ ' : ''}{lut.name}
                                </div>
                              ))}
                            </React.Fragment>
                          ))}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Quality */}
              <div className="relative" ref={qualityRef}>
                <button
                  onClick={() => setQualityPopoverOpen((v) => !v)}
                  className="flex items-center gap-1 px-2.5 h-7 bg-zinc-800/70 hover:bg-zinc-700/70 border border-zinc-700/60 hover:border-zinc-600 rounded text-xs text-zinc-200 transition-colors"
                  title="Change quality"
                >
                  {qualityLabel}
                  <svg className="w-3 h-3 text-zinc-500" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z" /></svg>
                </button>
                {qualityPopoverOpen && (
                  <div className="absolute bottom-full right-0 mb-2 bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden z-50 min-w-max shadow-2xl">
                    <div
                      onClick={() => { setQualityPopoverOpen(false); changeQuality('source'); }}
                      className="px-3 py-2.5 cursor-pointer text-xs border-b border-zinc-800 font-semibold bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors"
                    >
                      Source — {sourceResLabel} · {sourceMbps} Mbps
                    </div>
                    {filteredTiers.map((tier) => (
                      <div
                        key={tier.key}
                        onClick={() => { setQualityPopoverOpen(false); changeQuality(tier.key); }}
                        className="px-3 py-2.5 cursor-pointer text-xs text-zinc-200 border-b border-zinc-800 last:border-0 hover:bg-zinc-800 transition-colors"
                      >
                        {tier.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Info toggle */}
              <button
                onClick={() => setInfoVisible((v) => !v)}
                className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${infoVisible ? 'text-amber-400' : 'text-zinc-400 hover:text-white'}`}
                title="Debug info (I)"
              >
                <IconInfo className="w-5 h-5" />
              </button>

              {/* Fullscreen */}
              <button
                onClick={toggleFullscreen}
                className="w-8 h-8 flex items-center justify-center text-zinc-300 hover:text-white rounded transition-colors"
                title="Fullscreen (F)"
              >
                {isFullscreen ? <IconExitFullscreen className="w-5 h-5" /> : <IconFullscreen className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
