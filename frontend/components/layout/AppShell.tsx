'use client';

import { useAppContext } from '@/context/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { useSelection } from '@/hooks/useSelection';
import { usePanels } from '@/hooks/usePanels';
import Header from './Header';
import Breadcrumb from './Breadcrumb';
import HomeView from '@/components/views/HomeView';
import LibraryView from '@/components/views/LibraryView';
import ProjectView from '@/components/views/ProjectView';
import AddToProjectPanel from '@/components/panels/AddToProjectPanel';

export default function AppShell() {
  const { currentView, currentUser, currentLibraryId } = useAppContext();
  const { logout } = useAuth();
  const { selectedItems, updateSelection, clearSelection } = useSelection();
  const { activePanel, closePanel, openPanel } = usePanels();

  const handleLogout = async () => {
    await logout();
    window.location.reload();
  };

  return (
    <div id="idleContainer" className="show">
      <Header currentUser={currentUser} onLogout={handleLogout} />
      <Breadcrumb />
      <main id="mainContent">
        {currentView === 'home' && <HomeView />}
        {currentView === 'library' && (
          <LibraryView
            onOpenPanel={openPanel}
            selectedItems={selectedItems}
            onUpdateSelection={updateSelection}
            onClearSelection={clearSelection}
          />
        )}
        {currentView === 'project' && <ProjectView />}
      </main>

      <AddToProjectPanel
        isOpen={activePanel === 'addToProject'}
        onClose={closePanel}
        onSuccess={() => clearSelection()}
        selectedItems={selectedItems}
        currentLibraryId={currentLibraryId}
      />
    </div>
  );
}
