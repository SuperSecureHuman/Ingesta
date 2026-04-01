'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { useAppContext } from '@/context/AppContext';
import { Role, Library } from '@/lib/types';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface AdminUser {
  id: string;
  username: string;
  role: Role;
  created_at: string;
}

interface LibraryPermission {
  id: string;
  library_id: string;
  role: 'editor' | 'viewer';
  created_at: string;
}

export default function SettingsView() {
  const { currentUser } = useAppContext();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedPermsUser, setExpandedPermsUser] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; username: string } | null>(null);
  const [resetTarget, setResetTarget] = useState<{ id: string; username: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const loadUsers = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/users');
      if (!res.ok) throw new Error('Failed to load users');
      const data = await res.json();
      setUsers(data.users);
    } catch (e) {
      toast.error(`${e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleRoleChange = async (userId: string, newRole: string | null) => {
    if (!newRole) return;
    try {
      const res = await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error('Failed to update role');
      toast.success('Role updated');
      await loadUsers();
    } catch (e) {
      toast.error(`${e}`);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await apiFetch(`/api/admin/users/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to delete');
      }
      toast.success('User deleted');
      setDeleteTarget(null);
      await loadUsers();
    } catch (e) {
      toast.error(`${e}`);
    }
  };

  const handleConfirmReset = async () => {
    if (!resetTarget || !newPassword) return;
    try {
      const res = await apiFetch(`/api/admin/users/${resetTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) throw new Error('Failed to reset password');
      toast.success('Password reset');
      setResetTarget(null);
      setNewPassword('');
    } catch (e) {
      toast.error(`${e}`);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">User Management</h2>
        <Button size="sm" onClick={() => setShowCreateModal(true)}>+ New User</Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <>
                <TableRow key={user.id}>
                  <TableCell>{user.username}</TableCell>
                  <TableCell>
                    <Select value={user.role} onValueChange={(v) => handleRoleChange(user.id, v)}>
                      <SelectTrigger className="h-8 w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">viewer</SelectItem>
                        <SelectItem value="editor">editor</SelectItem>
                        <SelectItem value="admin">admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {user.role !== 'admin' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setExpandedPermsUser(expandedPermsUser === user.id ? null : user.id)}
                      >
                        Library Perms {expandedPermsUser === user.id ? '▲' : '▶'}
                      </Button>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setResetTarget({ id: user.id, username: user.username }); setNewPassword(''); }}
                      >
                        Reset PW
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={user.username === currentUser?.username}
                        onClick={() => setDeleteTarget({ id: user.id, username: user.username })}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {expandedPermsUser === user.id && (
                  <TableRow key={`${user.id}-perms`}>
                    <TableCell colSpan={5} className="bg-zinc-900/50 pl-8 pb-3">
                      <LibraryPermissionsPanel userId={user.id} />
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Delete user confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &quot;{deleteTarget?.username}&quot;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset password dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password for &quot;{resetTarget?.username}&quot;</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>New password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setResetTarget(null)}>Cancel</Button>
              <Button onClick={handleConfirmReset} disabled={!newPassword}>Reset</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create user modal */}
      <Dialog open={showCreateModal} onOpenChange={(open) => !open && setShowCreateModal(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New User</DialogTitle>
          </DialogHeader>
          <CreateUserForm
            onClose={() => setShowCreateModal(false)}
            onSuccess={() => { setShowCreateModal(false); loadUsers(); }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}


function LibraryPermissionsPanel({ userId }: { userId: string }) {
  const [perms, setPerms] = useState<LibraryPermission[]>([]);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLibId, setNewLibId] = useState('_none');
  const [newRole, setNewRole] = useState<'editor' | 'viewer'>('viewer');

  const loadData = useCallback(async () => {
    try {
      const [permsRes, libsRes] = await Promise.all([
        apiFetch(`/api/admin/users/${userId}/permissions`),
        apiFetch('/api/libraries'),
      ]);
      if (permsRes.ok && libsRes.ok) {
        const [permsData, libsData] = await Promise.all([permsRes.json(), libsRes.json()]);
        setPerms(permsData.permissions);
        setLibraries(libsData.libraries);
      }
    } catch (e) {
      toast.error(`${e}`);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAdd = async () => {
    if (!newLibId || newLibId === '_none') return;
    try {
      const res = await apiFetch(`/api/admin/users/${userId}/permissions/${newLibId}`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error('Failed to set permission');
      toast.success('Permission set');
      setNewLibId('_none');
      await loadData();
    } catch (e) {
      toast.error(`${e}`);
    }
  };

  const handleDelete = async (libraryId: string) => {
    try {
      await apiFetch(`/api/admin/users/${userId}/permissions/${libraryId}`, { method: 'DELETE' });
      toast.success('Permission removed');
      await loadData();
    } catch (e) {
      toast.error(`${e}`);
    }
  };

  const handleRoleUpdate = async (libraryId: string, role: string | null) => {
    if (!role) return;
    await apiFetch(`/api/admin/users/${userId}/permissions/${libraryId}`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
    toast.success('Permission updated');
    await loadData();
  };

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground my-2" />;

  const permLibIds = new Set(perms.map((p) => p.library_id));
  const availableLibs = libraries.filter((l) => !permLibIds.has(l.id));
  const getLibName = (libId: string) => libraries.find((l) => l.id === libId)?.name ?? libId;

  return (
    <div className="pt-2 space-y-3">
      {perms.length === 0 ? (
        <p className="text-sm text-muted-foreground">No library overrides.</p>
      ) : (
        <table className="text-sm border-collapse">
          <tbody>
            {perms.map((p) => (
              <tr key={p.library_id}>
                <td className="pr-4 py-1">{getLibName(p.library_id)}</td>
                <td className="pr-2 py-1">
                  <Select value={p.role} onValueChange={(v) => handleRoleUpdate(p.library_id, v)}>
                    <SelectTrigger className="h-7 w-24 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">viewer</SelectItem>
                      <SelectItem value="editor">editor</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="py-1">
                  <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => handleDelete(p.library_id)}>×</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {availableLibs.length > 0 && (
        <div className="flex gap-2 items-center">
          <Select value={newLibId} onValueChange={(v) => setNewLibId(v ?? '_none')}>
            <SelectTrigger className="h-8 w-40 text-sm">
              <SelectValue placeholder="Select library…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Select library…</SelectItem>
              {availableLibs.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={newRole} onValueChange={(v) => setNewRole((v ?? 'viewer') as 'editor' | 'viewer')}>
            <SelectTrigger className="h-8 w-24 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="viewer">viewer</SelectItem>
              <SelectItem value="editor">editor</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleAdd} disabled={!newLibId || newLibId === '_none'}>
            + Add
          </Button>
        </div>
      )}
    </div>
  );
}


function CreateUserForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setSaving(true);
    try {
      const res = await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ username, password, role }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create user');
      }
      toast.success('User created');
      onSuccess();
    } catch (e) {
      toast.error(`${e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="space-y-1.5">
        <Label>Username</Label>
        <Input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <Label>Password</Label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label>Role</Label>
        <Select value={role} onValueChange={(v) => setRole((v ?? 'viewer') as Role)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="viewer">viewer</SelectItem>
            <SelectItem value="editor">editor</SelectItem>
            <SelectItem value="admin">admin</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Creating…' : 'Create'}
        </Button>
      </div>
    </form>
  );
}
