'use client';

import React, { useState, useRef } from 'react';
import { BrowseEntry } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Folder, Tag, Play } from 'lucide-react';

const FALLBACK_SVG = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect fill="%2318181b" width="200" height="120"/></svg>';

function StarIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

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
  const [addingTag, setAddingTag] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tagExpanded, setTagExpanded] = useState(false);
  const [hoverStar, setHoverStar] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

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

  const suggestions = tagInput
    ? allDistinctTags.filter((t) => t.toLowerCase().includes(tagInput.toLowerCase()) && !(tags ?? []).includes(t))
    : allDistinctTags.filter((t) => !(tags ?? []).includes(t));

  const submitTag = (tag: string) => {
    const t = tag.trim();
    if (!t || (tags ?? []).includes(t)) { setAddingTag(false); setTagInput(''); return; }
    onAddTag?.(entry.path, t);
    setAddingTag(false);
    setTagInput('');
  };

  const showAnnotations = entry.is_video && tags !== undefined;
  const visibleTags = tagExpanded ? (tags ?? []) : (tags ?? []).slice(0, 4);
  const overflow = (tags ?? []).length - 4;
  const currentRating = rating ?? 0;
  const displayRating = hoverStar || currentRating;

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
          <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap gap-1 items-center">
              {visibleTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0 text-[10px] rounded bg-amber-500/15 text-amber-300 border border-amber-500/25"
                >
                  {tag}
                  {canEditAnnotations && (
                    <button
                      className="ml-0.5 text-amber-400/60 hover:text-amber-300 leading-none"
                      onClick={() => onRemoveTag?.(entry.path, tag)}
                    >×</button>
                  )}
                </span>
              ))}
              {!tagExpanded && overflow > 0 && (
                <button
                  className="text-[10px] text-zinc-400 hover:text-zinc-200 px-1.5 py-0 rounded border border-zinc-700 hover:border-zinc-500"
                  onClick={() => setTagExpanded(true)}
                >+{overflow} more</button>
              )}
              {tagExpanded && (tags ?? []).length > 4 && (
                <button
                  className="text-[10px] text-zinc-400 hover:text-zinc-200 px-1.5 py-0 rounded border border-zinc-700 hover:border-zinc-500"
                  onClick={() => setTagExpanded(false)}
                >less</button>
              )}
              {canEditAnnotations && !addingTag && (
                <button
                  className="text-[10px] text-zinc-500 hover:text-zinc-200 px-1.5 py-0 rounded border border-dashed border-zinc-700 hover:border-zinc-400"
                  onClick={() => { setAddingTag(true); setTimeout(() => tagInputRef.current?.focus(), 50); }}
                >+ tag</button>
              )}
            </div>

            {canEditAnnotations && addingTag && (
              <div className="relative mt-1">
                <input
                  ref={tagInputRef}
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitTag(tagInput);
                    if (e.key === 'Escape') { setAddingTag(false); setTagInput(''); }
                  }}
                  onBlur={() => setTimeout(() => { setAddingTag(false); setTagInput(''); }, 150)}
                  placeholder="tag name…"
                  className="w-full h-6 px-1.5 text-[11px] bg-zinc-800 border border-zinc-600 rounded text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/50"
                />
                {suggestions.length > 0 && tagInput && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-0.5 bg-zinc-800 border border-zinc-600 rounded shadow-lg max-h-28 overflow-y-auto">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        className="w-full text-left px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700"
                        onMouseDown={(e) => { e.preventDefault(); submitTag(s); }}
                      >{s}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Star Rating ────────────────────────────────────────────────── */}
        {showAnnotations && (
          <div className="flex items-center gap-0.5 mt-1.5" onClick={(e) => e.stopPropagation()}>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                className={`w-4 h-4 transition-colors ${canEditAnnotations ? 'cursor-pointer hover:scale-110' : 'cursor-default'} ${star <= displayRating ? 'text-amber-400' : 'text-zinc-600'}`}
                onMouseEnter={() => canEditAnnotations && setHoverStar(star)}
                onMouseLeave={() => canEditAnnotations && setHoverStar(0)}
                onClick={() => {
                  if (!canEditAnnotations) return;
                  onSetRating?.(entry.path, star === currentRating ? null : star);
                }}
                title={canEditAnnotations ? (star === currentRating ? 'Clear rating' : `Rate ${star}`) : `${currentRating}/5`}
              >
                <StarIcon filled={star <= displayRating} className="w-full h-full" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(FileCard);
