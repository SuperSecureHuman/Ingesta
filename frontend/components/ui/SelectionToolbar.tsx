'use client';

interface SelectionToolbarProps {
  count: number;
  onAddToProject: () => void;
  onClear: () => void;
}

export default function SelectionToolbar({ count, onAddToProject, onClear }: SelectionToolbarProps) {
  if (count === 0) {
    return null;
  }

  return (
    <div className="selection-toolbar show">
      <span id="selectionCount">{count} item{count !== 1 ? 's' : ''} selected</span>
      <div>
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
