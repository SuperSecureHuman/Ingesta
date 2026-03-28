'use client';

import React, { createContext, useContext, useState, useMemo } from 'react';
import { ViewName, Library, Project } from '@/lib/types';

interface AppContextType {
  currentUser: string | null;
  setCurrentUser: (user: string | null) => void;
  currentView: ViewName;
  setCurrentView: (view: ViewName) => void;
  currentLibraryId: string | null;
  setCurrentLibraryId: (id: string | null) => void;
  currentLibrary: Library | null;
  setCurrentLibrary: (lib: Library | null) => void;
  currentProjectId: string | null;
  setCurrentProjectId: (id: string | null) => void;
  projects: Project[];
  setProjects: (projects: Project[]) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppContextProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewName>('home');
  const [currentLibraryId, setCurrentLibraryId] = useState<string | null>(null);
  const [currentLibrary, setCurrentLibrary] = useState<Library | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  const value: AppContextType = useMemo(() => ({
    currentUser,
    setCurrentUser,
    currentView,
    setCurrentView,
    currentLibraryId,
    setCurrentLibraryId,
    currentLibrary,
    setCurrentLibrary,
    currentProjectId,
    setCurrentProjectId,
    projects,
    setProjects,
  }), [currentUser, currentView, currentLibraryId, currentLibrary, currentProjectId, projects]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppContextProvider');
  }
  return context;
}
