'use client';

import { useState, useEffect, useRef } from 'react';
import { apiFetch, fetchLuts } from '@/lib/api';
import { ProjectFile, LutEntry } from '@/lib/types';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import PanelShell from './PanelShell';

const LOG_PROFILES = [
  { value: '_none', label: '— none —' },
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
  placeholder?: string;
}

function Combobox({ id, label, value, onChange, suggestions, placeholder }: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = suggestions.filter((s) =>
    s.toLowerCase().includes(value.toLowerCase())
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="space-y-1.5" ref={ref} style={{ position: 'relative' }}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 rounded-md border border-border bg-zinc-900 shadow-lg max-h-40 overflow-y-auto">
          {filtered.map((s) => (
            <div
              key={s}
              onMouseDown={(e) => { e.preventDefault(); onChange(s); setOpen(false); }}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-zinc-800"
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface SourceTagPanelProps {
  isOpen: boolean;
  onClose: () => void;
  files: ProjectFile | ProjectFile[] | null;
  onSaved?: (updatedFiles: ProjectFile[]) => void;
}

export default function SourceTagPanel({ isOpen, onClose, files, onSaved }: SourceTagPanelProps) {
  const fileList: ProjectFile[] = files === null ? [] : Array.isArray(files) ? files : [files];
  const isMulti = fileList.length > 1;
  const singleFile = !isMulti ? fileList[0] ?? null : null;

  const [camera, setCamera] = useState('');
  const [lens, setLens] = useState('');
  const [logProfile, setLogProfile] = useState('_none');
  const [lutId, setLutId] = useState('_none');
  const [intensity, setIntensity] = useState(1.0);

  const [cameras, setCameras] = useState<string[]>([]);
  const [lenses, setLenses] = useState<string[]>([]);
  const [luts, setLuts] = useState<LutEntry[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || fileList.length === 0) return;
    setError('');

    if (isMulti) {
      setCamera('');
      setLens('');
      setLogProfile('_none');
      setLutId('_none');
      setIntensity(1.0);
    } else if (singleFile) {
      setCamera(singleFile.camera ?? '');
      setLens(singleFile.lens ?? '');
    }

    Promise.all([
      apiFetch('/api/files/cameras').then((r) => r.ok ? r.json() : { cameras: [] }),
      apiFetch('/api/files/lenses').then((r) => r.ok ? r.json() : { lenses: [] }),
      fetchLuts(),
      ...(!isMulti && singleFile ? [
        apiFetch(`/api/files/${singleFile.id}/color-meta`).then((r) => r.ok ? r.json() : null),
        apiFetch(`/api/files/${singleFile.id}/lut-pref`).then((r) => r.ok ? r.json() : null),
      ] : []),
    ]).then(([camData, lensData, lutsData, colorMeta, lutPref]) => {
      setCameras(camData.cameras ?? []);
      setLenses(lensData.lenses ?? []);
      setLuts(lutsData);
      if (!isMulti) {
        setLogProfile(colorMeta?.log_profile ?? '_none');
        setLutId(lutPref?.lut_id ?? '_none');
        setIntensity(lutPref?.intensity ?? 1.0);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, fileList.map((f) => f.id).join(',')]);

  const handleSave = async () => {
    if (fileList.length === 0) return;
    setSubmitting(true);
    setError('');

    try {
      const calls: Promise<Response>[] = [];

      for (const file of fileList) {
        calls.push(
          apiFetch(`/api/files/${file.id}/source-tags`, {
            method: 'PUT',
            body: JSON.stringify({
              camera: camera.trim() || null,
              lens: lens.trim() || null,
            }),
          })
        );

        if (!isMulti || logProfile !== '_none') {
          calls.push(
            apiFetch(`/api/files/${file.id}/color-meta`, {
              method: 'PUT',
              body: JSON.stringify({ log_profile: logProfile === '_none' ? null : logProfile }),
            })
          );
        }
        const resolvedLutId = lutId === '_none' ? null : lutId;
        if (!isMulti || resolvedLutId) {
          calls.push(
            apiFetch(`/api/files/${file.id}/lut-pref`, {
              method: 'PUT',
              body: JSON.stringify({ lut_id: resolvedLutId, intensity }),
            })
          );
        }
      }

      const results = await Promise.all(calls);
      const failed = results.find((r) => !r.ok);
      if (failed) {
        const body = await failed.json().catch(() => ({}));
        throw new Error(body.detail ?? 'Save failed');
      }

      toast.success(isMulti ? `Tags applied to ${fileList.length} files` : 'Source tags saved');
      onSaved?.(
        fileList.map((f) => ({
          ...f,
          camera: camera.trim() || null,
          lens: lens.trim() || null,
        }))
      );
      onClose();
    } catch (e) {
      const msg = `${e}`;
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const resolvedLutId = lutId === '_none' ? null : lutId;

  return (
    <PanelShell
      isOpen={isOpen}
      title={isMulti ? `Tag ${fileList.length} Files` : 'Source Tags'}
      onClose={onClose}
      error={error}
      footer={
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button className="flex-1" onClick={handleSave} disabled={submitting}>
            {submitting ? 'Saving...' : isMulti ? `Apply to ${fileList.length} Files` : 'Save'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {isMulti && (
          <p className="text-xs text-muted-foreground">
            Applying to {fileList.length} files. Blank fields are left unchanged.
          </p>
        )}

        <Combobox
          id="camera"
          label="Camera"
          value={camera}
          onChange={setCamera}
          suggestions={cameras}
          placeholder={isMulti ? 'Leave blank to keep existing' : undefined}
        />
        <Combobox
          id="lens"
          label="Lens"
          value={lens}
          onChange={setLens}
          suggestions={lenses}
          placeholder={isMulti ? 'Leave blank to keep existing' : undefined}
        />

        <div className="space-y-1.5">
          <Label>Log Profile{isMulti && ' (apply to all)'}</Label>
          <Select value={logProfile} onValueChange={(v) => setLogProfile(v ?? '_none')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOG_PROFILES.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Preferred LUT{isMulti && ' (apply to all)'}</Label>
          <Select value={lutId} onValueChange={(v) => setLutId(v ?? '_none')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— none —</SelectItem>
              {luts.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name} ({l.camera})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {resolvedLutId && (
          <div className="space-y-2">
            <Label>LUT Intensity: {Math.round(intensity * 100)}%</Label>
            <Slider
              value={intensity}
              onValueChange={(v) => setIntensity(v as number)}
              min={0}
              max={1}
              step={0.01}
              className="w-full"
            />
          </div>
        )}
      </div>
    </PanelShell>
  );
}
