'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PanelShell from './PanelShell';
import FsBrowserModal from '@/components/custom/FsBrowserModal';

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
      toast.success('Library created');
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
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button className="flex-1" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Creating...' : 'Create'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="libName">Library Name</Label>
          <Input
            id="libName"
            placeholder="e.g., Drone Footage"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Root Path</Label>
          <div className="flex gap-2 items-center">
            <div className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground min-h-9 break-all">
              {path || 'No folder selected'}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowBrowser(true)}>
              Browse…
            </Button>
          </div>
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
