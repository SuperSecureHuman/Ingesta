'use client';

import { useState } from 'react';
import { Project } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Film, ArrowRight, Trash2 } from 'lucide-react';
import ConfirmOverlay from '@/components/custom/ConfirmOverlay';

interface ProjectCardProps {
  project: Project;
  onSelect?: () => void;
  onDelete?: (projId: string) => void;
}

export default function ProjectCard({ project, onSelect, onDelete }: ProjectCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowConfirm(true);
  };

  const handleConfirmDelete = () => {
    onDelete?.(project.id);
    setShowConfirm(false);
  };

  return (
    <div
      className="group relative overflow-hidden cursor-pointer rounded-lg border border-border bg-card
        transition-[transform,box-shadow,border-color] duration-200 ease-out will-change-transform
        hover:-translate-y-0.5 hover:scale-[1.012] hover:border-primary/40
        hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.3),0_8px_24px_rgba(0,0,0,0.4)]
        active:translate-y-0 active:scale-[0.99] active:duration-75"
      onClick={onSelect}
    >
      {/* accent bar */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500/0 via-amber-500/70 to-amber-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10" />

      <div className="aspect-video flex items-center justify-center rounded-t-lg overflow-hidden
        bg-[radial-gradient(ellipse_at_40%_60%,#1c1917,#09090b)]">
        <div className="relative flex items-center justify-center">
          <div className="absolute h-14 w-14 rounded-full bg-amber-500/[0.06] blur-md" />
          <Film className="relative h-10 w-10 text-amber-500/35 drop-shadow-[0_0_6px_rgba(245,158,11,0.25)]" />
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
            className="h-7 w-7 bg-zinc-950/60 backdrop-blur-sm hover:bg-zinc-950/80 hover:text-destructive"
            onClick={handleDeleteClick}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="px-3 py-2">
        <div className="font-medium text-sm truncate">{project.name}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{new Date(project.created_at).toLocaleDateString()}</div>
      </div>

      {showConfirm && (
        <ConfirmOverlay
          message={`Delete "${project.name}"?`}
          onConfirm={handleConfirmDelete}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
