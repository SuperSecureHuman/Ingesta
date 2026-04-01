'use client';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface PanelShellProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  error?: string;
}

export default function PanelShell({
  isOpen,
  title,
  onClose,
  children,
  footer,
  error,
}: PanelShellProps) {
  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-96 flex flex-col gap-0 p-0"
      >
        <SheetHeader className="px-4 py-4 border-b border-white/[0.06] shrink-0">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {error && (
            <div className="mb-4 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          {children}
        </div>

        {footer && (
          <div className="px-4 py-4 border-t border-white/[0.06] shrink-0">
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
