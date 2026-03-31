'use client';

import { useCallback } from 'react';
import { useAppContext } from '@/context/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { useSelection } from '@/hooks/useSelection';
import { usePanels } from '@/hooks/usePanels';
import { usePlayerContext } from '@/context/PlayerContext';
import Header from './Header';
import Breadcrumb from './Breadcrumb';
import AddToProjectPanel from '@/components/panels/AddToProjectPanel';
import CreateSharePanel from '@/components/panels/CreateSharePanel';
import ShareLinksPanel from '@/components/panels/ShareLinksPanel';
import PlayerContainer from '@/components/player/PlayerContainer';

interface AppShellProps {
  children: React.ReactNode;
  libraryId?: string;
  libraryName?: string;
  projectId?: string;
}

export default function AppShell({ children, libraryId, libraryName, projectId }: AppShellProps) {
  const { currentUser } = useAppContext();
  const { isVisible } = usePlayerContext();
  const { logout } = useAuth();
  const { selectedItems, clearSelection } = useSelection();
  const { activePanel, closePanel, openPanel } = usePanels();

  const handleLogout = useCallback(async () => {
    await logout();
    window.location.reload();
  }, [logout]);

  const handleAddSuccess = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  const handleOpenShareLinks = useCallback(() => {
    openPanel('shareLinks');
  }, [openPanel]);

  return (
    <>
      <div id="idleContainer" className="show" style={isVisible ? { display: 'none' } : undefined}>
        <Header currentUser={currentUser} onLogout={handleLogout} />
        <Breadcrumb libraryName={libraryName} />
        <main id="mainContent">
          {children}
        </main>

        <AddToProjectPanel
          isOpen={activePanel === 'addToProject'}
          onClose={closePanel}
          onSuccess={handleAddSuccess}
          selectedItems={selectedItems}
          currentLibraryId={libraryId ?? null}
        />

        <CreateSharePanel
          isOpen={activePanel === 'createShare'}
          onClose={closePanel}
          currentProjectId={projectId ?? null}
          onOpenShareLinks={handleOpenShareLinks}
        />

        <ShareLinksPanel
          isOpen={activePanel === 'shareLinks'}
          onClose={closePanel}
          currentProjectId={projectId ?? null}
        />
      </div>
      <PlayerContainer />
    </>
  );
}
