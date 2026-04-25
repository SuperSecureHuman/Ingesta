'use client';

import { useCallback, useState } from 'react';
import { useParams } from 'next/navigation';
import { usePanels } from '@/hooks/usePanels';
import { useSelection } from '@/context/SelectionContext';
import LibraryView from '@/components/views/LibraryView';
import { PlayerContextProvider } from '@/context/PlayerContext';
import { LutContextProvider } from '@/context/LutContext';
import { PanelContextProvider } from '@/context/PanelContext';
import PlayerContainer from '@/components/player/PlayerContainer';
import AddToProjectPanel from '@/components/panels/AddToProjectPanel';
import { PageSpinner } from '@/components/ui/PageSpinner';
import { useRequireAuth } from '@/hooks/useRequireAuth';

function LibraryPageInner({ librarySlug, folderPath }: { librarySlug: string; folderPath: string[] }) {
  const { activePanel, openPanel, closePanel } = usePanels();
  const { selectedItems, clearSelection } = useSelection();
  const [resolvedLibraryId, setResolvedLibraryId] = useState<string | undefined>(undefined);
  const [dataReady, setDataReady] = useState(false);

  const handleLibraryResolved = (id: string) => {
    setResolvedLibraryId(id);
  };

  const handleAddSuccess = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  return (
    <>
      {!dataReady && <PageSpinner />}
      <div className={dataReady ? '' : 'hidden'}>
        <PanelContextProvider openPanel={openPanel} closePanel={closePanel} activePanel={activePanel}>
          <div className="p-6">
            <LibraryView
              librarySlug={librarySlug}
              folderPath={folderPath}
              onLibraryResolved={handleLibraryResolved}
              onReady={() => setDataReady(true)}
            />
          </div>
          <AddToProjectPanel
            isOpen={activePanel === 'addToProject'}
            onClose={closePanel}
            onSuccess={handleAddSuccess}
            selectedItems={selectedItems}
            currentLibraryId={resolvedLibraryId ?? null}
          />
          <PlayerContainer />
        </PanelContextProvider>
      </div>
    </>
  );
}

export default function LibraryPage() {
  const params = useParams();
  const librarySlug = params.librarySlug as string;
  const folderPath = params.folderPath as string[] | undefined;
  const { user, isLoading } = useRequireAuth();

  if (isLoading) {
    return <PageSpinner />;
  }

  if (!user) return null;

  return (
    <LutContextProvider>
      <PlayerContextProvider>
        <LibraryPageInner
          librarySlug={librarySlug}
          folderPath={folderPath ?? []}
        />
      </PlayerContextProvider>
    </LutContextProvider>
  );
}
