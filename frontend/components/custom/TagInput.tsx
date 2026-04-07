'use client';

import React, { useState, useRef } from 'react';

interface TagInputProps {
  tags: string[];
  suggestions: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  canEdit: boolean;
  maxVisible?: number; // default 4, shows "+N more" after this count
}

export default function TagInput({ tags, suggestions, onAdd, onRemove, canEdit, maxVisible = 4 }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredSuggestions = suggestions.filter(
    s => s.toLowerCase().includes(inputValue.toLowerCase()) && !tags.includes(s)
  );

  const visibleTags = expanded ? tags : tags.slice(0, maxVisible);
  const hiddenCount = tags.length - maxVisible;

  const handleAdd = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onAdd(trimmed);
    }
    setInputValue('');
    setShowInput(false);
  };

  return (
    <div className="mt-1.5">
      {/* Tag badges */}
      <div className="flex flex-wrap gap-1">
        {visibleTags.map(tag => (
          <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0 text-[10px] rounded bg-amber-500/15 text-amber-300 border border-amber-500/25">
            {tag}
            {canEdit && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRemove(tag); }}
                className="ml-0.5 text-amber-300/60 hover:text-amber-300 transition-colors leading-none"
                aria-label={`Remove tag ${tag}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {!expanded && hiddenCount > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
            className="text-[10px] px-1.5 py-0 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700 transition-colors"
          >
            +{hiddenCount} more
          </button>
        )}
        {canEdit && !showInput && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowInput(true); setTimeout(() => inputRef.current?.focus(), 0); }}
            className="text-[10px] px-1.5 py-0 rounded bg-zinc-800/50 text-zinc-500 border border-zinc-700/50 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
            aria-label="Add tag"
          >
            + tag
          </button>
        )}
      </div>

      {/* Input + suggestions */}
      {canEdit && showInput && (
        <div className="relative mt-1" onClick={(e) => e.stopPropagation()}>
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleAdd(inputValue); }
              if (e.key === 'Escape') { setShowInput(false); setInputValue(''); }
            }}
            onBlur={() => { if (!inputValue) setShowInput(false); }}
            placeholder="Add tag…"
            className="w-full h-6 px-1.5 text-[11px] rounded bg-input border border-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
          {filteredSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-0.5 rounded border border-border bg-popover shadow-lg max-h-28 overflow-y-auto z-10">
              {filteredSuggestions.map((s, i) => (
                <div
                  key={s}
                  onMouseDown={(e) => { e.preventDefault(); handleAdd(s); }}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className={`cursor-pointer px-2 py-1 text-xs text-foreground ${hoveredIdx === i ? 'bg-accent' : ''}`}
                >
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
