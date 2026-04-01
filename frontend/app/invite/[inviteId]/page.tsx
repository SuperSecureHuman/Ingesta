'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

// Strength meter (same logic)
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

function formatExpiry(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return 'Expired';
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'Less than 1 hour';
  if (hours < 24) return `${hours} hours`;
  return `${Math.floor(hours / 24)} days`;
}

export default function InvitePage() {
  const router = useRouter();
  const params = useParams();
  const inviteId = params.inviteId as string;

  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'success'>('loading');
  const [inviteData, setInviteData] = useState<{ role: string; expires_at: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const strength = getStrength(password);

  useEffect(() => {
    const validate = async () => {
      try {
        const res = await apiFetch(`/api/invite/${inviteId}`);
        if (res.ok) {
          const data = await res.json();
          setInviteData(data);
          setStatus('valid');
        } else {
          const err = await res.json();
          setErrorMsg(err.detail || 'This invite is invalid or has expired.');
          setStatus('invalid');
        }
      } catch {
        setErrorMsg('Unable to validate invite.');
        setStatus('invalid');
      }
    };
    if (inviteId) validate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    if (password !== confirm) { toast.error('Passwords do not match'); return; }
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/invite/${inviteId}/redeem`, {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create account');
      }
      setStatus('success');
      setTimeout(() => router.replace('/'), 1500);
    } catch (e) {
      toast.error(`${e}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="text-2xl font-bold tracking-tight">
            <span className="text-primary">▶</span> Ingesta
          </div>
          <p className="text-sm text-muted-foreground">Create your account</p>
        </div>

        {status === 'loading' && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {status === 'invalid' && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center">
            <p className="text-sm text-destructive">{errorMsg}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-center space-y-2">
            <p className="text-sm text-green-400 font-medium">Account created!</p>
            <p className="text-xs text-muted-foreground">Redirecting you in…</p>
          </div>
        )}

        {status === 'valid' && inviteData && (
          <>
            {/* Invite info */}
            <div className="rounded-lg border border-border bg-card px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">You&apos;ve been invited as</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                  {inviteData.role}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Expires in</span>
                <span className="text-xs">{formatExpiry(inviteData.expires_at)}</span>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Username</Label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                  className="h-9"
                  autoComplete="username"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-9"
                  autoComplete="new-password"
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
                  autoComplete="new-password"
                />
                {confirm && password !== confirm && (
                  <p className="text-[10px] text-destructive">Passwords do not match</p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={submitting || !username || !password || password !== confirm}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create Account
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
