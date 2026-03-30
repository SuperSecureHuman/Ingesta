'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { BrowseResult, PanelName, SelectionItem } from '@/lib/types';
import { useToast } from '@/context/ToastContext';
import { useAppContext } from '@/context/AppContext';
import { usePlayerContext } from '@/context/PlayerContext';
import { useSelection } from '@/hooks/useSelection';
import Spinner from '@/components/ui/Spinner';
import FileCard from '@/components/cards/FileCard';
import SelectionToolbar from '@/components/ui/SelectionToolbar';

interface LibraryViewProps {
  onOpenPanel: (panelName: PanelName) => void;
}

export default function LibraryView({
  onOpenPanel,
}: LibraryViewProps) {
  const { currentLibraryId, currentLibrary, setCurrentView } = useAppContext();
  const { showToast } = useToast();
  const { startPlayback } = usePlayerContext();
  const { selectedItems, updateSelection, clearSelection } = useSelection();
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<BrowseResult | null>(null);
  const [currentPath, setCurrentPath] = useState<string>('');

  useEffect(() => {
    if (!currentLibraryId || !currentLibrary) {
      setCurrentView('home');
      return;
    }
    // Initialize to root path
    setCurrentPath(currentLibrary.root_path);
    loadLibraryFiles(currentLibrary.root_path);
  }, [currentLibraryId, currentLibrary, setCurrentView]);

  const loadLibraryFiles = async (path: string) => {
    if (!currentLibraryId || !currentLibrary) return;
    try {
      setLoading(true);

      // Browse the given path
      const browseRes = await apiFetch(
        `/api/libraries/${currentLibraryId}/browse?path=${encodeURIComponent(path)}`
      );
      if (!browseRes.ok) {
        showToast('Failed to load files', 'error');
        return;
      }

      const browseData = await browseRes.json();
      setFiles(browseData);
      setCurrentPath(path);
    } catch (e) {
      showToast(`Error: ${e}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFolderOpen = (folderPath: string) => {
    loadLibraryFiles(folderPath);
  };

  const handleNavigateBack = () => {
    if (files?.parent) {
      loadLibraryFiles(files.parent);
    }
  };

  const handleAddEntireLibrary = () => {
    clearSelection();
    onOpenPanel('addToProject');
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
          {currentPath && currentPath !== currentLibrary?.root_path && (
            <button className="btn btn-sm" onClick={handleNavigateBack}>
              ← Back
            </button>
          )}
          <h2>Library Files</h2>
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleAddEntireLibrary}>
          Add Entire Library to Project
        </button>
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
      <SelectionToolbar
        count={selectedItems.size}
        onAddToProject={() => onOpenPanel('addToProject')}
        onClear={clearSelection}
      />
    </div>
  );
}
