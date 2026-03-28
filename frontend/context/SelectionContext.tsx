'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { SelectionItem } from '@/lib/types';

interface SelectionContextType {
  selectedItems: Map<string, SelectionItem>;
  updateSelection: (item: SelectionItem, isSelected: boolean) => void;
  clearSelection: () => void;
  getSelectedPaths: () => SelectionItem[];
}

const SelectionContext = createContext<SelectionContextType | undefined>(undefined);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selectedItems, setSelectedItems] = useState<Map<string, SelectionItem>>(
    new Map()
  );

  const updateSelection = useCallback((item: SelectionItem, isSelected: boolean) => {
    setSelectedItems(prev => {
      const newMap = new Map(prev);
      if (isSelected) {
        newMap.set(item.path, item);
      } else {
        newMap.delete(item.path);
      }
      return newMap;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedItems(new Map());
  }, []);

  const getSelectedPaths = useCallback(() => {
    return Array.from(selectedItems.values());
  }, [selectedItems]);

  return (
    <SelectionContext.Provider
      value={{
        selectedItems,
        updateSelection,
        clearSelection,
        getSelectedPaths,
      }}
    >
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection() {
  const context = useContext(SelectionContext);
  if (!context) {
    throw new Error('useSelection must be used within SelectionProvider');
  }
  return context;
}
