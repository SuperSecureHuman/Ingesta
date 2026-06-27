'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { formatExpiry } from '@/lib/utils';
import { useClipboardCopy } from '@/hooks/useClipboardCopy';
import { Loader2, Copy, Check, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ShareEntry {
  id: string;
  share_type: 'project' | 'library' | 'folder';
  scope_name: string;
  folder_path: string | null;
  created_at: string;
  expires_at: string | null;
  active: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  project: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  library: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  folder: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
};

function shareStatus(s: ShareEntry): { label: string; classes: string } {
  if (!s.active) return { label: 'Revoked', classes: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' };
  if (s.expires_at && new Date(s.expires_at).getTime() < Date.now()) {
    return { label: 'Expired', classes: 'bg-red-500/10 text-red-400 border-red-500/30' };
  }
  return { label: 'Active', classes: 'bg-green-500/10 text-green-400 border-green-500/30' };
}

export default function SettingsSharesTab() {
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const { copy, copiedId } = useClipboardCopy();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/shares');
      if (!res.ok) throw new Error('Failed to load shares');
      const data = await res.json();
      setShares(data.shares);
    } catch (e) {
      toast.error(`${e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      const res = await apiFetch(`/api/admin/shares/${revokeTarget}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      toast.success('Share revoked');
      setRevokeTarget(null);
      load();
    } catch (e) {
      toast.error(`${e}`);
    }
  };

  const copyShareLink = (id: string) => {
    copy(id, `${window.location.origin}/share/${id}`);
  };

  const filtered = showInactive ? shares : shares.filter(s => {
    if (!s.active) return false;
    if (s.expires_at && new Date(s.expires_at).getTime() < Date.now()) return false;
    return true;
  });

  const activeCount = shares.filter(s => {
    if (!s.active) return false;
    if (s.expires_at && new Date(s.expires_at).getTime() < Date.now()) return false;
    return true;
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {activeCount} active share{activeCount !== 1 ? 's' : ''} · {shares.length} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="show-inactive"
            checked={showInactive}
            onCheckedChange={setShowInactive}
          />
          <Label htmlFor="show-inactive" className="text-sm text-muted-foreground cursor-pointer">
            Show revoked/expired
          </Label>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No shares found</div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Type</TableHead>
                <TableHead className="text-muted-foreground">Scope</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground">Created</TableHead>
                <TableHead className="text-muted-foreground">Expires</TableHead>
                <TableHead className="text-muted-foreground text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((share) => {
                const status = shareStatus(share);
                const isActive = status.label === 'Active';
                const displayName = share.scope_name
                  ? share.share_type === 'folder'
                    ? share.scope_name.split('/').pop() || share.scope_name
                    : share.scope_name
                  : share.id.slice(0, 8) + '…';
                return (
                  <TableRow key={share.id} className="border-border">
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 capitalize ${TYPE_COLORS[share.share_type] ?? ''}`}>
                        {share.share_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-sm max-w-[200px]">
                      <Tooltip>
                        <TooltipTrigger>
                          <span className="truncate block cursor-default">{displayName}</span>
                        </TooltipTrigger>
                        {share.folder_path && (
                          <TooltipContent side="top" className="max-w-xs break-all text-xs">
                            {share.folder_path}
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${status.classes}`}>
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(share.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {share.expires_at ? formatExpiry(share.expires_at) : 'Never'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => copyShareLink(share.id)}
                            >
                              {copiedId === share.id
                                ? <Check className="h-3.5 w-3.5 text-green-400" />
                                : <Copy className="h-3.5 w-3.5" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copy share link</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => window.open(`/share/${share.id}`, '_blank')}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Open share</TooltipContent>
                        </Tooltip>
                        {isActive && (
                          <Tooltip>
                            <TooltipTrigger>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => setRevokeTarget(share.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Revoke share</TooltipContent>
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

      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke share link?</AlertDialogTitle>
            <AlertDialogDescription>
              Anyone with this link will immediately lose access. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
