'use client';

import React, { createContext, useContext, useState, useMemo } from 'react';
import { Project } from '@/lib/types';

interface AppContextType {
  currentUser: string | null;
  setCurrentUser: (user: string | null) => void;
  projects: Project[];
  setProjects: (projects: Project[]) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppContextProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  const value: AppContextType = useMemo(() => ({
    currentUser,
    setCurrentUser,
    projects,
    setProjects,
  }), [currentUser, projects]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppContextProvider');
  }
  return context;
}
