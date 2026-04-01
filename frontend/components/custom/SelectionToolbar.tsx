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
    <div style={{
      position: 'fixed',
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#1e1e1e',
      border: '1px solid #444',
      borderRadius: '8px',
      padding: '10px 16px',
      display: 'flex',
      gap: '12px',
      alignItems: 'center',
      boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
      zIndex: 200,
    }}>
      <span style={{ fontSize: '13px', color: '#ccc' }}>
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
