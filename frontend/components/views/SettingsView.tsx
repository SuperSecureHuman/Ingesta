'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { useAppContext } from '@/context/AppContext';
import { Role, Library } from '@/lib/types';

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
  const { showToast } = useToast();
  const { currentUser } = useAppContext();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedPermsUser, setExpandedPermsUser] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/users');
      if (!res.ok) throw new Error('Failed to load users');
      const data = await res.json();
      setUsers(data.users);
    } catch (e) {
      showToast(`${e}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleRoleChange = async (userId: string, newRole: Role) => {
    try {
      const res = await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error('Failed to update role');
      showToast('Role updated', 'success');
      await loadUsers();
    } catch (e) {
      showToast(`${e}`, 'error');
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    try {
      const res = await apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to delete');
      }
      showToast('User deleted', 'success');
      await loadUsers();
    } catch (e) {
      showToast(`${e}`, 'error');
    }
  };

  const handleResetPassword = async (userId: string, username: string) => {
    const newPassword = prompt(`New password for "${username}":`);
    if (!newPassword) return;
    try {
      const res = await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) throw new Error('Failed to reset password');
      showToast('Password reset', 'success');
    } catch (e) {
      showToast(`${e}`, 'error');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <div className="section-header">
        <h2>User Management</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreateModal(true)}>
          + New User
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--color-muted)', fontSize: '13px' }}>Username</th>
              <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--color-muted)', fontSize: '13px' }}>Role</th>
              <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--color-muted)', fontSize: '13px' }}>Created</th>
              <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--color-muted)', fontSize: '13px' }}>Permissions</th>
              <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--color-muted)', fontSize: '13px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <>
                <tr key={user.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '10px 8px' }}>{user.username}</td>
                  <td style={{ padding: '10px 8px' }}>
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value as Role)}
                      style={{ background: 'var(--color-bg-card)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '2px 6px' }}
                    >
                      <option value="viewer">viewer</option>
                      <option value="editor">editor</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td style={{ padding: '10px 8px', color: 'var(--color-muted)', fontSize: '13px' }}>
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '10px 8px' }}>
                    {user.role !== 'admin' && (
                      <button
                        className="btn btn-sm"
                        onClick={() => setExpandedPermsUser(expandedPermsUser === user.id ? null : user.id)}
                      >
                        Library Perms {expandedPermsUser === user.id ? '▲' : '▶'}
                      </button>
                    )}
                  </td>
                  <td style={{ padding: '10px 8px', display: 'flex', gap: '6px' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleResetPassword(user.id, user.username)}
                    >
                      Reset PW
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={user.username === currentUser?.username}
                      onClick={() => handleDeleteUser(user.id, user.username)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
                {expandedPermsUser === user.id && (
                  <tr key={`${user.id}-perms`}>
                    <td colSpan={5} style={{ padding: '0 8px 12px 32px', background: 'var(--color-bg-card)' }}>
                      <LibraryPermissionsPanel userId={user.id} />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadUsers();
          }}
        />
      )}
    </div>
  );
}


function LibraryPermissionsPanel({ userId }: { userId: string }) {
  const { showToast } = useToast();
  const [perms, setPerms] = useState<LibraryPermission[]>([]);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLibId, setNewLibId] = useState('');
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
      showToast(`${e}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [userId, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAdd = async () => {
    if (!newLibId) return;
    try {
      const res = await apiFetch(`/api/admin/users/${userId}/permissions/${newLibId}`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error('Failed to set permission');
      showToast('Permission set', 'success');
      setNewLibId('');
      await loadData();
    } catch (e) {
      showToast(`${e}`, 'error');
    }
  };

  const handleDelete = async (libraryId: string) => {
    try {
      await apiFetch(`/api/admin/users/${userId}/permissions/${libraryId}`, { method: 'DELETE' });
      showToast('Permission removed', 'success');
      await loadData();
    } catch (e) {
      showToast(`${e}`, 'error');
    }
  };

  if (loading) return <div className="spinner" style={{ width: 16, height: 16 }} />;

  const permLibIds = new Set(perms.map((p) => p.library_id));
  const availableLibs = libraries.filter((l) => !permLibIds.has(l.id));

  const getLibName = (libId: string) => libraries.find((l) => l.id === libId)?.name ?? libId;

  return (
    <div style={{ paddingTop: '8px' }}>
      {perms.length === 0 ? (
        <p style={{ color: 'var(--color-muted)', fontSize: '13px', marginBottom: '8px' }}>No library overrides.</p>
      ) : (
        <table style={{ marginBottom: '10px', borderCollapse: 'collapse' }}>
          <tbody>
            {perms.map((p) => (
              <tr key={p.library_id}>
                <td style={{ padding: '4px 12px 4px 0', fontSize: '13px' }}>{getLibName(p.library_id)}</td>
                <td style={{ padding: '4px 12px 4px 0' }}>
                  <select
                    value={p.role}
                    onChange={async (e) => {
                      await apiFetch(`/api/admin/users/${userId}/permissions/${p.library_id}`, {
                        method: 'PUT',
                        body: JSON.stringify({ role: e.target.value }),
                      });
                      showToast('Permission updated', 'success');
                      await loadData();
                    }}
                    style={{ background: 'var(--color-bg-card)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '2px 4px', fontSize: '12px' }}
                  >
                    <option value="viewer">viewer</option>
                    <option value="editor">editor</option>
                  </select>
                </td>
                <td style={{ padding: '4px 0' }}>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.library_id)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {availableLibs.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            value={newLibId}
            onChange={(e) => setNewLibId(e.target.value)}
            style={{ background: 'var(--color-bg-card)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '4px 8px', fontSize: '13px' }}
          >
            <option value="">Select library…</option>
            {availableLibs.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as 'editor' | 'viewer')}
            style={{ background: 'var(--color-bg-card)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '4px 8px', fontSize: '13px' }}
          >
            <option value="viewer">viewer</option>
            <option value="editor">editor</option>
          </select>
          <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!newLibId}>
            + Add
          </button>
        </div>
      )}
    </div>
  );
}


function CreateUserModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { showToast } = useToast();
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
      showToast('User created', 'success');
      onSuccess();
    } catch (e) {
      showToast(`${e}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="confirm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="confirm-box" style={{ minWidth: '300px' }}>
        <h3 style={{ marginBottom: '16px' }}>New User</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              style={{ width: '100%' }}
            />
          </div>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: '100%' }}
            />
          </div>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label>Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              style={{ width: '100%', background: 'var(--color-bg-card)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '6px 8px' }}
            >
              <option value="viewer">viewer</option>
              <option value="editor">editor</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
