'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import PanelShell from './PanelShell';

interface CreateLibraryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateLibraryPanel({
  isOpen,
  onClose,
  onSuccess,
}: CreateLibraryPanelProps) {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !path) {
      setError('Please fill in all fields');
      return;
    }

    try {
      setLoading(true);
      const res = await apiFetch('/api/libraries', {
        method: 'POST',
        body: JSON.stringify({ name, root_path: path }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.detail || 'Failed to create library');
        return;
      }

      setName('');
      setPath('');
      showToast('Library created', 'success');
      onSuccess();
    } catch (e) {
      setError(`Error: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PanelShell
      isOpen={isOpen}
      title="New Library"
      onClose={onClose}
      error={error}
      footer={
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create'}
          </button>
        </div>
      }
    >
      <div className="form-group">
        <label htmlFor="libName">Library Name</label>
        <input
          type="text"
          id="libName"
          placeholder="e.g., Drone Footage"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label htmlFor="libPath">Root Path</label>
        <input
          type="text"
          id="libPath"
          placeholder="e.g., /media/footage"
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />
      </div>
    </PanelShell>
  );
}
