'use client';

import React, { useRef, useState, useCallback } from 'react';

interface PasswordFormProps {
  shareId: string;
  onSuccess: (jwt: string, files: ShareFile[]) => void;
  onError: (error: string) => void;
}

interface ShareFile {
  id: number;
  file_path: string;
  duration_seconds?: number;
  width?: number;
  height?: number;
  scan_status: 'pending' | 'done' | 'error';
}

export function PasswordForm({ shareId, onSuccess, onError }: PasswordFormProps) {
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);

  const submitPassword = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const password = passwordInputRef.current?.value || '';

      setPasswordError('');
      setLoading(true);

      try {
        const res = await fetch(`/api/share/${shareId}/unlock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.detail || 'Invalid password');
        }

        const data = await res.json();
        const token = data.jwt;

        sessionStorage.setItem(`share_jwt_${shareId}`, token);

        // Fetch files with token
        const filesRes = await fetch(`/api/share/${shareId}/files`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!filesRes.ok) throw new Error('Failed to load files');

        const filesData = await filesRes.json();
        onSuccess(token, filesData.files || []);
      } catch (e) {
        const msg = `${e}`;
        setPasswordError(msg);
        onError(msg);
      } finally {
        setLoading(false);
      }
    },
    [shareId, onSuccess, onError]
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ textAlign: 'center', maxWidth: '400px' }}>
        <h1>Shared Footage</h1>
        <p style={{ color: '#999', marginBottom: '24px' }}>Enter the password to view this share</p>

        <form onSubmit={submitPassword}>
          <input
            ref={passwordInputRef}
            type="password"
            placeholder="Password"
            autoFocus
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '12px',
              background: '#222',
              border: '1px solid #444',
              borderRadius: '4px',
              color: '#fff',
              fontSize: '16px',
              boxSizing: 'border-box',
            }}
          />

          {passwordError && (
            <div style={{ color: '#ff6b6b', marginBottom: '12px', fontSize: '14px' }}>
              {passwordError}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: loading ? '#444' : '#e5a00d',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
            }}
          >
            {loading ? 'Checking...' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  );
}
