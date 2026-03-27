'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import PanelShell from './PanelShell';

interface CreateProjectPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateProjectPanel({
  isOpen,
  onClose,
  onSuccess,
}: CreateProjectPanelProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name) {
      setError('Please enter a project name');
      return;
    }

    try {
      setLoading(true);
      const res = await apiFetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.detail || 'Failed to create project');
        return;
      }

      setName('');
      showToast('Project created', 'success');
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
      title="New Project"
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
        <label htmlFor="projName">Project Name</label>
        <input
          type="text"
          id="projName"
          placeholder="e.g., Commercial Shoot"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>
    </PanelShell>
  );
}
