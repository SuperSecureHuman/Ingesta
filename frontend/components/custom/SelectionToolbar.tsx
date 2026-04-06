'use client';

import { Button } from '@/components/ui/button';

interface SelectionToolbarProps {
  count: number;
  onAddToProject: () => void;
  onClear: () => void;
  onTagSelected?: () => void;
}

export default function SelectionToolbar({ count, onAddToProject, onClear, onTagSelected }: SelectionToolbarProps) {
  if (count === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2.5 bg-card border border-border rounded-lg shadow-xl z-50">
      <span className="text-sm text-muted-foreground">
        {count} item{count !== 1 ? 's' : ''} selected
      </span>
      {onTagSelected && (
        <Button size="sm" variant="secondary" onClick={onTagSelected}>
          🏷 Tag Selected
        </Button>
      )}
      <Button size="sm" onClick={onAddToProject}>
        Add to Project
      </Button>
      <Button size="sm" variant="secondary" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
