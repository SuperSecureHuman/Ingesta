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
    <div className="confirm-overlay show">
      <div className="confirm-text">{message}</div>
      <div className="confirm-buttons">
        <button
          className={isDanger ? 'confirm-btn-yes' : 'confirm-btn-no'}
          onClick={onConfirm}
        >
          {confirmText}
        </button>
        <button className="confirm-btn-no" onClick={onCancel}>
          {cancelText}
        </button>
      </div>
    </div>
  );
}
