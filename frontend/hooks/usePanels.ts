import { useState, useCallback } from 'react';
import { PanelName } from '@/lib/types';

export function usePanels() {
  const [activePanel, setActivePanel] = useState<PanelName>(null);
  const [panelError, setPanelError] = useState('');

  const openPanel = useCallback((panelName: PanelName) => {
    setActivePanel(panelName);
    setPanelError('');
  }, []);

  const closePanel = useCallback(() => {
    setActivePanel(null);
    setPanelError('');
  }, []);

  const showPanelError = useCallback((error: string) => {
    setPanelError(error);
  }, []);

  const clearPanelError = useCallback(() => {
    setPanelError('');
  }, []);

  return {
    activePanel,
    panelError,
    openPanel,
    closePanel,
    showPanelError,
    clearPanelError,
  };
}
