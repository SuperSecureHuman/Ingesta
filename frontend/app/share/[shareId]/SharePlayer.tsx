'use client';

import React, { useState, useCallback } from 'react';
import { formatTime, getFileName } from '@/lib/utils';

const FALLBACK_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='120'%3E%3Crect fill='%231a1a1a' width='200' height='120'/%3E%3Ctext x='50%25' y='50%25' fill='%23666' text-anchor='middle' dy='.3em' font-size='14'%3E🎥%3C/text%3E%3C/svg%3E`;

interface SharePlayerProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  currentFilePath: string | null;
  isPlaying: boolean;
  infoVisible: boolean;
  controlsVisible: boolean;
  progressPct: number;
  bufferedPct: number;
  currentTimeStr: string;
  totalTimeStr: string;
  quality: string;
  volume: number;
  isMuted: boolean;
  qualityPopoverOpen: boolean;
  capabilities: { tiers?: Array<{ key: string; label: string }> };
  infoHtml: string;
  onPlayPause: () => void;
  onSeekClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onVolumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onToggleInfo: () => void;
  onQualitySelect: (quality: string) => void;
  onDownload: () => void;
  onLogout: () => void;
  onMouseMove: () => void;
  onContainerClick: () => void;
}

export function SharePlayer({
  videoRef,
  currentFilePath,
  isPlaying,
  infoVisible,
  controlsVisible,
  progressPct,
  bufferedPct,
  currentTimeStr,
  totalTimeStr,
  quality,
  volume,
  isMuted,
  qualityPopoverOpen,
  capabilities,
  infoHtml,
  onPlayPause,
  onSeekClick,
  onVolumeChange,
  onToggleMute,
  onToggleFullscreen,
  onToggleInfo,
  onQualitySelect,
  onDownload,
  onLogout,
  onMouseMove,
  onContainerClick,
}: SharePlayerProps) {
  const qualityOptions = capabilities?.tiers || [];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 9999,
      }}
      onClick={onContainerClick}
      onMouseMove={onMouseMove}
    >
      {/* Video */}
      <video
        ref={videoRef}
        style={{
          flex: 1,
          background: '#000',
          maxWidth: '100%',
          maxHeight: '100%',
        }}
      />

      {/* Controls */}
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.8)',
          color: '#fff',
          padding: '12px',
          opacity: controlsVisible ? 1 : 0,
          transition: 'opacity 0.3s',
          pointerEvents: controlsVisible ? 'auto' : 'none',
        }}
      >
        {/* Progress bar */}
        <div
          onClick={onSeekClick}
          style={{
            marginBottom: '12px',
            cursor: 'pointer',
            background: '#333',
            height: '4px',
            borderRadius: '2px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ background: '#e5a00d', height: '100%', width: `${bufferedPct}%` }} />
          <div style={{ background: '#fff', height: '100%', width: `${progressPct}%` }} />
        </div>

        {/* Buttons row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px' }}>
          <button
            onClick={onPlayPause}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '18px',
            }}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>

          <div>{currentTimeStr}</div>
          <div>/</div>
          <div>{totalTimeStr}</div>

          <div style={{ flex: 1 }} />

          {/* Volume */}
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={onVolumeChange}
            style={{ width: '80px', cursor: 'pointer' }}
          />
          <button
            onClick={onToggleMute}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>

          {/* Quality */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => {}}
              style={{
                background: 'none',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              {quality}
            </button>
            {qualityPopoverOpen && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '24px',
                  background: '#222',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  zIndex: 10000,
                  minWidth: '80px',
                }}
              >
                {qualityOptions.map((tier) => (
                  <button
                    key={tier.key}
                    onClick={() => onQualitySelect(tier.key)}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '8px',
                      background: quality === tier.key ? '#444' : 'transparent',
                      border: 'none',
                      color: '#fff',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '12px',
                    }}
                  >
                    {tier.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <button
            onClick={onToggleInfo}
            style={{
              background: infoVisible ? '#444' : 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '2px',
              fontSize: '12px',
            }}
          >
            ℹ️
          </button>

          {/* Download */}
          <button
            onClick={onDownload}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            ⬇️
          </button>

          {/* Fullscreen */}
          <button
            onClick={onToggleFullscreen}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            ⛶
          </button>

          {/* Logout */}
          <button
            onClick={onLogout}
            style={{
              background: 'none',
              border: 'none',
              color: '#999',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Exit
          </button>
        </div>
      </div>

      {/* Info panel */}
      {infoVisible && (
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.9)',
            color: '#999',
            padding: '12px',
            maxHeight: '200px',
            overflowY: 'auto',
            fontSize: '12px',
            fontFamily: 'monospace',
          }}
          dangerouslySetInnerHTML={{ __html: infoHtml }}
        />
      )}
    </div>
  );
}
