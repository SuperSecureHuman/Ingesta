'use client';

import React, { createContext, useContext } from 'react';
import { PanelName } from '@/lib/types';

interface PanelContextType {
  openPanel: (name: PanelName) => void;
  closePanel: () => void;
  activePanel: PanelName;
}

const PanelContext = createContext<PanelContextType | undefined>(undefined);

export function PanelContextProvider({
  children,
  openPanel,
  closePanel,
  activePanel,
}: PanelContextType & { children: React.ReactNode }) {
  return (
    <PanelContext.Provider value={{ openPanel, closePanel, activePanel }}>
      {children}
    </PanelContext.Provider>
  );
}

export function usePanelContext() {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error('usePanelContext must be used within AppShell');
  return ctx;
}
