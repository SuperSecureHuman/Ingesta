'use client';

import { useAppContext } from '@/context/AppContext';

export default function Breadcrumb() {
  const { currentView, setCurrentView, currentLibrary } = useAppContext();

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
          <span> › </span>
          {currentView === 'library' ? (
            <>
              <span>Libraries</span>
              {currentLibrary && (
                <>
                  <span> › </span>
                  <span>{currentLibrary.name}</span>
                </>
              )}
            </>
          ) : (
            <span>Projects</span>
          )}
        </>
      )}
    </div>
  );
}
