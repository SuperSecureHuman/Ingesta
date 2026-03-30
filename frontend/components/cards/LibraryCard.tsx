'use client';

import { useState } from 'react';
import { Library } from '@/lib/types';
import ConfirmOverlay from '@/components/ui/ConfirmOverlay';

interface LibraryCardProps {
  library: Library;
  onSelect?: () => void;
  onDelete?: (libId: string) => void;
}

export default function LibraryCard({ library, onSelect, onDelete }: LibraryCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowConfirm(true);
  };

  const handleConfirmDelete = () => {
    onDelete?.(library.id);
    setShowConfirm(false);
  };

  return (
    <div className="card" onClick={onSelect}>
      <div className="card-placeholder">📁</div>
      <div className="card-title">{library.name}</div>
      <div className="card-meta">
        <div>Path: {library.root_path}</div>
        <div>Created: {new Date(library.created_at).toLocaleDateString()}</div>
      </div>
      <div className="card-actions">
        <button
          className="icon-btn"
          onClick={(e) => {
            e.stopPropagation();
            onSelect?.();
          }}
        >
          →
        </button>
        <button className="icon-btn" onClick={handleDeleteClick}>
          ×
        </button>
      </div>
      {showConfirm && (
        <ConfirmOverlay
          message={`Delete "${library.name}"?`}
          onConfirm={handleConfirmDelete}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
