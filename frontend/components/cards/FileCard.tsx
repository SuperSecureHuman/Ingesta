'use client';

import React from 'react';
import { BrowseEntry } from '@/lib/types';
import { escapeHtml } from '@/lib/utils';

interface FileCardProps {
  entry: BrowseEntry;
  isSelected: boolean;
  onPlay: (path: string) => void;
  onSelectionChange: (path: string, type: 'file' | 'folder', selected: boolean) => void;
}

function FileCard({
  entry,
  isSelected,
  onPlay,
  onSelectionChange,
}: FileCardProps) {
  const isFolderOrVideo = entry.is_dir || entry.is_video;

  if (!isFolderOrVideo) {
    return null; // Skip non-video non-dir entries
  }

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const type = entry.is_dir ? 'folder' : 'file';
    onSelectionChange(entry.path, type, e.target.checked);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger play if clicking on checkbox
    if ((e.target as HTMLElement).tagName === 'INPUT') {
      return;
    }
    // Only play on video files, not folders
    if (entry.is_video) {
      onPlay(entry.path);
    }
  };

  const fallbackSvg = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect fill="%231a1a1a" width="200" height="120"/></svg>';

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

      {entry.is_dir ? (
        <div
          style={{
            height: '120px',
            background: '#1a1a1a',
            borderRadius: '4px',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
            fontSize: '12px',
          }}
        >
          📁
        </div>
      ) : (
        <img
          src={`/api/thumb?path=${encodeURIComponent(entry.path)}&w=200`}
          className="card-image"
          alt={entry.name}
          onError={(e) => {
            (e.target as HTMLImageElement).src = fallbackSvg;
          }}
        />
      )}

      <div className="card-title">{escapeHtml(entry.name)}</div>
      <div className="card-meta">{entry.is_dir ? 'Folder' : 'Video file'}</div>
    </div>
  );
}

export default React.memo(FileCard);
