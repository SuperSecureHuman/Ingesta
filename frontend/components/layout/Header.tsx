'use client';

import Link from 'next/link';
import { User } from '@/lib/types';

interface HeaderProps {
  currentUser: User | null;
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
        <span className="user-info">Logged in as: {currentUser?.username}</span>
        {currentUser?.role === 'admin' && (
          <Link href="/settings" className="btn btn-secondary btn-sm">
            Settings
          </Link>
        )}
        <button className="btn btn-secondary btn-sm" onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}
