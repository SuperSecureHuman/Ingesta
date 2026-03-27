'use client';

interface HeaderProps {
  currentUser: string | null;
  onLogout: () => void;
}

export default function Header({ currentUser, onLogout }: HeaderProps) {
  return (
    <header>
      <h1>HLS Media Review</h1>
      <div className="header-right">
        <span className="user-info">Logged in as: {currentUser}</span>
        <button className="btn btn-secondary btn-sm" onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}
