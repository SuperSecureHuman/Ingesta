'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { Role } from '@/lib/types';
import { Loader2, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Simple client-side password strength meter (no library)
function getStrength(pwd: string): { score: number; label: string } {
  if (!pwd) return { score: 0, label: '' };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const labels = ['', 'Weak', 'Fair', 'Moderate', 'Strong', 'Strong'];
  return { score, label: labels[Math.min(score, 5)] };
}

const STRENGTH_COLORS = ['', 'bg-red-500', 'bg-amber-500', 'bg-amber-400', 'bg-green-500', 'bg-green-400'];

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  mode: 'create' | 'invite';
}

export default function CreateUserModal({ open, onClose, mode, onSuccess }: Props) {
  const isInvite = mode === 'invite';

  // Create mode state
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [saving, setSaving] = useState(false);

  // Invite mode state
  const [inviteRole, setInviteRole] = useState<Role>('viewer');
  const [inviteExpiry, setInviteExpiry] = useState('72');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

  const strength = getStrength(password);

  const reset = () => {
    setUsername(''); setDisplayName(''); setPassword(''); setConfirm('');
    setRole('viewer'); setGeneratedLink(null); setCopied(false);
    setInviteRole('viewer'); setInviteExpiry('72');
  };

  const handleClose = () => { reset(); onClose(); };

  // Create user
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    if (password !== confirm) { toast.error('Passwords do not match'); return; }
    setSaving(true);
    try {
      const res = await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          username, password, role,
          ...(displayName ? { display_name: displayName } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create user');
      }
      toast.success('User created');
      reset();
      onSuccess();
    } catch (e) {
      toast.error(`${e}`);
    } finally {
      setSaving(false);
    }
  };

  // Generate invite
  const handleGenerateInvite = async () => {
    setGenerating(true);
    try {
      const res = await apiFetch('/api/admin/invites', {
        method: 'POST',
        body: JSON.stringify({ role: inviteRole, expires_hours: parseInt(inviteExpiry) }),
      });
      if (!res.ok) throw new Error('Failed to create invite');
      const data = await res.json();
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      setGeneratedLink(`${origin}/invite/${data.id}`);
    } catch (e) {
      toast.error(`${e}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!generatedLink) return;
    navigator.clipboard.writeText(generatedLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isInvite ? 'Invite User' : 'Create User'}</DialogTitle>
        </DialogHeader>

        {isInvite ? (
          <div className="space-y-4 pt-1">
            <div className="flex gap-3">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">Role</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole((v ?? 'viewer') as Role)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">Expires in</Label>
                <Select value={inviteExpiry} onValueChange={(v) => setInviteExpiry(v ?? '72')}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24">24 hours</SelectItem>
                    <SelectItem value="72">72 hours</SelectItem>
                    <SelectItem value="168">7 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!generatedLink ? (
              <Button className="w-full" onClick={handleGenerateInvite} disabled={generating}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Generate Link
              </Button>
            ) : (
              <div className="space-y-2">
                <Label className="text-xs">Invite link</Label>
                <div className="flex gap-2">
                  <Input value={generatedLink} readOnly className="h-9 text-xs font-mono" />
                  <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={handleCopy}>
                    {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Share this link. It expires in {inviteExpiry}h and can only be used once.
                </p>
                <div className="flex justify-between gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => { setGeneratedLink(null); setCopied(false); }}>
                    Generate another
                  </Button>
                  <Button size="sm" onClick={() => { onSuccess(); handleClose(); }}>Done</Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Username</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Display name <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select value={role} onValueChange={(v) => setRole((v ?? 'viewer') as Role)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-9"
              />
              {password && (
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
              <Label className="text-xs">Confirm password</Label>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="h-9"
              />
              {confirm && password !== confirm && (
                <p className="text-[10px] text-destructive">Passwords do not match</p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                type="submit"
                disabled={saving || !username || !password || password !== confirm}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create User
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
