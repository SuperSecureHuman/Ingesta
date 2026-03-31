'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAppContext } from '@/context/AppContext';
import { useAuth } from '@/hooks/useAuth';
import AppShell from '@/components/layout/AppShell';
import LibraryView from '@/components/views/LibraryView';
import { PlayerContextProvider } from '@/context/PlayerContext';
import { LutContextProvider } from '@/context/LutContext';

export default function LibraryPage() {
  const params = useParams();
  const librarySlug = params.librarySlug as string;
  const folderPath = params.folderPath as string[] | undefined;
  const router = useRouter();
  const { currentUser, setCurrentUser } = useAppContext();
  const { checkAuth } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [resolvedLibraryId, setResolvedLibraryId] = useState<string | undefined>(undefined);
  const [resolvedLibraryName, setResolvedLibraryName] = useState<string | undefined>(undefined);

  const handleLibraryResolved = (id: string, name: string) => {
    setResolvedLibraryId(id);
    setResolvedLibraryName(name);
  };

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
        <AppShell libraryId={resolvedLibraryId} libraryName={resolvedLibraryName}>
          <LibraryView
            librarySlug={librarySlug}
            folderPath={folderPath ?? []}
            onLibraryResolved={handleLibraryResolved}
          />
        </AppShell>
      </PlayerContextProvider>
    </LutContextProvider>
  );
}
