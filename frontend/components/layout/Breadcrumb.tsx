'use client';

import { useAppContext } from '@/context/AppContext';

export default function Breadcrumb() {
  const { currentView, setCurrentView } = useAppContext();

  const handleHomeClick = () => {
    setCurrentView('home');
  };

  return (
    <div className="breadcrumb">
      {currentView === 'home' ? (
        <span>Home</span>
      ) : (
        <>
          <a onClick={handleHomeClick} style={{ cursor: 'pointer' }}>
            Home
          </a>
          <span> / </span>
          <span>{currentView === 'library' ? 'Libraries' : 'Projects'}</span>
        </>
      )}
    </div>
  );
}
