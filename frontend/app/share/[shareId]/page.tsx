'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { gridContainer, gridItem } from '@/lib/animations';
import { ShareFile, ShareFilesResponse, LutEntry, BrowseEntry } from '@/lib/types';
import { LutContextProvider } from '@/context/LutContext';
import { PlayerContextProvider, usePlayerContext } from '@/context/PlayerContext';
import PlayerContainer from '@/components/player/PlayerContainer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import FileCard from '@/components/cards/FileCard';

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

  // Token lives in jwtRef (stable ref for callbacks) and jwt state (for re-renders).
  // It is never persisted to sessionStorage — re-entering password is required after navigation.
  useEffect(() => {
    // Nothing to restore from storage — intentional security decision (SEC-13).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setProjectName(filesData.share_name ?? filesData.project_name ?? null);
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
      if (passwordInputRef.current) passwordInputRef.current.value = '';

      loadFiles(data.token);
    } catch (e) {
      setPasswordError('Connection error: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const logout = useCallback(() => {
    jwtRef.current = null;
    setJwt(null);
    setFiles([]);
    setProjectName(null);
    setExpiresAt(null);
    setView('password');
  }, []);

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

// Build a tree: given all files and a current path prefix, return
// immediate child folders and files at that level.
function browseLevel(files: ShareFile[], currentPath: string): {
  folders: string[];   // immediate child folder names
  files: ShareFile[];  // files directly in currentPath
} {
  const prefix = currentPath ? currentPath + '/' : '';
  const subFolders = new Set<string>();
  const levelFiles: ShareFile[] = [];

  for (const file of files) {
    const rel = file.relative_path ?? '';
    if (!rel.startsWith(prefix)) continue;
    const rest = rel.slice(prefix.length);
    const slashIdx = rest.indexOf('/');
    if (slashIdx === -1) {
      // file directly in this folder
      levelFiles.push(file);
    } else {
      // file is deeper — record the immediate child folder
      subFolders.add(rest.slice(0, slashIdx));
    }
  }

  return {
    folders: Array.from(subFolders).sort(),
    files: levelFiles,
  };
}

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
  const [currentPath, setCurrentPath] = useState('');

  const hasFolderStructure = files.some(f => (f.relative_path ?? '').includes('/'));

  const { folders, files: levelFiles } = hasFolderStructure
    ? browseLevel(files, currentPath)
    : { folders: [], files };

  const handlePlay = (path: string, sourceRect?: DOMRect) => {
    startPlayback(path, 0, undefined, sourceRect);
  };

  const noop = () => {};
  const pathParts = currentPath ? currentPath.split('/') : [];

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className={`flex items-center justify-between px-6 py-4 border-b border-border shrink-0 bg-card${isVisible ? ' hidden' : ''}`}>
        <div>
          <h1 className="text-base font-semibold text-foreground">
            {projectName ?? 'Shared Footage'}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {files.length} file{files.length !== 1 ? 's' : ''}
            {expiresAt && ` · Expires ${new Date(expiresAt).toLocaleDateString()}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onLogout}>Logout</Button>
      </header>

      <div className={`flex-1 overflow-y-auto px-6 py-6${isVisible ? ' hidden' : ''}`}>
        {hasFolderStructure && (
          <div className="flex items-center gap-1.5 mb-5 text-sm">
            <button onClick={() => setCurrentPath('')} className="text-muted-foreground hover:text-foreground transition-colors">
              {projectName ?? 'Root'}
            </button>
            {pathParts.map((part, i) => (
              <React.Fragment key={i}>
                <span className="text-muted-foreground/40">/</span>
                <button
                  onClick={() => setCurrentPath(pathParts.slice(0, i + 1).join('/'))}
                  className={i === pathParts.length - 1 ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground transition-colors'}
                >
                  {part}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}

        {files.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">No files in this share</div>
        ) : (
          <motion.div key={currentPath} className="grid-cards" variants={gridContainer} initial="hidden" animate="show">
            {folders.map((folder) => {
              const folderEntry: BrowseEntry = {
                name: folder,
                path: currentPath ? `${currentPath}/${folder}` : folder,
                is_dir: true,
                is_video: false,
              };
              return (
                <motion.div key={`folder-${folder}`} variants={gridItem}>
                  <FileCard
                    entry={folderEntry}
                    isSelected={false}
                    onPlay={noop}
                    onSelectionChange={noop}
                    onFolderOpen={(p) => setCurrentPath(p)}
                  />
                </motion.div>
              );
            })}
            {levelFiles.map((file) => {
              const fileEntry: BrowseEntry = {
                name: file.relative_path?.split('/').pop() ?? file.file_path.split('/').pop() ?? '',
                path: file.file_path,
                is_dir: false,
                is_video: true,
              };
              const thumbUrl = `/api/share/${shareId}/thumb?path=${encodeURIComponent(file.file_path)}&t=0&token=${encodeURIComponent(jwt || '')}`;
              return (
                <motion.div key={file.id} variants={gridItem}>
                  <FileCard
                    entry={fileEntry}
                    isSelected={false}
                    onPlay={handlePlay}
                    onSelectionChange={noop}
                    thumbUrlOverride={thumbUrl}
                    tags={file.tags}
                    rating={file.rating}
                    canEditAnnotations={false}
                  />
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      <PlayerContainer />
    </div>
  );
}
