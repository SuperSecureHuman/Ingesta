'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { AuditEntry } from '@/lib/types';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

const ACTION_LABELS: Record<string, string> = {
  'user.create': 'Created user',
  'user.delete': 'Deleted user',
  'user.role_change': 'Changed role',
  'user.suspend': 'Suspended',
  'user.activate': 'Reactivated',
  'user.password_reset': 'Reset password',
  'user.password_change': 'Changed own password',
  'user.invite_create': 'Created invite',
  'user.login': 'Logged in',
  'user.login_failure': 'Login failed',
  'library.create': 'Created library',
  'library.delete': 'Deleted library',
  'project.create': 'Created project',
  'project.delete': 'Deleted project',
  'share.create': 'Created share',
  'share.revoke': 'Revoked share',
  'session.revoke_all': 'Signed out everywhere',
};

const ACTION_OPTIONS = [
  { value: 'all', label: 'All actions' },
  { value: 'user.create', label: 'User created' },
  { value: 'user.delete', label: 'User deleted' },
  { value: 'user.role_change', label: 'Role changed' },
  { value: 'user.suspend', label: 'Suspended' },
  { value: 'user.activate', label: 'Reactivated' },
  { value: 'user.password_reset', label: 'Password reset' },
  { value: 'session.revoke_all', label: 'Session revoked' },
  { value: 'user.invite_create', label: 'Invite created' },
  { value: 'library.create', label: 'Library created' },
  { value: 'library.delete', label: 'Library deleted' },
];

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function buildActionText(entry: AuditEntry): string {
  const base = ACTION_LABELS[entry.action] ?? entry.action;
  if (entry.target_name) return `${base}: ${entry.target_name}`;
  return base;
}

function parseDetail(detail: string | null): string | null {
  if (!detail) return null;
  try {
    const obj = JSON.parse(detail);
    if (obj.from && obj.to) return `${obj.from} → ${obj.to}`;
    return JSON.stringify(obj, null, 2);
  } catch {
    return detail;
  }
}

export default function SettingsAuditTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [actorFilter, setActorFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const PAGE = 50;

  const loadEntries = useCallback(async (reset = false) => {
    const currentOffset = reset ? 0 : offset;
    if (reset) setLoading(true); else setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(currentOffset) });
      if (actionFilter !== 'all') params.set('action', actionFilter);
      const res = await apiFetch(`/api/admin/audit?${params}`);
      if (!res.ok) throw new Error('Failed to load audit log');
      const data = await res.json();
      if (reset) {
        setEntries(data.entries);
      } else {
        setEntries((prev) => [...prev, ...data.entries]);
      }
      setHasMore(data.entries.length === PAGE);
      setOffset(currentOffset + data.entries.length);
    } catch (e) {
      toast.error(`${e}`);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [offset, actionFilter]);

  useEffect(() => {
    setOffset(0);
    loadEntries(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFilter]);

  const filtered = actorFilter
    ? entries.filter((e) =>
        e.actor_name.toLowerCase().includes(actorFilter.toLowerCase()) ||
        (e.target_name ?? '').toLowerCase().includes(actorFilter.toLowerCase())
      )
    : entries;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Filter by actor or target…"
          value={actorFilter}
          onChange={(e) => setActorFilter(e.target.value)}
          className="h-8 text-sm w-56"
        />
        <Select value={actionFilter} onValueChange={(v) => setActionFilter(v ?? 'all')}>
          <SelectTrigger className="h-8 w-44 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTION_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-10">No audit entries</p>
      ) : (
        <>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-border">
                  <TableHead className="w-28">Time</TableHead>
                  <TableHead className="w-28">Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((entry) => {
                  const detail = parseDetail(entry.detail);
                  const isExpanded = expandedId === entry.id;
                  return (
                    <>
                      <TableRow key={entry.id} className="border-b border-border/50 group">
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger render={<span className="text-xs text-muted-foreground cursor-default" />}>
                              {formatRelative(entry.created_at)}
                            </TooltipTrigger>
                            <TooltipContent>
                              {new Date(entry.created_at).toLocaleString()}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="text-xs font-medium">
                          {entry.actor_name}
                        </TableCell>
                        <TableCell className="text-xs">
                          {buildActionText(entry)}
                        </TableCell>
                        <TableCell>
                          {detail && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                            >
                              {isExpanded
                                ? <ChevronDown className="h-3.5 w-3.5" />
                                : <ChevronRight className="h-3.5 w-3.5" />
                              }
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                      {isExpanded && detail && (
                        <TableRow key={`${entry.id}-detail`} className="border-b border-border/30">
                          <TableCell colSpan={4} className="bg-zinc-900/40 px-4 py-2">
                            <pre className="text-[10px] text-muted-foreground font-mono whitespace-pre-wrap">
                              {detail}
                            </pre>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {hasMore && !actorFilter && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadEntries(false)}
                disabled={loadingMore}
              >
                {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />}
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
