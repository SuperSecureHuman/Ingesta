'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { Invite, Role } from '@/lib/types';
import { Loader2, Copy, Check, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';

function formatExpiry(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return 'Expired';
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function getInviteStatus(invite: Invite): { label: string; classes: string } {
  if (invite.used_at) return { label: 'Used', classes: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' };
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return { label: 'Expired', classes: 'bg-red-500/10 text-red-400 border-red-500/30' };
  }
  return { label: 'Active', classes: 'bg-green-500/10 text-green-400 border-green-500/30' };
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  editor: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  viewer: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

export default function SettingsInvitesTab() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllInvites, setShowAllInvites] = useState(false);
  const [showNewPanel, setShowNewPanel] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // New invite form
  const [newRole, setNewRole] = useState<Role>('viewer');
  const [newExpiry, setNewExpiry] = useState('72');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [generatedId, setGeneratedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const loadInvites = useCallback(async (all = showAllInvites) => {
    try {
      const res = await apiFetch(`/api/admin/invites?active_only=${!all}`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setInvites(data.invites);
    } catch (e) {
      toast.error(`${e}`);
    } finally {
      setLoading(false);
    }
  }, [showAllInvites]);

  useEffect(() => {
    loadInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAllInvites]);

  const handleCopy = (id: string, link: string) => {
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      const res = await apiFetch(`/api/admin/invites/${revokeTarget}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to revoke');
      toast.success('Invite revoked');
      setRevokeTarget(null);
      loadInvites();
    } catch (e) {
      toast.error(`${e}`);
      setRevokeTarget(null);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await apiFetch('/api/admin/invites', {
        method: 'POST',
        body: JSON.stringify({ role: newRole, expires_hours: parseInt(newExpiry) }),
      });
      if (!res.ok) throw new Error('Failed to create invite');
      const data = await res.json();
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const link = `${origin}/invite/${data.id}`;
      setGeneratedLink(link);
      setGeneratedId(data.id);
      loadInvites();
    } catch (e) {
      toast.error(`${e}`);
    } finally {
      setGenerating(false);
    }
  };

  const inviteLink = (id: string) =>
    typeof window !== 'undefined' ? `${window.location.origin}/invite/${id}` : `/invite/${id}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant={showAllInvites ? 'default' : 'outline'}
            className="h-8 text-xs"
            onClick={() => setShowAllInvites(!showAllInvites)}
          >
            {showAllInvites ? 'Active only' : 'Show all'}
          </Button>
        </div>
        <Button size="sm" onClick={() => { setGeneratedLink(null); setShowNewPanel(true); }}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New Invite
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : invites.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-10">No invites yet</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-border">
                <TableHead>Link</TableHead>
                <TableHead className="w-24">Role</TableHead>
                <TableHead className="w-28">Created by</TableHead>
                <TableHead className="w-24">Expires</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-20 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.map((invite) => {
                const status = getInviteStatus(invite);
                const link = inviteLink(invite.id);
                const isActive = !invite.used_at && new Date(invite.expires_at).getTime() > Date.now();
                return (
                  <TableRow key={invite.id} className="border-b border-border/50">
                    <TableCell>
                      <button
                        onClick={() => handleCopy(invite.id, link)}
                        className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors truncate max-w-[180px] block"
                      >
                        {`…/invite/${invite.id.slice(0, 8)}…`}
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${ROLE_COLORS[invite.role]}`}>
                        {invite.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {invite.created_by_username ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatExpiry(invite.expires_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${status.classes}`}>
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleCopy(invite.id, link)}
                            >
                              {copiedId === invite.id
                                ? <Check className="h-3.5 w-3.5 text-green-400" />
                                : <Copy className="h-3.5 w-3.5" />
                              }
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copy link</TooltipContent>
                        </Tooltip>
                        {isActive && (
                          <Tooltip>
                            <TooltipTrigger>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 hover:text-destructive"
                                onClick={() => setRevokeTarget(invite.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Revoke</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* New invite panel */}
      <Sheet open={showNewPanel} onOpenChange={(open) => !open && setShowNewPanel(false)}>
        <SheetContent
          side="right"
          className="w-[380px] p-0 bg-zinc-900/75 backdrop-blur-xl border-l border-primary/[0.08] [background-image:linear-gradient(to_bottom,hsl(var(--primary)/0.04),transparent_40%)]"
        >
          <SheetHeader className="px-5 py-4 border-b border-border/50">
            <SheetTitle className="text-base font-semibold">New Invite Link</SheetTitle>
          </SheetHeader>
          <div className="px-5 py-4 space-y-5">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Role for new user</Label>
                <Select value={newRole} onValueChange={(v) => setNewRole((v ?? 'viewer') as Role)}>
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
                <Label className="text-xs">Link expires in</Label>
                <Select value={newExpiry} onValueChange={(v) => setNewExpiry(v ?? '72')}>
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
              <Button className="w-full" onClick={handleGenerate} disabled={generating}>
                {generating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Generate Link
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Share this link</Label>
                  <div className="flex gap-2">
                    <Input value={generatedLink} readOnly className="h-9 text-xs font-mono" />
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-9 w-9 shrink-0"
                      onClick={() => generatedId && handleCopy(generatedId, generatedLink)}
                    >
                      {generatedId && copiedId === generatedId
                        ? <Check className="h-3.5 w-3.5 text-green-400" />
                        : <Copy className="h-3.5 w-3.5" />
                      }
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Single-use link — expires in {newExpiry}h
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => { setGeneratedLink(null); setGeneratedId(null); }}
                >
                  Generate another
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Revoke confirm */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke invite?</AlertDialogTitle>
            <AlertDialogDescription>
              This invite link will stop working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              className="bg-destructive hover:bg-destructive/90"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
