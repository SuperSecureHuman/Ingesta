'use client';

import { useState } from 'react';
import { SelectionItem } from '@/lib/types';

export function useSelection() {
  const [selectedItems, setSelectedItems] = useState<Map<string, SelectionItem>>(
    new Map()
  );

  const updateSelection = (item: SelectionItem, isSelected: boolean) => {
    const newMap = new Map(selectedItems);
    if (isSelected) {
      newMap.set(item.path, item);
    } else {
      newMap.delete(item.path);
    }
    setSelectedItems(newMap);
  };

  const clearSelection = () => {
    setSelectedItems(new Map());
  };

  const getSelectedPaths = () => {
    return Array.from(selectedItems.values());
  };

  return {
    selectedItems,
    updateSelection,
    clearSelection,
    getSelectedPaths,
  };
}
