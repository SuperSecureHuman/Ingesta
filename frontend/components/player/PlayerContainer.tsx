'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { usePlayerContext } from '@/context/PlayerContext';
import { formatTime } from '@/lib/utils';

export default function PlayerContainer() {
  const {
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
  } = usePlayerContext();

  // Local state
  const [isPlaying, setIsPlaying] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [infoVisible, setInfoVisible] = useState(false);
  const [infoHtml, setInfoHtml] = useState('');
  const [qualityPopoverOpen, setQualityPopoverOpen] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [bufferedPct, setBufferedPct] = useState(0);
  const [currentTimeStr, setCurrentTimeStr] = useState('0:00');
  const [totalTimeStr, setTotalTimeStr] = useState('0:00');
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);

  // Refs for avoiding stale closures
  const viewportRef = useRef<HTMLDivElement>(null);
  const controlsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const isPlayingRef = useRef(false);
  const qualityPopoverOpenRef = useRef(false);
  const infoVisibleRef = useRef(false);

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

  // Computed values with memoization
  const { sourceResLabel, sourceMbps } = useMemo(() => {
    if (!probeData) return { sourceResLabel: 'Source', sourceMbps: '—' };
    const h = probeData.height;
    const label = h >= 2160 ? '4K' : h >= 1440 ? '1440p' : h >= 1080 ? '1080p' : h >= 720 ? '720p' : `${h}p`;
    return { sourceResLabel: label, sourceMbps: (probeData.bitrate / 1_000_000).toFixed(1) };
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

  // Helper: format info section
  function formatInfoSection(
    title: string,
    rows: [string, string | number | null | undefined][]
  ): string {
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
      bufferedSec = Number(
        (v.buffered.end(v.buffered.length - 1) - v.currentTime).toFixed(1)
      );
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

    const container = filePath
      ? filePath.split('.').pop()?.toUpperCase()
      : '—';
    const sourceMbpsStr = probeData
      ? (probeData.bitrate / 1_000_000).toFixed(1) + ' Mbps'
      : '—';
    const sourceRes = probeData
      ? `${probeData.width}×${probeData.height}`
      : '—';
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
        [
          'Play method',
          quality === 'source' ? 'Direct copy' : 'Transcoded HLS',
        ],
        ['Quality', quality === 'source' ? sourceResLabel : quality],
        [
          'Encoder',
          quality === 'source' ? 'Copy (no encode)' : encoderLabel,
        ],
        ['Segment length', '6s'],
        [
          'Transcode FPS',
          transcodeStats.fps ? `${transcodeStats.fps.toFixed(0)} fps` : '—',
        ],
        [
          'Speed',
          transcodeStats.speed
            ? `${transcodeStats.speed.toFixed(2)}x real-time`
            : '—',
        ],
      ]),
      formatInfoSection('Video (live)', [
        ['Dimensions', `${v.videoWidth}×${v.videoHeight}`],
        ['Current time', formatTime(v.currentTime)],
        ['Buffered ahead', `${bufferedSec}s`],
        ['Dropped frames', (q as any).droppedVideoFrames ?? '—'],
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
  }, [filePath, quality, probeData, capabilities, transcodeStats, videoRef]);

  // Update time display
  const updateTimeDisplay = useCallback(() => {
    if (!videoRef.current) return;
    setCurrentTimeStr(formatTime(videoRef.current.currentTime));
    setTotalTimeStr(formatTime(videoRef.current.duration));
  }, []);

  // Update seekbar
  const updateSeekBar = useCallback(() => {
    if (!videoRef.current?.duration) return;
    setProgressPct(
      (videoRef.current.currentTime / videoRef.current.duration) * 100
    );
  }, []);

  // Update buffered range
  const updateBufferedRange = useCallback(() => {
    if (!videoRef.current?.buffered || videoRef.current.buffered.length === 0)
      return;
    const end = videoRef.current.buffered.end(
      videoRef.current.buffered.length - 1
    );
    const pct = videoRef.current.duration
      ? (end / videoRef.current.duration) * 100
      : 0;
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
      showControls();
    };
    const onPause = () => {
      setIsPlaying(false);
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
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
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
  }, [filePath, stopPlayback]);

  // Handlers
  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current?.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    videoRef.current.currentTime =
      ((e.clientX - rect.left) / rect.width) * videoRef.current.duration;
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
      <div
        id="videoViewport"
        ref={viewportRef}
        className="relative flex-1 bg-black overflow-hidden"
      >
        <video ref={videoRef} className="w-full h-full object-contain" />

        {/* Back button */}
        <button
          onClick={stopPlayback}
          className="absolute top-3 left-3 z-40 flex items-center gap-1.5 px-2.5 py-1.5 bg-black/60 hover:bg-black/90 rounded-lg text-xs text-gray-400 hover:text-gray-100 backdrop-blur-sm transition-all border border-gray-700/50 hover:border-gray-600"
          title="Back (Esc)"
        >
          ← Library
        </button>

        {/* Info Panel */}
        <div
          className={`absolute top-4 right-4 bottom-16 w-80 bg-black/80 backdrop-blur-sm rounded-xl border border-gray-700 overflow-y-auto z-50 flex-col text-xs font-mono ${
            infoVisible ? 'flex' : 'hidden'
          }`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
            <span className="text-sm font-semibold text-gray-100 font-sans">
              Playback Info
            </span>
            <button
              onClick={() => setInfoVisible(false)}
              className="text-gray-500 hover:text-gray-200 transition-colors"
            >
              ✕
            </button>
          </div>
          <div
            className="px-4 py-3 space-y-4 overflow-y-auto"
            dangerouslySetInnerHTML={{ __html: infoHtml }}
          />
        </div>

        {/* Controls Overlay */}
        <div
          className={`absolute bottom-0 left-0 right-0 transition-opacity duration-300 bg-gradient-to-t from-black/90 to-transparent px-5 pt-16 pb-5 ${
            controlsVisible
              ? 'opacity-100'
              : 'opacity-0 pointer-events-none'
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
              className="text-gray-100 hover:text-yellow-400 text-xl transition-colors p-1"
            >
              {isPlaying ? '⏸' : '▶'}
            </button>

            {/* Quality pill */}
            <div className="relative">
              <button
                onClick={() => setQualityPopoverOpen((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-xs text-gray-100 hover:border-yellow-500 transition-colors cursor-pointer"
              >
                <span>{qualityLabel}</span>
                <span className="text-gray-500">▾</span>
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

            <button
              onClick={toggleVolumeMute}
              className="text-gray-100 hover:text-yellow-400 text-lg transition-colors p-1"
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
              className="text-gray-400 hover:text-yellow-400 text-base transition-colors p-1"
              title="Info (I)"
            >
              ⓘ
            </button>
            <button
              onClick={toggleFullscreen}
              className="text-gray-100 hover:text-yellow-400 text-lg transition-colors p-1"
            >
              ⛶
            </button>
            <button
              onClick={stopPlayback}
              className="text-gray-400 hover:text-yellow-400 text-lg transition-colors p-1"
            >
              ⏹
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
