'use client';

import { useState } from 'react';
import { PanelName } from '@/lib/types';

export function usePanels() {
  const [activePanel, setActivePanel] = useState<PanelName>(null);
  const [panelError, setPanelError] = useState('');

  const openPanel = (panelName: PanelName) => {
    setActivePanel(panelName);
    setPanelError('');
  };

  const closePanel = () => {
    setActivePanel(null);
    setPanelError('');
  };

  const showPanelError = (error: string) => {
    setPanelError(error);
  };

  const clearPanelError = () => {
    setPanelError('');
  };

  return {
    activePanel,
    panelError,
    openPanel,
    closePanel,
    showPanelError,
    clearPanelError,
  };
}
