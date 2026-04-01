'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PanelShell from './PanelShell';

interface Share {
  id: string;
  project_id: string;
  created_at: string;
  expires_at: string | null;
}

interface ShareLinksPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentProjectId: string | null;
}

export default function ShareLinksPanel({
  isOpen,
  onClose,
  currentProjectId,
}: ShareLinksPanelProps) {
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadShares = useCallback(async () => {
    if (!currentProjectId) return;

    try {
      setLoading(true);
      setError('');

      const res = await apiFetch(`/api/share/${currentProjectId}/shares`);
      if (!res.ok) throw new Error('Failed to load shares');

      const data = await res.json();
      setShares(data.shares || []);
    } catch (e) {
      setError(`${e}`);
      toast.error(`${e}`);
    } finally {
      setLoading(false);
    }
  }, [currentProjectId]);

  useEffect(() => {
    if (isOpen) {
      loadShares();
    }
  }, [isOpen, loadShares]);

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard!');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleRevoke = async (shareId: string) => {
    try {
      const res = await apiFetch(`/api/share/${shareId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to revoke share');
      toast.success('Share revoked');
      await loadShares();
    } catch (e) {
      toast.error(`${e}`);
    }
  };

  return (
    <PanelShell
      isOpen={isOpen}
      title="Share Links"
      onClose={onClose}
      error={error}
      footer={
        <Button variant="outline" className="w-full" onClick={onClose}>Close</Button>
      }
    >
      {loading ? (
        <div className="text-center py-5 text-muted-foreground text-sm">Loading shares...</div>
      ) : shares.length === 0 ? (
        <div className="text-center py-5 text-muted-foreground text-sm">No active shares</div>
      ) : (
        <div className="space-y-4">
          {shares.map((share) => {
            const shareUrl = `${window.location.origin}/share/${share.id}`;
            const idPrefix = share.id.substring(0, 8) + '…';
            const expiryText = share.expires_at
              ? `Expires: ${new Date(share.expires_at).toLocaleDateString()}`
              : 'Never expires';

            return (
              <div key={share.id} className="rounded-md border border-border bg-zinc-900/50 p-3 space-y-2">
                <div className="text-xs text-muted-foreground">{idPrefix}</div>
                <div className="text-xs text-muted-foreground">{expiryText}</div>
                <Input readOnly value={shareUrl} className="font-mono text-xs text-green-400 h-8" />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleCopy(shareUrl)}>
                    Copy
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleRevoke(share.id)}>
                    Revoke
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PanelShell>
  );
}
