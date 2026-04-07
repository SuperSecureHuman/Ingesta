'use client';

interface ConfirmOverlayProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

export default function ConfirmOverlay({
  message,
  onConfirm,
  onCancel,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  isDanger = true,
}: ConfirmOverlayProps) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-lg">
      <div className="bg-card border border-border rounded-xl p-5 mx-4 max-w-xs w-full shadow-2xl">
        <p className="text-sm text-foreground text-center mb-4 leading-relaxed">{message}</p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={onCancel}
            className="flex-1 h-9 px-4 text-sm rounded-lg border border-border bg-transparent text-foreground hover:bg-accent transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 h-9 px-4 text-sm rounded-lg transition-colors ${
              isDanger
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
