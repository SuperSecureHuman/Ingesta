'use client';

import { useCallback, useState } from 'react';
import { useParams } from 'next/navigation';
import { usePanels } from '@/hooks/usePanels';
import ProjectView from '@/components/views/ProjectView';
import { PlayerContextProvider } from '@/context/PlayerContext';
import { LutContextProvider } from '@/context/LutContext';
import { PanelContextProvider } from '@/context/PanelContext';
import PlayerContainer from '@/components/player/PlayerContainer';
import CreateSharePanel from '@/components/panels/CreateSharePanel';
import ShareLinksPanel from '@/components/panels/ShareLinksPanel';
import { PageSpinner } from '@/components/ui/PageSpinner';
import { useRequireAuth } from '@/hooks/useRequireAuth';

function ProjectPageInner({ projectId }: { projectId: string }) {
  const { activePanel, openPanel, closePanel } = usePanels();
  const [dataReady, setDataReady] = useState(false);

  const handleOpenShareLinks = useCallback(() => {
    openPanel('shareLinks');
  }, [openPanel]);

  return (
    <>
      {!dataReady && <PageSpinner />}
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
  const { user, isLoading } = useRequireAuth();

  if (isLoading) {
    return <PageSpinner />;
  }

  if (!user) return null;

  return (
    <LutContextProvider>
      <PlayerContextProvider>
        <ProjectPageInner projectId={projectId} />
      </PlayerContextProvider>
    </LutContextProvider>
  );
}
