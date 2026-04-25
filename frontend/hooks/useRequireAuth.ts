import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useAppContext } from '@/context/AppContext';

export function useRequireAuth(requiredRole?: 'admin' | 'editor' | 'viewer') {
  const router = useRouter();
  const { checkAuth } = useAuth();
  const { currentUser, setCurrentUser } = useAppContext();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const user = await checkAuth();
      if (!user) { router.replace('/'); return; }
      if (requiredRole === 'admin' && user.role !== 'admin') {
        router.replace('/'); return;
      }
      setCurrentUser(user);
      setIsLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { user: currentUser, isLoading };
}
