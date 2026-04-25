'use client';

import { useCallback, useEffect, useState } from 'react';
import LoginForm from '@/components/auth/LoginForm';
import HomeView from '@/components/views/HomeView';
import { PlayerContextProvider } from '@/context/PlayerContext';
import { LutContextProvider } from '@/context/LutContext';
import { PanelContextProvider } from '@/context/PanelContext';
import { useAppContext } from '@/context/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { usePanels } from '@/hooks/usePanels';
import { useSelection } from '@/context/SelectionContext';
import PlayerContainer from '@/components/player/PlayerContainer';
import AddToProjectPanel from '@/components/panels/AddToProjectPanel';
import { PageSpinner } from '@/components/ui/PageSpinner';

function HomePageInner() {
  const { activePanel, openPanel, closePanel } = usePanels();
  const { selectedItems, clearSelection } = useSelection();
  const [dataReady, setDataReady] = useState(false);

  const handleAddSuccess = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  return (
    <>
      {!dataReady && <PageSpinner />}
      <div className={dataReady ? '' : 'hidden'}>
        <PanelContextProvider openPanel={openPanel} closePanel={closePanel} activePanel={activePanel}>
          <div className="p-6">
            <HomeView onReady={() => setDataReady(true)} />
          </div>
          <AddToProjectPanel
            isOpen={activePanel === 'addToProject'}
            onClose={closePanel}
            onSuccess={handleAddSuccess}
            selectedItems={selectedItems}
            currentLibraryId={null}
          />
          <PlayerContainer />
        </PanelContextProvider>
      </div>
    </>
  );
}

export default function Home() {
  const { currentUser, setCurrentUser } = useAppContext();
  const { checkAuth } = useAuth();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const user = await checkAuth();
      if (user) {
        setCurrentUser(user);
      }
      setIsLoading(false);
    };
    initAuth();
  }, [checkAuth, setCurrentUser]);

  if (isLoading) {
    return <PageSpinner />;
  }

  if (!currentUser) {
    return <LoginForm onLoginSuccess={setCurrentUser} />;
  }

  return (
    <LutContextProvider>
      <PlayerContextProvider>
        <HomePageInner />
      </PlayerContextProvider>
    </LutContextProvider>
  );
}
