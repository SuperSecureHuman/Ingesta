'use client';

interface HeaderProps {
  currentUser: string | null;
  onLogout: () => void;
}

export default function Header({ currentUser, onLogout }: HeaderProps) {
  return (
    <header>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '20px' }}>▶</span>
        Ingesta
      </h1>
      <div className="header-right">
        <span className="user-info">Logged in as: {currentUser}</span>
        <button className="btn btn-secondary btn-sm" onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}
