'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { BrowseResult } from '@/lib/types';
import Spinner from './Spinner';

interface FsBrowserModalProps {
  onSelect: (path: string) => void;
  onClose: () => void;
}

export default function FsBrowserModal({ onSelect, onClose }: FsBrowserModalProps) {
  const [result, setResult] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const navigate = useCallback(async (path: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/api/admin/fs-browse?path=${encodeURIComponent(path)}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.detail || 'Failed to load directory');
        return;
      }
      const data: BrowseResult = await res.json();
      setResult(data);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    navigate('/');
  }, [navigate]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const atRoot = result ? result.parent === null : false;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        width: '520px',
        maxWidth: '95vw',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontWeight: 600, fontSize: '15px' }}>Browse Filesystem</span>
          <button
            className="btn btn-secondary"
            style={{ padding: '4px 10px', fontSize: '16px', lineHeight: 1 }}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* Path bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '10px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
        }}>
          <span style={{
            flex: 1, fontSize: '13px', fontFamily: 'monospace',
            color: 'var(--text-primary)', wordBreak: 'break-all',
          }}>
            {result?.path ?? '/'}
          </span>
          <button
            className="btn btn-secondary"
            style={{ fontSize: '13px', padding: '4px 10px', whiteSpace: 'nowrap' }}
            disabled={atRoot || loading}
            onClick={() => result?.parent && navigate(result.parent)}
          >
            ← Back
          </button>
        </div>

        {/* Directory list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
              <Spinner />
            </div>
          )}
          {!loading && error && (
            <div style={{ padding: '12px 20px', color: 'var(--error)', fontSize: '13px' }}>
              {error}
            </div>
          )}
          {!loading && !error && result && result.entries.length === 0 && (
            <div style={{ padding: '12px 20px', color: 'var(--text-muted)', fontSize: '13px' }}>
              No subdirectories
            </div>
          )}
          {!loading && !error && result?.entries.map((entry) => (
            <div
              key={entry.path}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '8px 20px', cursor: 'pointer', fontSize: '14px',
              }}
              className="fs-browser-row"
              onClick={() => navigate(entry.path)}
            >
              <span style={{ fontSize: '16px' }}>📁</span>
              <span style={{ flex: 1, color: 'var(--text-primary)' }}>{entry.name}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>›</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '12px 20px',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span style={{
            flex: 1, fontSize: '12px', color: 'var(--text-muted)',
            fontFamily: 'monospace', wordBreak: 'break-all',
          }}>
            {result ? `Selected: ${result.path}` : ''}
          </span>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!result}
            onClick={() => result && onSelect(result.path)}
          >
            Select ✓
          </button>
        </div>
      </div>

      <style>{`
        .fs-browser-row:hover {
          background: var(--bg-secondary);
        }
      `}</style>
    </div>
  );
}
