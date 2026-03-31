'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { Library, BrowseResult, PanelName, SelectionItem } from '@/lib/types';
import { slugify } from '@/lib/utils';
import { useToast } from '@/context/ToastContext';
import { usePlayerContext } from '@/context/PlayerContext';
import { useSelection } from '@/hooks/useSelection';
import { useAuth } from '@/hooks/useAuth';
import Spinner from '@/components/ui/Spinner';
import FileCard from '@/components/cards/FileCard';
import SelectionToolbar from '@/components/ui/SelectionToolbar';

interface LibraryViewProps {
  librarySlug: string;
  folderPath: string[];
  onOpenPanel?: (panelName: PanelName) => void;
  onLibraryResolved?: (libraryId: string, libraryName: string) => void;
}

// Strip the library root_path prefix and return relative URL segments.
// e.g. root="/media/lib", abs="/media/lib/fpv/day1" → ["fpv", "day1"]
function toUrlSegments(absolutePath: string, rootPath: string): string[] {
  if (absolutePath === rootPath) return [];
  const prefix = rootPath.endsWith('/') ? rootPath : rootPath + '/';
  const relative = absolutePath.startsWith(prefix)
    ? absolutePath.slice(prefix.length)
    : absolutePath;
  return relative.split('/').filter(Boolean);
}

// Reconstruct absolute path from root + relative segments.
function toAbsolutePath(rootPath: string, segments: string[]): string {
  if (segments.length === 0) return rootPath;
  return rootPath + '/' + segments.join('/');
}

export default function LibraryView({
  librarySlug,
  folderPath,
  onOpenPanel,
  onLibraryResolved,
}: LibraryViewProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const { startPlayback } = usePlayerContext();
  const { selectedItems, updateSelection, clearSelection } = useSelection();
  const { canEdit } = useAuth();
  const [library, setLibrary] = useState<Library | null>(null);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<BrowseResult | null>(null);

  // Find library by matching its slugified name
  useEffect(() => {
    apiFetch('/api/libraries')
      .then((res) => res.json())
      .then((data) => {
        const found = (data.libraries as Library[]).find(
          (l) => slugify(l.name) === librarySlug
        );
        if (!found) {
          router.replace('/');
          return;
        }
        setLibrary(found);
        onLibraryResolved?.(found.id, found.name);
      })
      .catch(() => router.replace('/'));
  }, [librarySlug]);

  // Reload files whenever library resolves or folderPath changes
  useEffect(() => {
    if (!library) return;
    const absolutePath = toAbsolutePath(library.root_path, folderPath);
    loadLibraryFiles(absolutePath);
  }, [library, folderPath.join('/')]);

  const loadLibraryFiles = async (path: string) => {
    if (!library) return;
    try {
      setLoading(true);
      const browseRes = await apiFetch(
        `/api/libraries/${library.id}/browse?path=${encodeURIComponent(path)}`
      );
      if (!browseRes.ok) {
        showToast('Failed to load files', 'error');
        return;
      }
      const browseData = await browseRes.json();
      setFiles(browseData);
    } catch (e) {
      showToast(`Error: ${e}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFolderOpen = (absoluteFolderPath: string) => {
    if (!library) return;
    const segments = toUrlSegments(absoluteFolderPath, library.root_path);
    const url = segments.length
      ? `/library/${librarySlug}/${segments.map(encodeURIComponent).join('/')}`
      : `/library/${librarySlug}`;
    router.push(url);
  };

  const handleNavigateBack = () => {
    if (!library || !files?.parent) return;
    const segments = toUrlSegments(files.parent, library.root_path);
    const url = segments.length
      ? `/library/${librarySlug}/${segments.map(encodeURIComponent).join('/')}`
      : `/library/${librarySlug}`;
    router.push(url);
  };

  const handleAddEntireLibrary = () => {
    clearSelection();
    onOpenPanel?.('addToProject');
  };

  const handleFilePlay = useCallback((path: string) => {
    startPlayback(path);
  }, [startPlayback]);

  const handleSelectionChange = useCallback((path: string, type: 'file' | 'folder', selected: boolean) => {
    const item: SelectionItem = { type, path };
    updateSelection(item, selected);
  }, [updateSelection]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
        <Spinner />
      </div>
    );
  }

  if (!files) {
    return <div style={{ color: '#666', padding: '20px' }}>Failed to load library files</div>;
  }

  return (
    <div>
      <div className="section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {files.parent !== null && (
            <button className="btn btn-sm" onClick={handleNavigateBack}>
              ← Back
            </button>
          )}
          <h2>Library Files</h2>
        </div>
        {canEdit() && (
          <button className="btn btn-primary btn-sm" onClick={handleAddEntireLibrary}>
            Add Entire Library to Project
          </button>
        )}
      </div>
      <div className="grid">
        {files.entries.length === 0 ? (
          <div style={{ gridColumn: '1/-1', color: '#666', padding: '20px' }}>
            No files in this library.
          </div>
        ) : (
          files.entries.map((entry) => (
            <FileCard
              key={entry.path}
              entry={entry}
              isSelected={selectedItems.has(entry.path)}
              onPlay={handleFilePlay}
              onSelectionChange={handleSelectionChange}
              onFolderOpen={handleFolderOpen}
            />
          ))
        )}
      </div>
      {canEdit() && (
        <SelectionToolbar
          count={selectedItems.size}
          onAddToProject={() => onOpenPanel?.('addToProject')}
          onClear={clearSelection}
        />
      )}
    </div>
  );
}
