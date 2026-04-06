'use client';

import React, { useState } from 'react';
import { Play } from 'lucide-react';
import { ShareFile } from '@/lib/types';
import { formatTime, getFileName, getResolutionLabel } from '@/lib/utils';

const FALLBACK_SVG = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect fill="%2318181b" width="200" height="120"/></svg>';

interface ShareFileCardProps {
  file: ShareFile;
  shareId: string;
  jwt: string | null;
  onPlay: (file: ShareFile, sourceRect: DOMRect) => void;
}

export default function ShareFileCard({ file, shareId, jwt, onPlay }: ShareFileCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);

  const fileName = getFileName(file.file_path);
  const durationStr = formatTime(file.duration_seconds || 0);
  const resLabel = getResolutionLabel(file.height || 0);
  const isLoading = file.scan_status === 'pending';

  const posterUrl = `/api/share/${shareId}/thumb?path=${encodeURIComponent(file.file_path)}&t=0&token=${encodeURIComponent(jwt || '')}`;

  const tags = file.tags ?? [];
  const rating = file.rating ?? 0;
  const commentCount = (file.comments ?? []).length;
  const markerCount = (file.markers ?? []).length;

  return (
    <div
      onClick={(e) => {
        if (isLoading) return;
        onPlay(file, (e.currentTarget as HTMLElement).getBoundingClientRect());
      }}
      className={[
        'group relative overflow-hidden rounded-lg border border-border bg-card',
        'transition-[transform,box-shadow,border-color] duration-200 ease-out will-change-transform',
        'hover:-translate-y-0.5 hover:scale-[1.012] hover:border-primary/40',
        'hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.3),0_8px_24px_rgba(0,0,0,0.4)]',
        'active:translate-y-0 active:scale-[0.99] active:duration-75',
        isLoading ? 'cursor-not-allowed opacity-50 pointer-events-none' : 'cursor-pointer',
      ].join(' ')}
    >
      {/* Amber accent bar */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500/0 via-amber-500/70 to-amber-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10" />

      {/* Thumbnail */}
      <div className="aspect-video rounded-t-lg overflow-hidden bg-zinc-900 relative">
        {!imgLoaded && <div className="card-image-skeleton" />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={posterUrl}
          alt={fileName}
          loading="lazy"
          className={`w-full h-full object-cover transition-[transform,opacity] duration-300 group-hover:scale-[1.04] ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setImgLoaded(true)}
          onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_SVG; setImgLoaded(true); }}
        />

        {/* Play overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
          <div className="rounded-full bg-black/50 backdrop-blur-sm p-2.5">
            <Play className="h-5 w-5 text-white fill-white" />
          </div>
        </div>

        {/* Scanning indicator */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="w-5 h-5 rounded-full border-2 border-zinc-600 border-t-amber-500 animate-spin" />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2">
        <div className="font-medium text-sm truncate" title={fileName}>{fileName}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{durationStr} · {resLabel}</div>

        {file.scan_status === 'done' && (
          <>
            {/* Tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {tags.map(tag => (
                  <span key={tag} className="inline-flex items-center px-1.5 py-0 text-[10px] rounded bg-amber-500/15 text-amber-300 border border-amber-500/25">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Star rating (display only) */}
            {rating > 0 && (
              <div className="flex items-center gap-0.5 mt-1.5">
                {[1, 2, 3, 4, 5].map(n => (
                  <svg
                    key={n}
                    className={`w-3.5 h-3.5 ${n <= rating ? 'text-amber-400' : 'text-zinc-600'}`}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
                  </svg>
                ))}
              </div>
            )}

            {/* Comment + marker counts */}
            {(commentCount > 0 || markerCount > 0) && (
              <div className="flex gap-1 mt-1.5">
                {commentCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                    {commentCount}c
                  </span>
                )}
                {markerCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                    {markerCount}m
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
