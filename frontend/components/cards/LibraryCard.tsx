'use client';

import { Library } from '@/lib/types';
import { Library as LibraryIcon } from 'lucide-react';
import EntityCard from './EntityCard';

interface LibraryCardProps {
  library: Library;
  onSelect?: () => void;
  onDelete?: (libId: string) => void;
}

export default function LibraryCard({ library, onSelect, onDelete }: LibraryCardProps) {
  return (
    <EntityCard
      id={library.id}
      name={library.name}
      confirmMessage={`Delete "${library.name}"?`}
      gradientPos="60% 40%"
      icon={<LibraryIcon className="relative h-10 w-10 text-amber-500/35 drop-shadow-[0_0_6px_rgba(245,158,11,0.25)]" />}
      infoRows={
        <>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">{library.root_path}</div>
          <div className="text-xs text-muted-foreground">{new Date(library.created_at).toLocaleDateString()}</div>
        </>
      }
      onSelect={onSelect}
      onDelete={onDelete}
    />
  );
}
