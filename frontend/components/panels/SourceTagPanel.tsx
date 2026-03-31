'use client';

import { useState, useEffect, useRef } from 'react';
import { apiFetch, fetchLuts } from '@/lib/api';
import { ProjectFile, LutEntry } from '@/lib/types';
import { useToast } from '@/context/ToastContext';
import PanelShell from './PanelShell';

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
    <div className="form-group" ref={ref} style={{ position: 'relative' }}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: '#1e1e1e',
          border: '1px solid #444',
          borderRadius: '4px',
          zIndex: 100,
          maxHeight: '160px',
          overflowY: 'auto',
        }}>
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

interface SourceTagPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Single file or array of files for multi-select mode */
  files: ProjectFile | ProjectFile[] | null;
  onSaved?: (updatedFiles: ProjectFile[]) => void;
}

export default function SourceTagPanel({ isOpen, onClose, files, onSaved }: SourceTagPanelProps) {
  const { showToast } = useToast();

  const fileList: ProjectFile[] = files === null ? [] : Array.isArray(files) ? files : [files];
  const isMulti = fileList.length > 1;
  const singleFile = !isMulti ? fileList[0] ?? null : null;

  const [camera, setCamera] = useState('');
  const [lens, setLens] = useState('');
  const [logProfile, setLogProfile] = useState('');
  const [lutId, setLutId] = useState('');
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
      // Multi-mode: start blank — user fills in what to apply
      setCamera('');
      setLens('');
      setLogProfile('');
      setLutId('');
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
        setLogProfile(colorMeta?.log_profile ?? '');
        setLutId(lutPref?.lut_id ?? '');
        setIntensity(lutPref?.intensity ?? 1.0);
      }
    });
  }, [isOpen, fileList.map((f) => f.id).join(',')]);

  const handleSave = async () => {
    if (fileList.length === 0) return;
    setSubmitting(true);
    setError('');

    try {
      const calls: Promise<Response>[] = [];

      for (const file of fileList) {
        // Always save source tags
        calls.push(
          apiFetch(`/api/files/${file.id}/source-tags`, {
            method: 'PUT',
            body: JSON.stringify({
              camera: camera.trim() || null,
              lens: lens.trim() || null,
            }),
          })
        );

        // In multi-mode only save color/lut if user explicitly set a value
        if (!isMulti || logProfile) {
          calls.push(
            apiFetch(`/api/files/${file.id}/color-meta`, {
              method: 'PUT',
              body: JSON.stringify({ log_profile: logProfile || null }),
            })
          );
        }
        if (!isMulti || lutId) {
          calls.push(
            apiFetch(`/api/files/${file.id}/lut-pref`, {
              method: 'PUT',
              body: JSON.stringify({ lut_id: lutId || null, intensity }),
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

      showToast(
        isMulti ? `Tags applied to ${fileList.length} files` : 'Source tags saved',
        'success'
      );
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
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const multiHint = isMulti
    ? `Applying to ${fileList.length} files. Blank fields are left unchanged.`
    : null;

  return (
    <PanelShell
      isOpen={isOpen}
      title={isMulti ? `Tag ${fileList.length} Files` : 'Source Tags'}
      onClose={onClose}
      error={error}
      footer={
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            style={{ flex: 1 }}
            disabled={submitting}
          >
            {submitting ? 'Saving...' : isMulti ? `Apply to ${fileList.length} Files` : 'Save'}
          </button>
        </div>
      }
    >
      {multiHint && (
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>{multiHint}</div>
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

      <div className="form-group">
        <label htmlFor="logProfile">Log Profile{isMulti && ' (apply to all)'}</label>
        <select id="logProfile" value={logProfile} onChange={(e) => setLogProfile(e.target.value)}>
          {LOG_PROFILES.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="preferredLut">Preferred LUT{isMulti && ' (apply to all)'}</label>
        <select id="preferredLut" value={lutId} onChange={(e) => setLutId(e.target.value)}>
          <option value="">— none —</option>
          {luts.map((l) => (
            <option key={l.id} value={l.id}>{l.name} ({l.camera})</option>
          ))}
        </select>
      </div>

      {lutId && (
        <div className="form-group">
          <label htmlFor="lutIntensity">LUT Intensity: {Math.round(intensity * 100)}%</label>
          <input
            id="lutIntensity"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={intensity}
            onChange={(e) => setIntensity(parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
      )}
    </PanelShell>
  );
}
