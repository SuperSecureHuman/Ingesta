'use client';

import { useEffect, useState } from 'react';
import LoginForm from '@/components/auth/LoginForm';
import AppShell from '@/components/layout/AppShell';
import { PlayerContextProvider } from '@/context/PlayerContext';
import { LutContextProvider } from '@/context/LutContext';
import { useAppContext } from '@/context/AppContext';
import { useAuth } from '@/hooks/useAuth';

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
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginForm onLoginSuccess={setCurrentUser} />;
  }

  return (
    <PlayerContextProvider>
      <LutContextProvider>
        <AppShell />
      </LutContextProvider>
    </PlayerContextProvider>
  );
}
