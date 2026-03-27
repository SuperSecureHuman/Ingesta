'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { BrowseResult, SelectionItem } from '@/lib/types';
import { useToast } from '@/context/ToastContext';
import { useAppContext } from '@/context/AppContext';
import Spinner from '@/components/ui/Spinner';
import FileCard from '@/components/cards/FileCard';
import SelectionToolbar from '@/components/ui/SelectionToolbar';

interface LibraryViewProps {
  onOpenPanel: (panelName: string) => void;
  selectedItems: Map<string, SelectionItem>;
  onUpdateSelection: (item: SelectionItem, selected: boolean) => void;
  onClearSelection: () => void;
}

export default function LibraryView({
  onOpenPanel,
  selectedItems,
  onUpdateSelection,
  onClearSelection,
}: LibraryViewProps) {
  const { currentLibraryId, setCurrentView } = useAppContext();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<BrowseResult | null>(null);

  useEffect(() => {
    if (!currentLibraryId) {
      setCurrentView('home');
      return;
    }
    loadLibraryFiles();
  }, [currentLibraryId, setCurrentView]);

  const loadLibraryFiles = async () => {
    if (!currentLibraryId) return;
    try {
      setLoading(true);
      // First get library to get root_path
      const libRes = await apiFetch(`/api/libraries/${currentLibraryId}`);
      if (!libRes.ok) {
        showToast('Failed to load library', 'error');
        setCurrentView('home');
        return;
      }

      const libData = await libRes.json();
      const rootPath = libData.root_path;

      // Then browse the root path
      const browseRes = await apiFetch(
        `/api/libraries/${currentLibraryId}/browse?path=${encodeURIComponent(rootPath)}`
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

  const handleAddEntireLibrary = () => {
    onClearSelection();
    onOpenPanel('addToProject');
  };

  const handleFilePlay = (path: string) => {
    // Placeholder for player integration (will be done in Phase 7)
    showToast('Player integration coming soon', 'error');
  };

  const handleSelectionChange = (path: string, type: 'file' | 'folder', selected: boolean) => {
    const item: SelectionItem = { type, path };
    onUpdateSelection(item, selected);
  };

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
        <h2>Library Files</h2>
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
          files.entries.map((entry, idx) => (
            <FileCard
              key={`${entry.path}-${idx}`}
              entry={entry}
              isSelected={selectedItems.has(entry.path)}
              onPlay={handleFilePlay}
              onSelectionChange={handleSelectionChange}
            />
          ))
        )}
      </div>
      <SelectionToolbar
        count={selectedItems.size}
        onAddToProject={() => onOpenPanel('addToProject')}
        onClear={onClearSelection}
      />
    </div>
  );
}
