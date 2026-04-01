import { useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { useAppContext } from '@/context/AppContext';
import { User } from '@/lib/types';

export function useAuth() {
  const { currentUser } = useAppContext();

  const checkAuth = useCallback(async (): Promise<User | null> => {
    try {
      const res = await apiFetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        return { username: data.username, role: data.role, display_name: data.display_name ?? undefined };
      }
      return null;
    } catch (e) {
      return null;
    }
  }, []);

  const login = useCallback(
    async (username: string, password: string): Promise<User | null> => {
      try {
        const res = await apiFetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        });

        if (!res.ok) {
          const err = await res.json();
          toast.error(err.detail || 'Login failed');
          return null;
        }

        const data = await res.json();
        toast.success('Logged in successfully');
        return { username: data.username, role: data.role };
      } catch (e) {
        toast.error(`Network error: ${e}`);
        return null;
      }
    },
    []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
      toast.success('Logged out');
    } catch (e) {
      toast.error(`Logout error: ${e}`);
    }
  }, []);

  const isAdmin = useCallback((): boolean => {
    return currentUser?.role === 'admin';
  }, [currentUser]);

  const canEdit = useCallback((_libraryId?: string): boolean => {
    if (!currentUser) return false;
    return currentUser.role === 'admin' || currentUser.role === 'editor';
  }, [currentUser]);

  const isViewer = useCallback((): boolean => {
    return currentUser?.role === 'viewer';
  }, [currentUser]);

  return { checkAuth, login, logout, isAdmin, canEdit, isViewer };
}
