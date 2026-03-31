import { useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { useAppContext } from '@/context/AppContext';
import { User } from '@/lib/types';

export function useAuth() {
  const { showToast } = useToast();
  const { currentUser } = useAppContext();

  const checkAuth = useCallback(async (): Promise<User | null> => {
    try {
      const res = await apiFetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        return { username: data.username, role: data.role };
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
          showToast(err.detail || 'Login failed', 'error');
          return null;
        }

        const data = await res.json();
        showToast('Logged in successfully', 'success');
        return { username: data.username, role: data.role };
      } catch (e) {
        showToast(`Network error: ${e}`, 'error');
        return null;
      }
    },
    [showToast]
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
      showToast('Logged out', 'success');
    } catch (e) {
      showToast(`Logout error: ${e}`, 'error');
    }
  }, [showToast]);

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
