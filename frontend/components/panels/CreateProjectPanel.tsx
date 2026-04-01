'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
      toast.success('Project created');
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
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button className="flex-1" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Creating...' : 'Create'}
          </Button>
        </div>
      }
    >
      <div className="space-y-1.5">
        <Label htmlFor="projName">Project Name</Label>
        <Input
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
