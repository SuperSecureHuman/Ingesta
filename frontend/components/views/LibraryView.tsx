'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { Library, BrowseResult, SelectionItem, LutEntry } from '@/lib/types';
import { slugify } from '@/lib/utils';
import { toast } from 'sonner';
import { usePlayerContext } from '@/context/PlayerContext';
import { useSelection } from '@/hooks/useSelection';
import { useAuth } from '@/hooks/useAuth';
import { usePanelContext } from '@/context/PanelContext';
import { fetchLuts } from '@/lib/api';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import FileCard from '@/components/cards/FileCard';
import SelectionToolbar from '@/components/custom/SelectionToolbar';
import PanelShell from '@/components/panels/PanelShell';

interface LibraryViewProps {
  librarySlug: string;
  folderPath: string[];
  onLibraryResolved?: (libraryId: string, libraryName: string) => void;
}

function toUrlSegments(absolutePath: string, rootPath: string): string[] {
  if (absolutePath === rootPath) return [];
  const prefix = rootPath.endsWith('/') ? rootPath : rootPath + '/';
  const relative = absolutePath.startsWith(prefix)
    ? absolutePath.slice(prefix.length)
    : absolutePath;
  return relative.split('/').filter(Boolean);
}

function toAbsolutePath(rootPath: string, segments: string[]): string {
  if (segments.length === 0) return rootPath;
  return rootPath + '/' + segments.join('/');
}

const LOG_PROFILES = [
  { value: '', label: '— none —' },
  { value: 'rec709', label: 'Rec.709' },
  { value: 'logc3', label: 'ARRI LogC3' },
  { value: 'nlog', label: 'Nikon N-Log' },
  { value: 'slog3', label: 'Sony S-Log3' },
  { value: 'slog2', label: 'Sony S-Log2' },
  { value: 'hlg', label: 'HLG' },
  { value: 'pq', label: 'PQ / HDR10' },
  { value: 'dlog_m', label: 'DJI D-Log M' },
  { value: 'clog2', label: 'Canon C-Log2' },
  { value: 'clog3', label: 'Canon C-Log3' },
];

interface ComboboxProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
}

function Combobox({ id, label, value, onChange, suggestions }: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filtered = suggestions.filter((s) => s.toLowerCase().includes(value.toLowerCase()));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="space-y-1.5 mt-4" ref={ref} style={{ position: 'relative' }}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1e1e1e', border: '1px solid #444', borderRadius: '4px', zIndex: 100, maxHeight: '160px', overflowY: 'auto' }}>
          {filtered.map((s) => (
            <div
              key={s}
              onMouseDown={(e) => { e.preventDefault(); onChange(s); setOpen(false); }}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#2a2a2a')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '')}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LibraryView({
  librarySlug,
  folderPath,
  onLibraryResolved,
}: LibraryViewProps) {
  const router = useRouter();
  const { startPlayback } = usePlayerContext();
  const { selectedItems, updateSelection, clearSelection } = useSelection();
  const { canEdit } = useAuth();
  const { openPanel } = usePanelContext();

  const [library, setLibrary] = useState<Library | null>(null);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<BrowseResult | null>(null);
  const [sourceTags, setSourceTags] = useState<Record<string, { camera: string | null; lens: string | null }>>({});

  // Path tag panel state
  const [tagPaths, setTagPaths] = useState<string[]>([]);  // 1 = single, >1 = bulk
  const [tagCamera, setTagCamera] = useState('');
  const [tagLens, setTagLens] = useState('');
  const [tagLogProfile, setTagLogProfile] = useState('');
  const [tagLutId, setTagLutId] = useState('');
  const [tagLutIntensity, setTagLutIntensity] = useState(1.0);
  const [tagSubmitting, setTagSubmitting] = useState(false);
  const [tagError, setTagError] = useState('');
  const [allCameras, setAllCameras] = useState<string[]>([]);
  const [allLenses, setAllLenses] = useState<string[]>([]);
  const [allLuts, setAllLuts] = useState<LutEntry[]>([]);

  useEffect(() => {
    apiFetch('/api/libraries')
      .then((res) => res.json())
      .then((data) => {
        const found = (data.libraries as Library[]).find(
          (l) => slugify(l.name) === librarySlug
        );
        if (!found) { router.replace('/'); return; }
        setLibrary(found);
        onLibraryResolved?.(found.id, found.name);
      })
      .catch(() => router.replace('/'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [librarySlug]);

  useEffect(() => {
    if (!library) return;
    const absolutePath = toAbsolutePath(library.root_path, folderPath);
    loadLibraryFiles(absolutePath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, folderPath.join('/')]);

  const loadLibraryFiles = async (path: string) => {
    if (!library) return;
    try {
      setLoading(true);
      const browseRes = await apiFetch(
        `/api/libraries/${library.id}/browse?path=${encodeURIComponent(path)}`
      );
      if (!browseRes.ok) { toast.error('Failed to load files'); return; }
      const browseData = await browseRes.json();
      setFiles(browseData);

      const videoPaths: string[] = (browseData.entries ?? [])
        .filter((e: { is_video: boolean }) => e.is_video)
        .map((e: { path: string }) => e.path);
      if (videoPaths.length > 0) {
        apiFetch('/api/files/source-tags-by-paths', {
          method: 'POST',
          body: JSON.stringify({ paths: videoPaths }),
        })
          .then((r) => r.ok ? r.json() : { tags: {} })
          .then((data) => setSourceTags(data.tags ?? {}));
      } else {
        setSourceTags({});
      }
    } catch (e) {
      toast.error(`Error: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  const openTagPanel = useCallback((paths: string[], existing?: { camera: string | null; lens: string | null; lut_id?: string | null; lut_intensity?: number | null }) => {
    setTagPaths(paths);
    setTagCamera(paths.length === 1 ? (existing?.camera ?? '') : '');
    setTagLens(paths.length === 1 ? (existing?.lens ?? '') : '');
    setTagLogProfile('');
    setTagLutId(paths.length === 1 ? (existing?.lut_id ?? '') : '');
    setTagLutIntensity(paths.length === 1 ? (existing?.lut_intensity ?? 1.0) : 1.0);
    setTagError('');
    Promise.all([
      apiFetch('/api/files/cameras').then((r) => r.ok ? r.json() : { cameras: [] }),
      apiFetch('/api/files/lenses').then((r) => r.ok ? r.json() : { lenses: [] }),
      fetchLuts(),
    ]).then(([camData, lensData, lutsData]) => {
      setAllCameras(camData.cameras ?? []);
      setAllLenses(lensData.lenses ?? []);
      setAllLuts(lutsData);
    });
  }, []);

  const handleTagClick = useCallback((path: string) => {
    openTagPanel([path], sourceTags[path]);
  }, [sourceTags, openTagPanel]);
  const handleBulkTagClick = useCallback(() => {
    const filePaths = Array.from(selectedItems.values())
      .filter((item) => item.type === 'file')
      .map((item) => item.path);
    if (filePaths.length === 0) return;
    openTagPanel(filePaths);
  }, [selectedItems, openTagPanel]);

  const handleTagSave = async () => {
    if (tagPaths.length === 0) return;
    setTagSubmitting(true);
    setTagError('');
    try {
      const results = await Promise.all(
        tagPaths.map((path) =>
          apiFetch('/api/path-tags', {
            method: 'PUT',
            body: JSON.stringify({
              path,
              camera: tagCamera.trim() || null,
              lens: tagLens.trim() || null,
              lut_id: tagLutId || null,
              lut_intensity: tagLutIntensity,
            }),
          })
        )
      );
      const failed = results.find((r) => !r.ok);
      if (failed) {
        const body = await failed.json().catch(() => ({}));
        throw new Error(body.detail ?? 'Save failed');
      }
      const tagUpdate = {
        camera: tagCamera.trim() || null,
        lens: tagLens.trim() || null,
        lut_id: tagLutId || null,
        lut_intensity: tagLutIntensity,
      };
      setSourceTags((prev) => {
        const next = { ...prev };
        tagPaths.forEach((p) => { next[p] = tagUpdate; });
        return next;
      });
      toast.success(tagPaths.length > 1 ? `Tags applied to ${tagPaths.length} files` : 'Tags saved');
      setTagPaths([]);
    } catch (e) {
      setTagError(`${e}`);
    } finally {
      setTagSubmitting(false);
    }
  };

  const handleFolderOpen = (absoluteFolderPath: string) => {
    if (!library) return;
    const segments = toUrlSegments(absoluteFolderPath, library.root_path);
    const url = segments.length
      ? `/library/${librarySlug}/${segments.map(encodeURIComponent).join('/')}`
      : `/library/${librarySlug}`;
    router.push(url);
  };

  const handleNavigateBack = () => {
    if (!library || !files?.parent) return;
    const segments = toUrlSegments(files.parent, library.root_path);
    const url = segments.length
      ? `/library/${librarySlug}/${segments.map(encodeURIComponent).join('/')}`
      : `/library/${librarySlug}`;
    router.push(url);
  };

  const handleAddEntireLibrary = () => {
    clearSelection();
    openPanel('addToProject');
  };

  const handleFilePlay = useCallback((path: string) => {
    startPlayback(path);
  }, [startPlayback]);

  const handleSelectionChange = useCallback((path: string, type: 'file' | 'folder', selected: boolean) => {
    const item: SelectionItem = { type, path };
    updateSelection(item, selected);
  }, [updateSelection]);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!files) {
    return <div style={{ color: '#666', padding: '20px' }}>Failed to load library files</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {files.parent !== null && (
            <Button size="sm" variant="outline" onClick={handleNavigateBack}>
              ← Back
            </Button>
          )}
          <h2 className="text-lg font-semibold">Library Files</h2>
        </div>
        {canEdit() && (
          <Button size="sm" onClick={handleAddEntireLibrary}>
            Add Entire Library to Project
          </Button>
        )}
      </div>
      <div className="grid-cards">
        {files.entries.length === 0 ? (
          <div style={{ gridColumn: '1/-1', color: '#666', padding: '20px' }}>
            No files in this library.
          </div>
        ) : (
          files.entries.map((entry) => (
            <FileCard
              key={entry.path}
              entry={entry}
              isSelected={selectedItems.has(entry.path)}
              onPlay={handleFilePlay}
              onSelectionChange={handleSelectionChange}
              onFolderOpen={handleFolderOpen}
              camera={sourceTags[entry.path]?.camera ?? null}
              lens={sourceTags[entry.path]?.lens ?? null}
              onTagClick={canEdit() ? handleTagClick : undefined}
            />
          ))
        )}
      </div>
      {canEdit() && (
        <SelectionToolbar
          count={selectedItems.size}
          onAddToProject={() => openPanel('addToProject')}
          onClear={clearSelection}
          onTagSelected={handleBulkTagClick}
        />
      )}

      {/* Path-based tag panel for library files */}
      <PanelShell
        isOpen={tagPaths.length > 0}
        title={tagPaths.length > 1 ? `Tag ${tagPaths.length} Files` : 'Source Tags'}
        onClose={() => setTagPaths([])}
        error={tagError}
        footer={
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setTagPaths([])} disabled={tagSubmitting}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleTagSave} disabled={tagSubmitting}>
              {tagSubmitting ? 'Saving...' : tagPaths.length > 1 ? `Apply to ${tagPaths.length} Files` : 'Save'}
            </Button>
          </div>
        }
      >
        {tagPaths.length > 1 && (
          <p className="text-xs text-muted-foreground mb-2">Blank fields are left unchanged.</p>
        )}
        <Combobox id="lib-camera" label="Camera" value={tagCamera} onChange={setTagCamera} suggestions={allCameras} />
        <Combobox id="lib-lens" label="Lens" value={tagLens} onChange={setTagLens} suggestions={allLenses} />
        <div className="space-y-1.5 mt-4">
          <Label>Log Profile</Label>
          <Select value={tagLogProfile || '_none'} onValueChange={(v) => setTagLogProfile(v === '_none' ? '' : (v ?? ''))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LOG_PROFILES.map((p) => (
                <SelectItem key={p.value} value={p.value || '_none'}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 mt-4">
          <Label>Preferred LUT{tagPaths.length > 1 && ' (apply to all)'}</Label>
          <Select value={tagLutId || '_none'} onValueChange={(v) => setTagLutId(v === '_none' ? '' : (v ?? ''))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— none —</SelectItem>
              {allLuts.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name} ({l.camera})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {tagLutId && (
          <div className="space-y-2 mt-4">
            <Label>LUT Intensity: {Math.round(tagLutIntensity * 100)}%</Label>
            <Slider
              value={tagLutIntensity}
              onValueChange={(v) => setTagLutIntensity(v as number)}
              min={0}
              max={1}
              step={0.01}
              className="w-full"
            />
          </div>
        )}
      </PanelShell>
    </div>
  );
}
