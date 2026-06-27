'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, Trash2 } from 'lucide-react';
import ConfirmOverlay from '@/components/custom/ConfirmOverlay';

interface EntityCardProps {
  id: string;
  name: string;
  confirmMessage: string;
  icon: React.ReactNode;
  gradientPos?: string;
  infoRows: React.ReactNode;
  onSelect?: () => void;
  onDelete?: (id: string) => void;
}

export default function EntityCard({
  id,
  name,
  confirmMessage,
  icon,
  gradientPos = '40% 60%',
  infoRows,
  onSelect,
  onDelete,
}: EntityCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div
      className="group relative overflow-hidden cursor-pointer rounded-lg border border-border bg-card
        transition-[transform,box-shadow,border-color] duration-200 ease-out will-change-transform
        hover:-translate-y-0.5 hover:scale-[1.012] hover:border-primary/40
        hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.3),0_8px_24px_rgba(0,0,0,0.4)]
        active:translate-y-0 active:scale-[0.99] active:duration-75"
      onClick={onSelect}
    >
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500/0 via-amber-500/70 to-amber-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10" />

      <div
        className="aspect-video flex items-center justify-center rounded-t-lg overflow-hidden"
        style={{ background: `radial-gradient(ellipse at ${gradientPos}, var(--card), var(--background))` }}
      >
        <div className="relative flex items-center justify-center">
          <div className="absolute h-14 w-14 rounded-full bg-amber-500/[0.06] blur-md" />
          {icon}
        </div>
      </div>

      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 bg-zinc-950/60 backdrop-blur-sm hover:bg-zinc-950/80"
          onClick={(e) => { e.stopPropagation(); onSelect?.(); }}
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 bg-zinc-950/60 backdrop-blur-sm hover:bg-destructive/20 hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); setShowConfirm(true); }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="px-3 py-2">
        <div className="font-medium text-sm truncate">{name}</div>
        {infoRows}
      </div>

      {showConfirm && (
        <ConfirmOverlay
          message={confirmMessage}
          onConfirm={() => { onDelete?.(id); setShowConfirm(false); }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
