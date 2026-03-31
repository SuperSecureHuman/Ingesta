'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppContext } from '@/context/AppContext';
import { useAuth } from '@/hooks/useAuth';
import AppShell from '@/components/layout/AppShell';
import { PlayerContextProvider } from '@/context/PlayerContext';
import { LutContextProvider } from '@/context/LutContext';
import SettingsView from '@/components/views/SettingsView';

export default function SettingsPage() {
  const router = useRouter();
  const { currentUser, setCurrentUser } = useAppContext();
  const { checkAuth } = useAuth();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const user = await checkAuth();
      if (user) {
        setCurrentUser(user);
        if (user.role !== 'admin') {
          router.replace('/');
          return;
        }
      } else {
        router.replace('/');
        return;
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
        <AppShell>
          <SettingsView />
        </AppShell>
      </PlayerContextProvider>
    </LutContextProvider>
  );
}
