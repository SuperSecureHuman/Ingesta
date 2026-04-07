'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAppContext } from '@/context/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { usePanels } from '@/hooks/usePanels';
import ProjectView from '@/components/views/ProjectView';
import { PlayerContextProvider } from '@/context/PlayerContext';
import { LutContextProvider } from '@/context/LutContext';
import { PanelContextProvider } from '@/context/PanelContext';
import PlayerContainer from '@/components/player/PlayerContainer';
import CreateSharePanel from '@/components/panels/CreateSharePanel';
import ShareLinksPanel from '@/components/panels/ShareLinksPanel';

function ProjectPageInner({ projectId }: { projectId: string }) {
  const { activePanel, openPanel, closePanel } = usePanels();
  const [dataReady, setDataReady] = useState(false);

  const handleOpenShareLinks = useCallback(() => {
    openPanel('shareLinks');
  }, [openPanel]);

  return (
    <>
      {!dataReady && (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}
      <div className={dataReady ? '' : 'hidden'}>
        <PanelContextProvider openPanel={openPanel} closePanel={closePanel} activePanel={activePanel}>
          <div className="p-6">
            <ProjectView projectId={projectId} onReady={() => setDataReady(true)} />
          </div>
          <CreateSharePanel
            isOpen={activePanel === 'createShare'}
            onClose={closePanel}
            currentProjectId={projectId}
            onOpenShareLinks={handleOpenShareLinks}
          />
          <ShareLinksPanel
            isOpen={activePanel === 'shareLinks'}
            onClose={closePanel}
            currentProjectId={projectId}
          />
          <PlayerContainer />
        </PanelContextProvider>
      </div>
    </>
  );
}

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const router = useRouter();
  const { currentUser, setCurrentUser } = useAppContext();
  const { checkAuth } = useAuth();
  const [isLoading, setIsLoading] = useState(currentUser === null);

  useEffect(() => {
    if (currentUser) return;
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
        <ProjectPageInner projectId={projectId} />
      </PlayerContextProvider>
    </LutContextProvider>
  );
}
