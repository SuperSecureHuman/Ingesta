'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
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
  const { showToast } = useToast();
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

      const body: Record<string, string | number> = {
        password,
      };

      if (expiryDays && expiryDays !== '') {
        body.expires_in_days = parseInt(expiryDays, 10);
      }

      const res = await apiFetch(
        `/api/share/${currentProjectId}/share`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to create share');
      }

      const data = await res.json();
      const shareUrl = `${window.location.origin}/share/${data.share_id}`;

      setShareLink({
        url: shareUrl,
        expiresAt: data.expires_at,
      });

      showToast('Share link created!', 'success');
    } catch (e) {
      const msg = `${e}`;
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (shareLink) {
      try {
        await navigator.clipboard.writeText(shareLink.url);
        showToast('Link copied to clipboard!', 'success');
      } catch (e) {
        showToast('Failed to copy link', 'error');
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
    // Share created overlay
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}
      >
        <div
          style={{
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '500px',
            color: '#e0e0e0',
          }}
        >
          <div style={{ marginBottom: '16px', fontSize: '18px', fontWeight: 'bold' }}>
            Share Link Created
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: '#999' }}>
              Share URL
            </label>
            <input
              type="text"
              readOnly
              value={shareLink.url}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#0d0d0d',
                border: '1px solid #333',
                color: '#0f0',
                fontFamily: 'monospace',
                fontSize: '12px',
                borderRadius: '4px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            onClick={handleCopyLink}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: '#0066cc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginBottom: '16px',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            Copy Link
          </button>

          {shareLink.expiresAt && (
            <div style={{ marginBottom: '16px', fontSize: '12px', color: '#999' }}>
              Expires: {new Date(shareLink.expiresAt).toLocaleString()}
            </div>
          )}

          {!shareLink.expiresAt && (
            <div style={{ marginBottom: '16px', fontSize: '12px', color: '#999' }}>
              Never expires
            </div>
          )}

          <button
            onClick={handleDone}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: '#0066cc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <PanelShell
      isOpen={isOpen}
      title="Create Share Link"
      onClose={onClose}
      error={error}
      footer={
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={loading}
            style={{ flex: 1 }}
          >
            {loading ? 'Creating...' : 'Create'}
          </button>
        </div>
      }
    >
      <div className="form-group">
        <label htmlFor="sharePassword">Password</label>
        <input
          type="password"
          id="sharePassword"
          placeholder="Share password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          disabled={loading}
        />
      </div>

      <div className="form-group">
        <label htmlFor="shareExpiry">Expires in (days, optional)</label>
        <input
          type="number"
          id="shareExpiry"
          placeholder="Leave empty for no expiry"
          min="1"
          value={expiryDays}
          onChange={(e) => setExpiryDays(e.target.value)}
          disabled={loading}
        />
      </div>
    </PanelShell>
  );
}
