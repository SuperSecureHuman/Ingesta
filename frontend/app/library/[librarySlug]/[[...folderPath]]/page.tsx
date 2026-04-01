'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAppContext } from '@/context/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { usePanels } from '@/hooks/usePanels';
import { useSelection } from '@/hooks/useSelection';
import LibraryView from '@/components/views/LibraryView';
import { PlayerContextProvider } from '@/context/PlayerContext';
import { LutContextProvider } from '@/context/LutContext';
import { PanelContextProvider } from '@/context/PanelContext';
import PlayerContainer from '@/components/player/PlayerContainer';
import AddToProjectPanel from '@/components/panels/AddToProjectPanel';

function LibraryPageInner({ librarySlug, folderPath }: { librarySlug: string; folderPath: string[] }) {
  const { activePanel, openPanel, closePanel } = usePanels();
  const { selectedItems, clearSelection } = useSelection();
  const [resolvedLibraryId, setResolvedLibraryId] = useState<string | undefined>(undefined);

  const handleLibraryResolved = (id: string) => {
    setResolvedLibraryId(id);
  };

  const handleAddSuccess = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  return (
    <PanelContextProvider openPanel={openPanel} closePanel={closePanel} activePanel={activePanel}>
      <div className="p-6">
        <LibraryView
          librarySlug={librarySlug}
          folderPath={folderPath}
          onLibraryResolved={handleLibraryResolved}
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
  );
}

export default function LibraryPage() {
  const params = useParams();
  const librarySlug = params.librarySlug as string;
  const folderPath = params.folderPath as string[] | undefined;
  const router = useRouter();
  const { currentUser, setCurrentUser } = useAppContext();
  const { checkAuth } = useAuth();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const user = await checkAuth();
      if (user) {
        setCurrentUser(user);
      } else {
        router.replace('/');
      }
      setIsLoading(false);
    };
    initAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!currentUser) return null;

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
