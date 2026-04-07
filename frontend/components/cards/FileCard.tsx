'use client';

import React, { useState } from 'react';
import { BrowseEntry } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Folder, Tag, Play } from 'lucide-react';
import TagInput from '@/components/custom/TagInput';
import StarRating from '@/components/custom/StarRating';

const FALLBACK_SVG = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect fill="%2318181b" width="200" height="120"/></svg>';

interface FileCardProps {
  entry: BrowseEntry;
  isSelected: boolean;
  onPlay: (path: string, sourceRect?: DOMRect) => void;
  onSelectionChange: (path: string, type: 'file' | 'folder', selected: boolean) => void;
  onFolderOpen?: (path: string) => void;
  camera?: string | null;
  lens?: string | null;
  onTagClick?: (path: string) => void;
  // Annotation props (optional — only provided when caller manages annotation state)
  tags?: string[];
  rating?: number | null;
  allDistinctTags?: string[];
  canEditAnnotations?: boolean;
  onAddTag?: (path: string, tag: string) => void;
  onRemoveTag?: (path: string, tag: string) => void;
  onSetRating?: (path: string, rating: number | null) => void;
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
  tags,
  rating,
  allDistinctTags = [],
  canEditAnnotations = false,
  onAddTag,
  onRemoveTag,
  onSetRating,
}: FileCardProps) {
  const isFolderOrVideo = entry.is_dir || entry.is_video;
  const [imgLoaded, setImgLoaded] = useState(false);

  if (!isFolderOrVideo) return null;

  const handleCheckboxChange = (checked: boolean) => {
    const type = entry.is_dir ? 'folder' : 'file';
    onSelectionChange(entry.path, type, checked);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if ((e.target as HTMLElement).closest('button')) return;
    if (entry.is_dir) { onFolderOpen?.(entry.path); return; }
    if (entry.is_video) onPlay(entry.path, (e.currentTarget as HTMLElement).getBoundingClientRect());
  };

  const showAnnotations = entry.is_video && tags !== undefined;
  const currentRating = rating ?? 0;

  return (
    <div
      className="group relative overflow-hidden cursor-pointer rounded-lg border border-border bg-card
        transition-[transform,box-shadow,border-color] duration-200 ease-out will-change-transform
        hover:-translate-y-0.5 hover:scale-[1.012] hover:border-primary/40
        hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.3),0_8px_24px_rgba(0,0,0,0.4)]
        active:translate-y-0 active:scale-[0.99] active:duration-75"
      data-id={entry.path}
      data-type={entry.is_dir ? 'folder' : 'file'}
      onClick={handleCardClick}
    >
      <div className="absolute top-2 left-2 z-10">
        <Checkbox
          checked={isSelected}
          onCheckedChange={handleCheckboxChange}
          onClick={(e) => e.stopPropagation()}
          className="bg-zinc-950/60 backdrop-blur-sm border-white/30"
        />
      </div>

      {entry.is_video && onTagClick && (
        <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 bg-zinc-950/60 backdrop-blur-sm hover:bg-zinc-950/80"
            title="Source tags"
            onClick={(e) => { e.stopPropagation(); onTagClick(entry.path); }}
          >
            <Tag className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* accent bar */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500/0 via-amber-500/70 to-amber-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10" />

      {entry.is_dir ? (
        <div className="aspect-video flex items-center justify-center rounded-t-lg overflow-hidden
          bg-[radial-gradient(ellipse_at_50%_50%,#1c1917,#09090b)]">
          <div className="relative flex items-center justify-center">
            <div className="absolute h-14 w-14 rounded-full bg-amber-500/[0.06] blur-md" />
            <Folder className="relative h-10 w-10 text-amber-500/35 drop-shadow-[0_0_6px_rgba(245,158,11,0.25)]" />
          </div>
        </div>
      ) : (
        <div className="aspect-video rounded-t-lg overflow-hidden bg-zinc-900 relative">
          {!imgLoaded && <div className="card-image-skeleton" />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/thumb?path=${encodeURIComponent(entry.path)}&w=200`}
            className={`w-full h-full object-cover transition-[transform,opacity] duration-300 group-hover:scale-[1.04] ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
            alt={entry.name}
            onLoad={() => setImgLoaded(true)}
            onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_SVG; setImgLoaded(true); }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
            <div className="rounded-full bg-black/50 backdrop-blur-sm p-2.5">
              <Play className="h-5 w-5 text-white fill-white" />
            </div>
          </div>
        </div>
      )}

      <div className="px-3 py-2">
        <div className="font-medium text-sm truncate">{entry.name}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{entry.is_dir ? 'Folder' : 'Video file'}</div>
        {entry.is_video && (camera || lens) && (
          <div className="flex gap-1 flex-wrap mt-1">
            {camera && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{camera}</Badge>}
            {lens && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{lens}</Badge>}
          </div>
        )}

        {/* ── Tags ──────────────────────────────────────────────────────── */}
        {showAnnotations && (
          <div onClick={(e) => e.stopPropagation()}>
            <TagInput
              tags={tags ?? []}
              suggestions={allDistinctTags}
              onAdd={(tag) => onAddTag?.(entry.path, tag)}
              onRemove={(tag) => onRemoveTag?.(entry.path, tag)}
              canEdit={canEditAnnotations}
            />
          </div>
        )}

        {/* ── Star Rating ────────────────────────────────────────────────── */}
        {showAnnotations && (
          <div onClick={(e) => e.stopPropagation()}>
            <StarRating
              rating={currentRating}
              onChange={canEditAnnotations ? (r) => onSetRating?.(entry.path, r === 0 ? null : r) : undefined}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(FileCard);
