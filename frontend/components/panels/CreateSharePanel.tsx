'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PanelShell from './PanelShell';

interface CreateSharePanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentProjectId: string | null;
  onOpenShareLinks: () => void;
}

export default function CreateSharePanel({
  isOpen,
  onClose,
  currentProjectId,
  onOpenShareLinks,
}: CreateSharePanelProps) {
  const [password, setPassword] = useState('');
  const [expiryDays, setExpiryDays] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shareLink, setShareLink] = useState<{
    url: string;
    expiresAt: string | null;
  } | null>(null);

  const handleSubmit = async () => {
    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    if (!currentProjectId) {
      setError('No project selected');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const body: Record<string, string | number> = { password };

      if (expiryDays && expiryDays !== '') {
        body.expires_in_days = parseInt(expiryDays, 10);
      }

      const res = await apiFetch(`/api/share/${currentProjectId}/share`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to create share');
      }

      const data = await res.json();
      const shareUrl = `${window.location.origin}/share/${data.share_id}`;

      setShareLink({ url: shareUrl, expiresAt: data.expires_at });
      toast.success('Share link created!');
    } catch (e) {
      const msg = `${e}`;
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (shareLink) {
      try {
        await navigator.clipboard.writeText(shareLink.url);
        toast.success('Link copied to clipboard!');
      } catch {
        toast.error('Failed to copy link');
      }
    }
  };

  const handleDone = () => {
    setPassword('');
    setExpiryDays('');
    setError('');
    setShareLink(null);
    onClose();
    onOpenShareLinks();
  };

  if (shareLink) {
    return (
      <PanelShell isOpen={isOpen} title="Share Link Created" onClose={handleDone}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Share URL</Label>
            <Input readOnly value={shareLink.url} className="font-mono text-xs text-green-400" />
          </div>

          <Button className="w-full" onClick={handleCopyLink}>
            Copy Link
          </Button>

          <p className="text-xs text-muted-foreground">
            {shareLink.expiresAt
              ? `Expires: ${new Date(shareLink.expiresAt).toLocaleString()}`
              : 'Never expires'}
          </p>

          <Button variant="outline" className="w-full" onClick={handleDone}>
            Done
          </Button>
        </div>
      </PanelShell>
    );
  }

  return (
    <PanelShell
      isOpen={isOpen}
      title="Create Share Link"
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
          <Label htmlFor="sharePassword">Password</Label>
          <Input
            id="sharePassword"
            type="password"
            placeholder="Share password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            disabled={loading}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="shareExpiry">Expires in (days, optional)</Label>
          <Input
            id="shareExpiry"
            type="number"
            placeholder="Leave empty for no expiry"
            min="1"
            value={expiryDays}
            onChange={(e) => setExpiryDays(e.target.value)}
            disabled={loading}
          />
        </div>
      </div>
    </PanelShell>
  );
}
