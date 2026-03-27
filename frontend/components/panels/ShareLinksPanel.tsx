'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
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
  const { showToast } = useToast();
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
      showToast(`${e}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [currentProjectId, showToast]);

  useEffect(() => {
    if (isOpen) {
      loadShares();
    }
  }, [isOpen, loadShares]);

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied to clipboard!', 'success');
    } catch (e) {
      showToast('Failed to copy link', 'error');
    }
  };

  const handleRevoke = async (shareId: string) => {
    try {
      const res = await apiFetch(`/api/share/${shareId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to revoke share');

      showToast('Share revoked', 'success');
      await loadShares();
    } catch (e) {
      showToast(`${e}`, 'error');
    }
  };

  return (
    <PanelShell
      isOpen={isOpen}
      title="Share Links"
      onClose={onClose}
      error={error}
      footer={
        <button className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>
          Close
        </button>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
          Loading shares...
        </div>
      ) : shares.length === 0 ? (
        <div style={{ padding: '20px', color: '#999', textAlign: 'center' }}>
          No active shares
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {shares.map((share) => {
            const shareUrl = `${window.location.origin}/share/${share.id}`;
            const idPrefix = share.id.substring(0, 8) + '…';
            const expiryText = share.expires_at
              ? `Expires: ${new Date(share.expires_at).toLocaleDateString()}`
              : 'Never expires';

            return (
              <div
                key={share.id}
                style={{
                  border: '1px solid #333',
                  borderRadius: '4px',
                  padding: '12px',
                  background: '#0d0d0d',
                }}
              >
                <div style={{ marginBottom: '8px', fontSize: '12px', color: '#999' }}>
                  {idPrefix}
                </div>

                <div style={{ marginBottom: '8px', fontSize: '11px', color: '#999' }}>
                  {expiryText}
                </div>

                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    background: '#1a1a1a',
                    border: '1px solid #333',
                    color: '#0f0',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    borderRadius: '3px',
                    boxSizing: 'border-box',
                    marginBottom: '8px',
                  }}
                />

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleCopy(shareUrl)}
                    style={{ flex: 1, fontSize: '12px' }}
                  >
                    Copy
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleRevoke(share.id)}
                    style={{ fontSize: '12px' }}
                  >
                    Revoke
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PanelShell>
  );
}
