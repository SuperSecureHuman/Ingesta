'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAppContext } from '@/context/AppContext';
import { useAuth } from '@/hooks/useAuth';
import AppShell from '@/components/layout/AppShell';
import ProjectView from '@/components/views/ProjectView';
import { PlayerContextProvider } from '@/context/PlayerContext';
import { LutContextProvider } from '@/context/LutContext';

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.projectId as string;
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
  }, []);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!currentUser) return null;

  return (
    <LutContextProvider>
      <PlayerContextProvider>
        <AppShell projectId={projectId}>
          <ProjectView projectId={projectId} />
        </AppShell>
      </PlayerContextProvider>
    </LutContextProvider>
  );
}
