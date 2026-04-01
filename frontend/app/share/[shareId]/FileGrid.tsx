'use client';

import React from 'react';
import { ShareFile } from '@/lib/types';
import { getFileName } from '@/lib/utils';

interface FileGridProps {
  files: ShareFile[];
  onPlay: (filePath: string) => void;
}

const fallbackSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='120'%3E%3Crect fill='%2318181b' width='200' height='120'/%3E%3Ctext x='50%25' y='50%25' fill='%23666' text-anchor='middle' dy='.3em' font-size='14'%3E%F0%9F%8E%A5%3C/text%3E%3C/svg%3E`;

function FileGridComponent({ files, onPlay }: FileGridProps) {
  return (
    <div style={{ padding: '20px' }}>
      <div className="grid-cards">
        {files.length === 0 ? (
          <div style={{ gridColumn: '1/-1', color: '#666', padding: '20px' }}>
            No files in this share.
          </div>
        ) : (
          files.map((file) => (
            <div
              key={file.id}
              className="group relative overflow-hidden cursor-pointer rounded-lg border border-border bg-card
                transition-[transform,box-shadow,border-color] duration-200 ease-out will-change-transform
                hover:-translate-y-0.5 hover:scale-[1.012] hover:border-primary/40
                hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.3),0_8px_24px_rgba(0,0,0,0.4)]
                active:translate-y-0 active:scale-[0.99] active:duration-75"
              onClick={() => onPlay(file.file_path)}
            >
              <div className="aspect-video rounded-t-lg overflow-hidden bg-zinc-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/thumb?path=${encodeURIComponent(file.file_path)}&w=200`}
                  alt={getFileName(file.file_path)}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                  onError={(e) => { (e.target as HTMLImageElement).src = fallbackSvg; }}
                />
              </div>
              <div className="px-3 py-2">
                <div className="font-medium text-sm truncate">{getFileName(file.file_path)}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {file.scan_status === 'done' && file.duration_seconds ? (
                    `${file.width}x${file.height} · ${Math.round(file.duration_seconds)}s`
                  ) : file.scan_status === 'pending' ? 'Scanning...' : 'Error scanning'}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export const FileGrid = React.memo(FileGridComponent);
