'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { LutEntry } from '@/lib/types';
import { fetchLuts } from '@/lib/api';

interface LutContextType {
  availableLuts: LutEntry[];
  activeLutId: string | null;
  isLoading: boolean;
  applyLut: (lutId: string) => void;
  clearLut: () => void;
}

const LutContext = createContext<LutContextType | undefined>(undefined);

export function LutContextProvider({ children }: { children: React.ReactNode }) {
  const [availableLuts, setAvailableLuts] = useState<LutEntry[]>([]);
  const [activeLutId, setActiveLutId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch available LUTs on mount
  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const luts = await fetchLuts();
        if (isMounted) {
          setAvailableLuts(luts);
        }
      } catch (e) {
        console.warn('Failed to fetch LUTs:', e);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const applyLut = (lutId: string) => {
    setActiveLutId(lutId);
  };

  const clearLut = () => {
    setActiveLutId(null);
  };

  const value: LutContextType = {
    availableLuts,
    activeLutId,
    isLoading,
    applyLut,
    clearLut,
  };

  return (
    <LutContext.Provider value={value}>{children}</LutContext.Provider>
  );
}

export function useLutContext() {
  const context = useContext(LutContext);
  if (!context) {
    throw new Error('useLutContext must be used within LutContextProvider');
  }
  return context;
}
