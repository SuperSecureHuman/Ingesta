'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { AdminUser, Session, Library, Role } from '@/lib/types';
import { Loader2, X, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';

interface LibraryPermission {
  id: string;
  library_id: string;
  role: 'editor' | 'viewer';
  created_at: string;
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

function parseUserAgent(ua: string | null): string {
  if (!ua) return 'Unknown device';
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Edg')) return 'Edge';
  return 'Browser';
}

interface Props {
  user: AdminUser | null;
  currentUsername: string;
  onClose: () => void;
  onRefresh: () => void;
}

export default function UserDetailDrawer({ user, currentUsername, onClose, onRefresh }: Props) {
  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessLoading] = useState(false);
  const [perms, setPerms] = useState<LibraryPermission[]>([]);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [permsLoading, setPermsLoading] = useState(false);
  const [showResetPwd, setShowResetPwd] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);
  const [newLibId, setNewLibId] = useState('_none');
  const [newPermRole, setNewPermRole] = useState<'editor' | 'viewer'>('viewer');

  const loadSessions = useCallback(async (userId: string) => {
    setSessLoading(true);
    try {
      const res = await apiFetch(`/api/admin/users/${userId}/sessions`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions);
      }
    } finally {
      setSessLoading(false);
    }
  }, []);

  const loadPerms = useCallback(async (userId: string) => {
    setPermsLoading(true);
    try {
      const [permsRes, libsRes] = await Promise.all([
        apiFetch(`/api/admin/users/${userId}/permissions`),
        apiFetch('/api/libraries'),
      ]);
      if (permsRes.ok && libsRes.ok) {
        const [pd, ld] = await Promise.all([permsRes.json(), libsRes.json()]);
        setPerms(pd.permissions);
        setLibraries(ld.libraries);
      }
    } finally {
      setPermsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.display_name ?? '');
    loadSessions(user.id);
    loadPerms(user.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleSaveName = async () => {
    if (!user) return;
    setSavingName(true);
    try {
      const res = await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ display_name: displayName }),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success('Display name updated');
      onRefresh();
    } catch (e) {
      toast.error(`${e}`);
    } finally {
      setSavingName(false);
    }
  };

  const handleRoleChange = async (newRole: string | null) => {
    if (!user || !newRole) return;
    try {
      const res = await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error('Failed to update role');
      toast.success('Role updated');
      onRefresh();
    } catch (e) {
      toast.error(`${e}`);
    }
  };

  const handleSuspendToggle = async () => {
    if (!user) return;
    try {
      const res = await apiFetch(`/api/admin/users/${user.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !user.active }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(user.active ? 'User suspended' : 'User reactivated');
      onRefresh();
    } catch (e) {
      toast.error(`${e}`);
    }
  };

  const handleResetPassword = async () => {
    if (!user || !newPassword) return;
    setSavingPwd(true);
    try {
      const res = await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) throw new Error('Failed to reset password');
      toast.success('Password reset');
      setShowResetPwd(false);
      setNewPassword('');
    } catch (e) {
      toast.error(`${e}`);
    } finally {
      setSavingPwd(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    if (!user) return;
    try {
      const res = await apiFetch(`/api/auth/sessions/${sessionId}`, { method: 'DELETE' });
      if (!res.ok) {
        // fallback: use admin endpoint if not own session
        await apiFetch(`/api/admin/users/${user.id}/sessions`, { method: 'DELETE' });
      }
      toast.success('Session revoked');
      loadSessions(user.id);
    } catch (e) {
      toast.error(`${e}`);
    }
  };

  const handleSignOutAll = async () => {
    if (!user) return;
    try {
      const res = await apiFetch(`/api/admin/users/${user.id}/sessions`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      toast.success(`Revoked ${data.revoked} session(s)`);
      setSessions([]);
    } catch (e) {
      toast.error(`${e}`);
    }
  };

  const handleAddPerm = async () => {
    if (!user || !newLibId || newLibId === '_none') return;
    try {
      const res = await apiFetch(`/api/admin/users/${user.id}/permissions/${newLibId}`, {
        method: 'PUT',
        body: JSON.stringify({ role: newPermRole }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Permission set');
      setNewLibId('_none');
      loadPerms(user.id);
    } catch (e) {
      toast.error(`${e}`);
    }
  };

  const handleRemovePerm = async (libraryId: string) => {
    if (!user) return;
    try {
      await apiFetch(`/api/admin/users/${user.id}/permissions/${libraryId}`, { method: 'DELETE' });
      toast.success('Permission removed');
      loadPerms(user.id);
    } catch (e) {
      toast.error(`${e}`);
    }
  };

  const permLibIds = new Set(perms.map((p) => p.library_id));
  const availableLibs = libraries.filter((l) => !permLibIds.has(l.id));
  const getLibName = (libId: string) => libraries.find((l) => l.id === libId)?.name ?? libId;

  return (
    <>
      <Sheet open={!!user} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="right"
          className="w-[420px] p-0 bg-zinc-900/75 backdrop-blur-xl border-l border-primary/[0.08] [background-image:linear-gradient(to_bottom,hsl(var(--primary)/0.04),transparent_40%)]"
        >
          <SheetHeader className="px-5 py-4 border-b border-border/50">
            <SheetTitle className="text-base font-semibold">
              {user?.display_name || user?.username}
            </SheetTitle>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-65px)]">
            <div className="px-5 py-4 space-y-6">
              {/* Identity */}
              <section className="space-y-3">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Identity</h3>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Display name</Label>
                    <div className="flex gap-2">
                      <Input
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Optional display name"
                        className="h-8 text-sm"
                      />
                      <Button
                        size="sm"
                        className="h-8 shrink-0"
                        onClick={handleSaveName}
                        disabled={savingName}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Username</Label>
                    <p className="text-sm text-muted-foreground font-mono">{user?.username}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Role</Label>
                    <Select value={user?.role} onValueChange={handleRoleChange}>
                      <SelectTrigger className="h-8 w-32 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">viewer</SelectItem>
                        <SelectItem value="editor">editor</SelectItem>
                        <SelectItem value="admin">admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {user && user.username !== currentUsername && (
                    <Button
                      size="sm"
                      variant={user.active ? 'destructive' : 'outline'}
                      className="h-8 text-xs"
                      onClick={handleSuspendToggle}
                    >
                      {user.active ? 'Suspend account' : 'Reactivate account'}
                    </Button>
                  )}
                </div>
              </section>

              <Separator className="bg-border/50" />

              {/* Security */}
              <section className="space-y-3">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Security</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Password last changed</span>
                    <span className="text-xs">{formatRelative(user?.pwd_changed_at ?? null)}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => setShowResetPwd(true)}
                  >
                    Reset password
                  </Button>
                </div>
              </section>

              <Separator className="bg-border/50" />

              {/* Sessions */}
              <section className="space-y-3">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Active Sessions {sessions.length > 0 && <span className="text-muted-foreground">({sessions.length})</span>}
                </h3>
                {sessionsLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : sessions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No active sessions</p>
                ) : (
                  <div className="space-y-1.5">
                    {sessions.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between rounded-md border border-border/50 bg-zinc-900/50 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs font-medium">
                            <Monitor className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="truncate">{parseUserAgent(s.user_agent)}</span>
                            {s.ip_address && (
                              <span className="text-muted-foreground font-mono">{s.ip_address}</span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Last seen {formatRelative(s.last_seen)}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 ml-2"
                          onClick={() => handleRevokeSession(s.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs w-full mt-2"
                      onClick={handleSignOutAll}
                    >
                      Sign out everywhere
                    </Button>
                  </div>
                )}
              </section>

              <Separator className="bg-border/50" />

              {/* Library permissions */}
              <section className="space-y-3">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Library Permissions</h3>
                {permsLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <div className="space-y-3">
                    {perms.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No overrides — uses global role</p>
                    ) : (
                      <div className="space-y-1.5">
                        {perms.map((p) => (
                          <div
                            key={p.library_id}
                            className="flex items-center justify-between rounded-md border border-border/50 bg-zinc-900/50 px-3 py-1.5"
                          >
                            <span className="text-xs truncate">{getLibName(p.library_id)}</span>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{p.role}</Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => handleRemovePerm(p.library_id)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {availableLibs.length > 0 && (
                      <div className="flex gap-2">
                        <Select value={newLibId} onValueChange={(v) => setNewLibId(v ?? '_none')}>
                          <SelectTrigger className="h-8 flex-1 text-xs">
                            <SelectValue placeholder="Select library…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">Select library…</SelectItem>
                            {availableLibs.map((l) => (
                              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={newPermRole} onValueChange={(v) => setNewPermRole((v ?? 'viewer') as 'editor' | 'viewer')}>
                          <SelectTrigger className="h-8 w-24 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="viewer">viewer</SelectItem>
                            <SelectItem value="editor">editor</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button size="sm" className="h-8" onClick={handleAddPerm} disabled={newLibId === '_none'}>
                          Add
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <Separator className="bg-border/50" />

              {/* Activity */}
              <section className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Activity</h3>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Last login</span>
                    <span>{formatRelative(user?.last_login ?? null)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Account created</span>
                    <span>{user ? new Date(user.created_at).toLocaleDateString() : '—'}</span>
                  </div>
                </div>
              </section>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Reset password dialog */}
      <Dialog open={showResetPwd} onOpenChange={(open) => !open && setShowResetPwd(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label>New password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowResetPwd(false)}>Cancel</Button>
              <Button onClick={handleResetPassword} disabled={!newPassword || savingPwd}>
                {savingPwd ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reset'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
