'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ViewName } from '@/lib/types';

interface AppContextType {
  currentUser: string | null;
  setCurrentUser: (user: string | null) => void;
  currentView: ViewName;
  setCurrentView: (view: ViewName) => void;
  currentLibraryId: string | null;
  setCurrentLibraryId: (id: string | null) => void;
  currentProjectId: string | null;
  setCurrentProjectId: (id: string | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppContextProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewName>('home');
  const [currentLibraryId, setCurrentLibraryId] = useState<string | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  const value: AppContextType = {
    currentUser,
    setCurrentUser,
    currentView,
    setCurrentView,
    currentLibraryId,
    setCurrentLibraryId,
    currentProjectId,
    setCurrentProjectId,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppContextProvider');
  }
  return context;
}
