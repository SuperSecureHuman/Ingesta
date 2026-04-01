'use client';

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { LutEntry } from '@/lib/types';
import { fetchLuts } from '@/lib/api';

interface LutContextType {
  availableLuts: LutEntry[];
  activeLutId: string | null;
  isLoading: boolean;
  applyLut: (lutId: string) => void;
  clearLut: () => void;
  lutMode: 'client' | 'server';
  setLutMode: (mode: 'client' | 'server') => void;
  lutStrength: number;
  setLutStrength: (strength: number) => void;
  fileLutPref: string | null;
  setFileLutPref: (id: string | null) => void;
}

const LutContext = createContext<LutContextType | undefined>(undefined);

export function LutContextProvider({
  children,
  initialLuts,
}: {
  children: React.ReactNode;
  initialLuts?: LutEntry[];
}) {
  const [availableLuts, setAvailableLuts] = useState<LutEntry[]>(initialLuts ?? []);
  const [activeLutId, setActiveLutId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lutMode, setLutMode] = useState<'client' | 'server'>('client');
  const [lutStrength, setLutStrength] = useState<number>(1.0);
  const [fileLutPref, setFileLutPref] = useState<string | null>(null);

  // Fetch available LUTs on mount (skip if initialLuts were provided)
  useEffect(() => {
    if (initialLuts) return;
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

  const value = useMemo(
    () => ({
      availableLuts,
      activeLutId,
      isLoading,
      applyLut,
      clearLut,
      lutMode,
      setLutMode,
      lutStrength,
      setLutStrength,
      fileLutPref,
      setFileLutPref,
    }),
    [availableLuts, activeLutId, isLoading, lutMode, lutStrength, fileLutPref]
  );

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
