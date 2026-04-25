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
    <div className="flex items-center justify-center h-screen">
      <div className="text-center max-w-[400px] w-full px-4">
        <h1 className="text-2xl font-bold mb-2">Shared Footage</h1>
        <p className="text-muted-foreground mb-6">Enter the password to view this share</p>

        <form onSubmit={submitPassword}>
          <input
            ref={passwordInputRef}
            type="password"
            placeholder="Password"
            autoFocus
            disabled={loading}
            className="w-full p-3 mb-3 bg-zinc-800 border border-zinc-600 rounded text-white text-base box-border focus:outline-none focus:border-primary disabled:opacity-50"
          />

          {passwordError && (
            <div className="text-destructive mb-3 text-sm">
              {passwordError}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full p-3 rounded font-bold text-black transition-colors bg-primary hover:bg-primary/90 disabled:bg-zinc-600 disabled:text-zinc-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Checking...' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  );
}
