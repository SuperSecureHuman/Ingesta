'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { Project, SelectionItem } from '@/lib/types';
import { useToast } from '@/context/ToastContext';
import PanelShell from './PanelShell';

interface AddToProjectPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedItems: Map<string, SelectionItem>;
  currentLibraryId: string | null;
}

export default function AddToProjectPanel({
  isOpen,
  onClose,
  onSuccess,
  selectedItems,
  currentLibraryId,
}: AddToProjectPanelProps) {
  const { showToast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [targetProjectId, setTargetProjectId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadProjects = useCallback(async () => {
    try {
      const res = await apiFetch('/api/projects');
      if (!res.ok) throw new Error('Failed to load projects');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (e) {
      setError(`Error loading projects: ${e}`);
      showToast(`Error loading projects: ${e}`, 'error');
    }
  }, [showToast]);

  useEffect(() => {
    if (isOpen) {
      loadProjects();
      setTargetProjectId('');
      setError('');
    }
  }, [isOpen, loadProjects]);

  const handleSubmit = async () => {
    if (!targetProjectId) {
      setError('Please select a project');
      return;
    }

    setSubmitting(true);
    try {
      let totalAdded = 0;

      // Branch 1: Add individual files
      const files = Array.from(selectedItems.values())
        .filter((item) => item.type === 'file')
        .map((item) => item.path);

      if (files.length > 0) {
        const res = await apiFetch(`/api/projects/${targetProjectId}/files`, {
          method: 'POST',
          body: JSON.stringify({ paths: files }),
        });
        if (!res.ok) throw new Error('Failed to add files');
        const data = await res.json();
        totalAdded += data.added || 0;
      }

      // Branch 2: Add folders (one POST per folder)
      const folders = Array.from(selectedItems.values())
        .filter((item) => item.type === 'folder')
        .map((item) => item.path);

      for (const folderPath of folders) {
        const res = await apiFetch(`/api/projects/${targetProjectId}/files/folder`, {
          method: 'POST',
          body: JSON.stringify({ folder_path: folderPath }),
        });
        if (!res.ok) throw new Error('Failed to add folder');
        const data = await res.json();
        totalAdded += data.added || 0;
      }

      // Branch 3: Add entire library (if no items selected and library is set)
      if (selectedItems.size === 0 && currentLibraryId) {
        const res = await apiFetch(`/api/projects/${targetProjectId}/files/library`, {
          method: 'POST',
          body: JSON.stringify({ library_id: currentLibraryId }),
        });
        if (!res.ok) throw new Error('Failed to add library');
        const data = await res.json();
        totalAdded += data.added || 0;
      }

      showToast(`Added ${totalAdded} files to project`, 'success');
      setError('');
      onSuccess();
      onClose();
    } catch (e) {
      const errorMsg = `${e}`;
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PanelShell
      isOpen={isOpen}
      title="Add to Project"
      onClose={onClose}
      error={error}
    >
      <div className="form-group">
        <label htmlFor="targetProject">Select Project</label>
        <select
          id="targetProject"
          value={targetProjectId}
          onChange={(e) => {
            setTargetProjectId(e.target.value);
            setError('');
          }}
        >
          <option value="">-- Choose project --</option>
          {projects.map((proj) => (
            <option key={proj.id} value={proj.id}>
              {proj.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '13px', color: '#999' }}>
        {selectedItems.size === 0 && currentLibraryId
          ? 'Adding entire library'
          : `${selectedItems.size} item${selectedItems.size !== 1 ? 's' : ''} selected`}
      </div>

      <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
        <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          style={{ flex: 1 }}
          disabled={submitting}
        >
          {submitting ? 'Adding...' : 'Add'}
        </button>
      </div>
    </PanelShell>
  );
}
