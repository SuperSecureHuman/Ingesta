import { useState } from 'react';
import { toast } from 'sonner';

export function useClipboardCopy() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success('Copied!');
    } catch {
      toast.error('Failed to copy');
    }
  };

  return { copy, copiedId };
}
