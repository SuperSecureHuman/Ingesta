'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import PanelShell from './PanelShell';
import FsBrowserModal from '@/components/ui/FsBrowserModal';

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
  const [showBrowser, setShowBrowser] = useState(false);
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
        <label>Root Path</label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{
            flex: 1, padding: '8px', background: 'var(--bg-secondary)',
            border: '1px solid var(--border)', borderRadius: '4px',
            color: path ? 'var(--text-primary)' : 'var(--text-muted)',
            fontSize: '14px', wordBreak: 'break-all',
          }}>
            {path || 'No folder selected'}
          </span>
          <button type="button" className="btn btn-secondary"
                  onClick={() => setShowBrowser(true)}>
            Browse…
          </button>
        </div>
      </div>
      {showBrowser && (
        <FsBrowserModal
          onSelect={(p) => { setPath(p); setShowBrowser(false); }}
          onClose={() => setShowBrowser(false)}
        />
      )}
    </PanelShell>
  );
}
