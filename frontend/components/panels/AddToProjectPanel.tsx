'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { SelectionItem } from '@/lib/types';
import { toast } from 'sonner';
import { useAppContext } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  const { projects } = useAppContext();
  const [targetProjectId, setTargetProjectId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTargetProjectId('');
      setError('');
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!targetProjectId) {
      setError('Please select a project');
      return;
    }

    setSubmitting(true);
    try {
      let totalAdded = 0;

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

      if (selectedItems.size === 0 && currentLibraryId) {
        const res = await apiFetch(`/api/projects/${targetProjectId}/files/library`, {
          method: 'POST',
          body: JSON.stringify({ library_id: currentLibraryId }),
        });
        if (!res.ok) throw new Error('Failed to add library');
        const data = await res.json();
        totalAdded += data.added || 0;
      }

      toast.success(`Added ${totalAdded} files to project`);
      setError('');
      onSuccess();
      onClose();
    } catch (e) {
      const errorMsg = `${e}`;
      setError(errorMsg);
      toast.error(errorMsg);
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
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Select Project</Label>
          <Select value={targetProjectId} onValueChange={(v) => { setTargetProjectId(v ?? ''); setError(''); }}>
            <SelectTrigger>
              <SelectValue placeholder="Choose project…" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((proj) => (
                <SelectItem key={proj.id} value={proj.id}>{proj.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-sm text-muted-foreground text-center">
          {selectedItems.size === 0 && currentLibraryId
            ? 'Adding entire library'
            : `${selectedItems.size} item${selectedItems.size !== 1 ? 's' : ''} selected`}
        </p>

        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button className="flex-1" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Adding...' : 'Add'}
          </Button>
        </div>
      </div>
    </PanelShell>
  );
}
