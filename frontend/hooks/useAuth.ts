'use client';

import { useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/context/ToastContext';

export function useAuth() {
  const { showToast } = useToast();

  const checkAuth = useCallback(async (): Promise<string | null> => {
    try {
      const res = await apiFetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        return data.username;
      }
      return null;
    } catch (e) {
      return null;
    }
  }, []);

  const login = useCallback(
    async (username: string, password: string): Promise<string | null> => {
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
        return data.username;
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

  return { checkAuth, login, logout };
}
