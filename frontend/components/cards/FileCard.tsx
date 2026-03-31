'use client';

import React from 'react';
import { BrowseEntry } from '@/lib/types';

const FALLBACK_SVG = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect fill="%231a1a1a" width="200" height="120"/></svg>';

interface FileCardProps {
  entry: BrowseEntry;
  isSelected: boolean;
  onPlay: (path: string) => void;
  onSelectionChange: (path: string, type: 'file' | 'folder', selected: boolean) => void;
  onFolderOpen?: (path: string) => void;
  camera?: string | null;
  lens?: string | null;
  onTagClick?: (path: string) => void;
}

function FileCard({
  entry,
  isSelected,
  onPlay,
  onSelectionChange,
  onFolderOpen,
  camera,
  lens,
  onTagClick,
}: FileCardProps) {
  const isFolderOrVideo = entry.is_dir || entry.is_video;

  if (!isFolderOrVideo) {
    return null;
  }

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const type = entry.is_dir ? 'folder' : 'file';
    onSelectionChange(entry.path, type, e.target.checked);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if ((e.target as HTMLElement).closest('button')) return;
    if (entry.is_dir) {
      onFolderOpen?.(entry.path);
      return;
    }
    if (entry.is_video) {
      onPlay(entry.path);
    }
  };

  return (
    <div
      className="card selectable"
      data-id={entry.path}
      data-type={entry.is_dir ? 'folder' : 'file'}
      onClick={handleCardClick}
    >
      <input
        type="checkbox"
        className="card-check"
        checked={isSelected}
        onChange={handleCheckboxChange}
      />

      {entry.is_video && onTagClick && (
        <div className="card-actions">
          <button
            className="icon-btn"
            title="Source tags"
            onClick={(e) => { e.stopPropagation(); onTagClick(entry.path); }}
          >
            🏷
          </button>
        </div>
      )}

      {entry.is_dir ? (
        <div className="card-placeholder">📁</div>
      ) : (
        <>
          <img
            src={`/api/thumb?path=${encodeURIComponent(entry.path)}&w=200`}
            className="card-image"
            alt={entry.name}
            onError={(e) => {
              (e.target as HTMLImageElement).src = FALLBACK_SVG;
            }}
          />
          <div className="card-duration">Video</div>
        </>
      )}

      <div className="card-title">{entry.name}</div>
      <div className="card-meta">{entry.is_dir ? 'Folder' : 'Video file'}</div>

      {entry.is_video && (camera || lens) && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', padding: '4px 8px 2px' }}>
          {camera && (
            <span style={{ fontSize: '11px', background: '#2a2a2a', border: '1px solid #444', borderRadius: '3px', padding: '1px 5px', color: '#bbb' }}>
              {camera}
            </span>
          )}
          {lens && (
            <span style={{ fontSize: '11px', background: '#2a2a2a', border: '1px solid #444', borderRadius: '3px', padding: '1px 5px', color: '#bbb' }}>
              {lens}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default React.memo(FileCard);
