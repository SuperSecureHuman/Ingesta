'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { ShareFile, LutEntry } from '@/lib/types';
import { formatTime, getResolutionLabel, getFileName } from '@/lib/utils';
import { LutContextProvider } from '@/context/LutContext';
import { PlayerContextProvider, usePlayerContext } from '@/context/PlayerContext';
import PlayerContainer from '@/components/player/PlayerContainer';

export default function ShareViewerPage() {
  const params = useParams();
  const shareId = params.shareId as string;

  const [jwt, setJwt] = useState<string | null>(null);
  const [view, setView] = useState<'password' | 'loaded'>('password');
  const [passwordError, setPasswordError] = useState('');
  const [files, setFiles] = useState<ShareFile[]>([]);
  const [luts, setLuts] = useState<LutEntry[]>([]);

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

      const filesData = await filesRes.json();
      const caps = capsRes.ok ? await capsRes.json() : null;

      setFiles(filesData.files || []);
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
    setView('password');
  }, [shareId]);

  // Password gate
  if (view === 'password') {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 px-4">
        <div className="w-full max-w-md">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 shadow-2xl">
            <h1 className="text-2xl font-bold text-gray-100 mb-2 text-center">Footage Review</h1>
            <p className="text-sm text-gray-500 text-center mb-6">Enter password to access shared footage</p>
            <form onSubmit={submitPassword}>
              <div className="mb-4">
                <input
                  ref={passwordInputRef}
                  type="password"
                  placeholder="Enter password"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-gray-100
                           placeholder-gray-500 focus:outline-none focus:border-accent transition-colors"
                  autoFocus
                />
              </div>
              {passwordError && <div className="text-red-400 text-sm mb-4">{passwordError}</div>}
              <button
                type="submit"
                className="w-full bg-accent hover:bg-amber-500 text-gray-950 font-semibold py-3 rounded-lg transition-colors"
              >
                Watch
              </button>
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
      >
        <ShareMain
          shareId={shareId}
          files={files}
          jwt={jwt}
          onLogout={logout}
        />
      </PlayerContextProvider>
    </LutContextProvider>
  );
}

function ShareMain({
  shareId,
  files,
  jwt,
  onLogout,
}: {
  shareId: string;
  files: ShareFile[];
  jwt: string | null;
  onLogout: () => void;
}) {
  const { startPlayback, isVisible } = usePlayerContext();

  const handleCardClick = (file: ShareFile) => {
    if (file.scan_status === 'pending') return;
    startPlayback(file.file_path);
  };

  return (
    <div className={isVisible ? 'contents' : 'flex flex-col h-screen bg-black'}>
      {/* Header — hidden while player is open */}
      {!isVisible && (
        <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0 bg-gray-900">
          <h1 className="text-lg font-semibold text-gray-100">Shared Footage</h1>
          <button
            onClick={onLogout}
            className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded
                     text-gray-400 hover:text-gray-200 transition-colors"
          >
            Logout
          </button>
        </header>
      )}

      {/* File Grid — hidden while player is open */}
      {!isVisible && (
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {files.length === 0 ? (
              <div className="col-span-full text-center py-20 text-gray-500">No files in this share</div>
            ) : (
              files.map((file) => {
                const fileName = getFileName(file.file_path);
                const posterUrl = `/api/share/${shareId}/thumb?path=${encodeURIComponent(
                  file.file_path
                )}&t=0&token=${encodeURIComponent(jwt || '')}`;
                const durationStr = formatTime(file.duration_seconds || 0);
                const resLabel = getResolutionLabel(file.height || 0);
                const mbps = file.bitrate ? (file.bitrate / 1_000_000).toFixed(1) : '—';
                const isLoading = file.scan_status === 'pending';

                return (
                  <div
                    key={file.id}
                    onClick={() => handleCardClick(file)}
                    className={`group rounded-lg border border-gray-800 bg-gray-900 hover:border-accent overflow-hidden transition-all ${
                      isLoading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                    }`}
                  >
                    <div className="aspect-video relative bg-gray-800">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={posterUrl}
                        alt={fileName}
                        loading="lazy"
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-4xl drop-shadow">▶</span>
                      </div>
                      {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <span className="animate-spin text-2xl">↻</span>
                        </div>
                      )}
                    </div>
                    <div className="px-3 py-3">
                      <p className="text-sm text-gray-200 truncate mb-1" title={fileName}>
                        {fileName}
                      </p>
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>{durationStr}</span>
                        <span>
                          {resLabel} · {mbps}Mbps
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Player — always mounted so PlayerContext manages its own visibility */}
      <PlayerContainer />
    </div>
  );
}
