'use client';

import React, { useMemo } from 'react';
import { ShareFile } from '@/lib/types';
import { getFileName } from '@/lib/utils';

interface FileGridProps {
  files: ShareFile[];
  onPlay: (filePath: string) => void;
}

function FileGridComponent({ files, onPlay }: FileGridProps) {
  return (
    <div style={{ padding: '20px' }}>
      <div className="grid">
        {files.length === 0 ? (
          <div style={{ gridColumn: '1/-1', color: '#666', padding: '20px' }}>
            No files in this share.
          </div>
        ) : (
          files.map((file) => (
            <div
              key={file.id}
              className="card"
              onClick={() => onPlay(file.file_path)}
              style={{ cursor: 'pointer' }}
            >
              <img
                src={`/api/thumb?path=${encodeURIComponent(file.file_path)}&w=200`}
                alt={getFileName(file.file_path)}
                className="card-image"
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  const fallback = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='120'%3E%3Crect fill='%231a1a1a' width='200' height='120'/%3E%3Ctext x='50%25' y='50%25' fill='%23666' text-anchor='middle' dy='.3em' font-size='14'%3E🎥%3C/text%3E%3C/svg%3E`;
                  (e.target as HTMLImageElement).src = fallback;
                }}
              />
              <div className="card-title">{getFileName(file.file_path)}</div>
              <div className="card-meta">
                {file.scan_status === 'done' && file.duration_seconds ? (
                  <>
                    <div>
                      {file.width}x{file.height}
                    </div>
                    <div>{Math.round(file.duration_seconds)}s</div>
                  </>
                ) : file.scan_status === 'pending' ? (
                  <div>Scanning...</div>
                ) : (
                  <div>Error</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export const FileGrid = React.memo(FileGridComponent);
