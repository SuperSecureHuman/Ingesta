'use client';

import { useState } from 'react';
import { Project } from '@/lib/types';
import ConfirmOverlay from '@/components/ui/ConfirmOverlay';

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
    <div className="card" onClick={onSelect}>
      <div className="card-placeholder">🎬</div>
      <div className="card-title">{project.name}</div>
      <div className="card-meta">
        <div>Created: {new Date(project.created_at).toLocaleDateString()}</div>
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
          message={`Delete "${project.name}"?`}
          onConfirm={handleConfirmDelete}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
