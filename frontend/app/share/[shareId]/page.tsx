'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ShareFile, ShareFilesResponse, LutEntry } from '@/lib/types';
import { LutContextProvider } from '@/context/LutContext';
import { PlayerContextProvider, usePlayerContext } from '@/context/PlayerContext';
import PlayerContainer from '@/components/player/PlayerContainer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ShareFileCard from './ShareFileCard';

// ── Grid stagger variants (match ProjectView pattern) ─────────────────────────
const gridContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const gridItem = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  },
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ShareViewerPage() {
  const params = useParams();
  const shareId = params.shareId as string;

  const [jwt, setJwt] = useState<string | null>(null);
  const [view, setView] = useState<'password' | 'loaded'>('password');
  const [passwordError, setPasswordError] = useState('');
  const [files, setFiles] = useState<ShareFile[]>([]);
  const [luts, setLuts] = useState<LutEntry[]>([]);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const passwordInputRef = useRef<HTMLInputElement>(null);
  const jwtRef = useRef<string | null>(null);

  // Load from session storage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(`share_jwt_${shareId}`);
    if (stored) {
      jwtRef.current = stored;
      setJwt(stored);
      loadFiles(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId]);

  const shareFetch = useCallback(
    (url: string, init?: RequestInit): Promise<Response> => {
      const token = jwtRef.current;
      return fetch(url, {
        ...init,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init?.headers ?? {}),
        },
      });
    },
    [] // stable — reads jwtRef.current at call time
  );

  const shareXhrSetup = useCallback((xhr: XMLHttpRequest) => {
    if (jwtRef.current) {
      xhr.setRequestHeader('Authorization', `Bearer ${jwtRef.current}`);
    }
  }, []);

  const loadFiles = async (token: string) => {
    try {
      const [filesRes, capsRes] = await Promise.all([
        fetch(`/api/share/${shareId}/files`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/share/${shareId}/capabilities`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (filesRes.status === 401) {
        logout();
        return;
      }
      if (!filesRes.ok) throw new Error('Failed to load files');

      const filesData: ShareFilesResponse = await filesRes.json();
      const caps = capsRes.ok ? await capsRes.json() : null;

      setFiles(filesData.files ?? []);
      setProjectName(filesData.project_name ?? null);
      setExpiresAt(filesData.expires_at ?? null);
      setLuts(caps?.luts ?? []);
      setView('loaded');
    } catch (e) {
      console.error('Failed to load files:', e);
    }
  };

  const submitPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const password = passwordInputRef.current?.value || '';
    setPasswordError('');

    try {
      const res = await fetch(`/api/share/${shareId}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setPasswordError(data.detail || 'Invalid password');
        return;
      }

      const data = await res.json();
      jwtRef.current = data.token;
      setJwt(data.token);
      sessionStorage.setItem(`share_jwt_${shareId}`, data.token);
      if (passwordInputRef.current) passwordInputRef.current.value = '';

      loadFiles(data.token);
    } catch (e) {
      setPasswordError('Connection error: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const logout = useCallback(() => {
    sessionStorage.removeItem(`share_jwt_${shareId}`);
    jwtRef.current = null;
    setJwt(null);
    setFiles([]);
    setProjectName(null);
    setExpiresAt(null);
    setView('password');
  }, [shareId]);

  // Build initialAnnotations map for the player (preloaded — no extra API calls)
  const initialAnnotations = useMemo(
    () =>
      Object.fromEntries(
        files.map((f) => [
          f.file_path,
          { comments: f.comments ?? [], markers: f.markers ?? [] },
        ])
      ),
    [files]
  );

  // ── Password gate ─────────────────────────────────────────────────────────
  if (view === 'password') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background px-4">
        <div className="w-full max-w-md">
          <div className="bg-card border border-border rounded-xl p-8 shadow-2xl">
            <h1 className="text-2xl font-bold text-foreground mb-2 text-center">Footage Review</h1>
            <p className="text-sm text-muted-foreground text-center mb-6">
              Enter password to access shared footage
            </p>
            <form onSubmit={submitPassword} className="space-y-4">
              <Input
                ref={passwordInputRef}
                type="password"
                placeholder="Password"
                className="h-11 bg-zinc-900 border-border focus-visible:border-primary/50"
                autoFocus
              />
              {passwordError && (
                <p className="text-destructive text-sm">{passwordError}</p>
              )}
              <Button type="submit" className="w-full h-11 font-semibold">
                Watch
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <LutContextProvider initialLuts={luts}>
      <PlayerContextProvider
        fetchFn={shareFetch}
        apiBase={`/api/share/${shareId}`}
        xhrSetup={shareXhrSetup}
        readOnly={true}
        initialAnnotations={initialAnnotations}
      >
        <ShareMain
          shareId={shareId}
          files={files}
          jwt={jwt}
          projectName={projectName}
          expiresAt={expiresAt}
          onLogout={logout}
        />
      </PlayerContextProvider>
    </LutContextProvider>
  );
}

// ── Share Main ────────────────────────────────────────────────────────────────

function ShareMain({
  shareId,
  files,
  jwt,
  projectName,
  expiresAt,
  onLogout,
}: {
  shareId: string;
  files: ShareFile[];
  jwt: string | null;
  projectName: string | null;
  expiresAt: string | null;
  onLogout: () => void;
}) {
  const { startPlayback, isVisible } = usePlayerContext();

  const handleCardClick = (file: ShareFile, sourceRect: DOMRect) => {
    if (file.scan_status === 'pending') return;
    startPlayback(file.file_path, 0, undefined, sourceRect);
  };

  return (
    <div className={isVisible ? 'contents' : 'flex flex-col h-screen bg-background'}>
      {/* Header — hidden while player is open */}
      {!isVisible && (
        <header className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 bg-card">
          <div>
            <h1 className="text-base font-semibold text-foreground">
              {projectName ?? 'Shared Footage'}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {files.length} file{files.length !== 1 ? 's' : ''}
              {expiresAt && ` · Expires ${new Date(expiresAt).toLocaleDateString()}`}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onLogout}>
            Logout
          </Button>
        </header>
      )}

      {/* File grid — hidden while player is open */}
      {!isVisible && (
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <motion.div
            key={`files-${files.length}`}
            className="grid-cards"
            variants={gridContainer}
            initial="hidden"
            animate="show"
          >
            {files.length === 0 ? (
              <div className="col-span-full text-center py-20 text-muted-foreground">
                No files in this share
              </div>
            ) : (
              files.map((file) => (
                <motion.div key={file.id} variants={gridItem}>
                  <ShareFileCard
                    file={file}
                    shareId={shareId}
                    jwt={jwt}
                    onPlay={handleCardClick}
                  />
                </motion.div>
              ))
            )}
          </motion.div>
        </div>
      )}

      {/* Player — always mounted so PlayerContext manages its own visibility */}
      <PlayerContainer />
    </div>
  );
}
