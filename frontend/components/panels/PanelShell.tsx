'use client';

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
    <div className={`panel ${isOpen ? 'open' : ''}`}>
      <div className="panel-header">
        <div className="panel-title">{title}</div>
        <button className="panel-close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="panel-content">
        {error && <div className="panel-error show">{error}</div>}
        {children}
      </div>
      {footer && <div className="panel-footer">{footer}</div>}
    </div>
  );
}
