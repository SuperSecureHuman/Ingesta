'use client';

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
    <div className="selection-toolbar show">
      <span id="selectionCount">{count} item{count !== 1 ? 's' : ''} selected</span>
      <div>
        {onTagSelected && (
          <button className="btn btn-secondary btn-sm" onClick={onTagSelected}>
            🏷 Tag Selected
          </button>
        )}
        <button className="btn btn-primary btn-sm" onClick={onAddToProject}>
          Add to Project
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onClear}>
          Clear
        </button>
      </div>
    </div>
  );
}
