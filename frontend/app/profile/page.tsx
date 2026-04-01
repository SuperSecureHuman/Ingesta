'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { useAppContext } from '@/context/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { Session, Role } from '@/lib/types';
import { Loader2, Monitor, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

// Password strength (same logic as CreateUserModal)
function getStrength(pwd: string): { score: number; label: string } {
  if (!pwd) return { score: 0, label: '' };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return { score, label: ['', 'Weak', 'Fair', 'Moderate', 'Strong', 'Strong'][Math.min(score, 5)] };
}
const STRENGTH_COLORS = ['', 'bg-red-500', 'bg-amber-500', 'bg-amber-400', 'bg-green-500', 'bg-green-400'];

const ROLE_COLORS: Record<Role, string> = {
  admin: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  editor: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  viewer: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

function parseUserAgent(ua: string | null): string {
  if (!ua) return 'Unknown device';
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Edg')) return 'Edge';
  return 'Browser';
}

export default function ProfilePage() {
  const router = useRouter();
  const { currentUser, setCurrentUser } = useAppContext();
  const { checkAuth } = useAuth();
  const [isLoading, setIsLoading] = useState(true);

  // Identity
  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Password change
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  // Sessions
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessLoading] = useState(false);

  const strength = getStrength(newPwd);

  useEffect(() => {
    const init = async () => {
      const user = await checkAuth();
      if (user) {
        setCurrentUser(user);
        setDisplayName(user.display_name ?? '');
      } else {
        router.replace('/');
        return;
      }
      setIsLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSessions = useCallback(async () => {
    setSessLoading(true);
    try {
      const res = await apiFetch('/api/auth/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } finally {
      setSessLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading) loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const handleSaveName = async () => {
    setSavingName(true);
    try {
      const res = await apiFetch('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ display_name: displayName }),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success('Display name updated');
      const user = await checkAuth();
      if (user) setCurrentUser(user);
    } catch (e) {
      toast.error(`${e}`);
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPwd !== confirmPwd) { toast.error('Passwords do not match'); return; }
    setSavingPwd(true);
    try {
      const res = await apiFetch('/api/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ current_password: currentPwd, new_password: newPwd }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to change password');
      }
      toast.success('Password updated');
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (e) {
      toast.error(`${e}`);
    } finally {
      setSavingPwd(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      const res = await apiFetch(`/api/auth/sessions/${sessionId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      toast.success('Session revoked');
      loadSessions();
    } catch (e) {
      toast.error(`${e}`);
    }
  };

  const handleSignOutAll = async () => {
    try {
      const res = await apiFetch('/api/auth/logout-all', { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      toast.success('Signed out everywhere');
      router.replace('/');
    } catch (e) {
      toast.error(`${e}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto py-8 px-4 space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account settings and sessions.</p>
      </div>

      {/* Identity */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium">Identity</h2>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Display name</Label>
            <div className="flex gap-2">
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Optional display name"
                className="h-9"
              />
              <Button size="sm" className="h-9 shrink-0" onClick={handleSaveName} disabled={savingName}>
                {savingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs">Username</Label>
              <p className="text-sm font-mono mt-0.5">{currentUser?.username}</p>
            </div>
            <div>
              <Label className="text-xs">Role</Label>
              <div className="mt-0.5">
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${currentUser?.role ? ROLE_COLORS[currentUser.role] : ''}`}>
                  {currentUser?.role}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Separator />

      {/* Change password */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium">Change Password</h2>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Current password</Label>
            <Input
              type="password"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              required
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">New password</Label>
            <Input
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              required
              className="h-9"
            />
            {newPwd && (
              <div className="space-y-1 pt-0.5">
                <div className="flex gap-0.5 h-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-full transition-colors duration-200 ${
                        strength.score >= i ? STRENGTH_COLORS[strength.score] : 'bg-zinc-700'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">{strength.label}</p>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Confirm new password</Label>
            <Input
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              required
              className="h-9"
            />
            {confirmPwd && newPwd !== confirmPwd && (
              <p className="text-[10px] text-destructive">Passwords do not match</p>
            )}
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={savingPwd || !currentPwd || !newPwd || newPwd !== confirmPwd}
            >
              {savingPwd ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Update Password
            </Button>
          </div>
        </form>
      </section>

      <Separator />

      {/* Sessions */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium">Active Sessions</h2>
        {sessionsLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active sessions</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Monitor className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{parseUserAgent(s.user_agent)}</span>
                    {s.ip_address && (
                      <span className="text-xs text-muted-foreground font-mono">{s.ip_address}</span>
                    )}
                    {s.is_current && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-500/10 text-green-400 border-green-500/30">
                        Current
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Last seen {formatRelative(s.last_seen)}
                  </p>
                </div>
                {!s.is_current && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 ml-2"
                    onClick={() => handleRevokeSession(s.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="destructive" size="sm" className="w-full mt-2" onClick={handleSignOutAll}>
              Sign out everywhere
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
