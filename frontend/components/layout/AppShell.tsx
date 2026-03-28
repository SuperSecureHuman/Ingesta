'use client';

import { useAppContext } from '@/context/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { useSelection } from '@/hooks/useSelection';
import { usePanels } from '@/hooks/usePanels';
import { usePlayerContext } from '@/context/PlayerContext';
import Header from './Header';
import Breadcrumb from './Breadcrumb';
import HomeView from '@/components/views/HomeView';
import LibraryView from '@/components/views/LibraryView';
import ProjectView from '@/components/views/ProjectView';
import AddToProjectPanel from '@/components/panels/AddToProjectPanel';
import CreateSharePanel from '@/components/panels/CreateSharePanel';
import ShareLinksPanel from '@/components/panels/ShareLinksPanel';
import PlayerContainer from '@/components/player/PlayerContainer';

export default function AppShell() {
  const { currentView, currentUser, currentLibraryId, currentProjectId } = useAppContext();
  const { isVisible } = usePlayerContext();
  const { logout } = useAuth();
  const { clearSelection } = useSelection();
  const { activePanel, closePanel, openPanel } = usePanels();

  const handleLogout = async () => {
    await logout();
    window.location.reload();
  };

  return (
    <>
      <div id="idleContainer" className="show" style={isVisible ? { display: 'none' } : undefined}>
        <Header currentUser={currentUser} onLogout={handleLogout} />
        <Breadcrumb />
        <main id="mainContent">
          {currentView === 'home' && <HomeView />}
          {currentView === 'library' && (
            <LibraryView
              onOpenPanel={openPanel}
            />
          )}
          {currentView === 'project' && <ProjectView onOpenPanel={openPanel} />}
        </main>

        <AddToProjectPanel
          isOpen={activePanel === 'addToProject'}
          onClose={closePanel}
          onSuccess={() => clearSelection()}
          selectedItems={new Map()}
          currentLibraryId={currentLibraryId}
        />

        <CreateSharePanel
          isOpen={activePanel === 'createShare'}
          onClose={closePanel}
          currentProjectId={currentProjectId}
          onOpenShareLinks={() => openPanel('shareLinks')}
        />

        <ShareLinksPanel
          isOpen={activePanel === 'shareLinks'}
          onClose={closePanel}
          currentProjectId={currentProjectId}
        />
      </div>
      <PlayerContainer />
    </>
  );
}
