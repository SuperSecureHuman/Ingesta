'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { ProjectFile } from '@/lib/types';
import { getFileName } from '@/lib/utils';
import { useToast } from '@/context/ToastContext';
import { usePlayerContext } from '@/context/PlayerContext';
import { useAuth } from '@/hooks/useAuth';
import { usePanelContext } from '@/context/PanelContext';
import ConfirmOverlay from '@/components/ui/ConfirmOverlay';
import Spinner from '@/components/ui/Spinner';
import SourceTagPanel from '@/components/panels/SourceTagPanel';

interface ProjectViewProps {
  projectId: string;
}

export default function ProjectView({ projectId }: ProjectViewProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const { startPlayback } = usePlayerContext();
  const { canEdit } = useAuth();
  const { openPanel } = usePanelContext();
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [tagPanelOpen, setTagPanelOpen] = useState(false);
  const [tagFiles, setTagFiles] = useState<ProjectFile | ProjectFile[] | null>(null);

  const [filterCamera, setFilterCamera] = useState('');
  const [filterLens, setFilterLens] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadProjectFiles();
  }, [projectId]);

  const loadProjectFiles = async () => {
    try {
      setLoading(true);
      const res = await apiFetch(`/api/projects/${projectId}`);
      if (!res.ok) {
        showToast('Failed to load project', 'error');
        router.replace('/');
        return;
      }

      const data = await res.json();
      setFiles(data.files || []);
    } catch (e) {
      showToast(`Error: ${e}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = async () => {
    try {
      setDeleting(true);
      const res = await apiFetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete project');
      }

      showToast('Project deleted', 'success');
      router.push('/');
    } catch (e) {
      showToast(`${e}`, 'error');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleFilePlay = (filePath: string, fileId: string) => {
    startPlayback(filePath, 0, fileId);
  };

  const handleTagSaved = (updatedFiles: ProjectFile[]) => {
    const updatedMap = new Map(updatedFiles.map((f) => [f.id, f]));
    setFiles((prev) =>
      prev.map((f) => {
        const u = updatedMap.get(f.id);
        return u ? { ...f, camera: u.camera, lens: u.lens } : f;
      })
    );
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const distinctCameras = Array.from(new Set(files.map((f) => f.camera).filter(Boolean) as string[])).sort();
  const distinctLenses = Array.from(new Set(files.map((f) => f.lens).filter(Boolean) as string[])).sort();

  const visibleFiles = files.filter((f) => {
    if (filterCamera && f.camera !== filterCamera) return false;
    if (filterLens && f.lens !== filterLens) return false;
    return true;
  });

  const selectedFiles = files.filter((f) => selectedIds.has(f.id));

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      <div className="library-toolbar">
        <button
          className="btn btn-primary btn-sm"
          onClick={() => openPanel('createShare')}
        >
          Create Share
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => openPanel('shareLinks')}
        >
          Share Links
        </button>
        {canEdit() && (
          <button
            className="btn btn-danger btn-sm"
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete Project
          </button>
        )}
      </div>

      {(distinctCameras.length > 0 || distinctLenses.length > 0) && (
        <div style={{ display: 'flex', gap: '10px', padding: '10px 0', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: '#888' }}>Filter:</span>
          {distinctCameras.length > 0 && (
            <select
              value={filterCamera}
              onChange={(e) => setFilterCamera(e.target.value)}
              style={{ fontSize: '13px', padding: '4px 8px', background: '#1e1e1e', border: '1px solid #444', borderRadius: '4px', color: '#ccc' }}
            >
              <option value="">All cameras</option>
              {distinctCameras.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {distinctLenses.length > 0 && (
            <select
              value={filterLens}
              onChange={(e) => setFilterLens(e.target.value)}
              style={{ fontSize: '13px', padding: '4px 8px', background: '#1e1e1e', border: '1px solid #444', borderRadius: '4px', color: '#ccc' }}
            >
              <option value="">All lenses</option>
              {distinctLenses.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
          {(filterCamera || filterLens) && (
            <button
              onClick={() => { setFilterCamera(''); setFilterLens(''); }}
              style={{ fontSize: '12px', background: 'none', border: '1px solid #555', borderRadius: '4px', color: '#aaa', cursor: 'pointer', padding: '4px 8px' }}
            >
              Clear
            </button>
          )}
          <span style={{ fontSize: '12px', color: '#666', marginLeft: 'auto' }}>
            {visibleFiles.length} / {files.length} files
          </span>
        </div>
      )}

      <div className="grid">
        {files.length === 0 ? (
          <div style={{ gridColumn: '1/-1', color: '#666', padding: '20px' }}>
            No files in this project.
          </div>
        ) : visibleFiles.length === 0 ? (
          <div style={{ gridColumn: '1/-1', color: '#666', padding: '20px' }}>
            No files match the current filter.
          </div>
        ) : (
          visibleFiles.map((file) => {
            const isSelected = selectedIds.has(file.id);
            return (
              <div
                key={file.id}
                className={`card selectable${isSelected ? ' selected' : ''}`}
                style={{ cursor: 'pointer', position: 'relative', outline: isSelected ? '2px solid #4a9eff' : undefined }}
              >
                {canEdit() && (
                  <input
                    type="checkbox"
                    className="card-check"
                    checked={isSelected}
                    onChange={() => toggleSelect(file.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                <img
                  src={`/api/thumb?path=${encodeURIComponent(file.file_path)}&w=200`}
                  alt={getFileName(file.file_path)}
                  className="card-image"
                  loading="lazy"
                  decoding="async"
                  onClick={() => handleFilePlay(file.file_path, file.id)}
                  onError={(e) => {
                    const fallbackSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='120'%3E%3Crect fill='%231a1a1a' width='200' height='120'/%3E%3Ctext x='50%25' y='50%25' fill='%23666' text-anchor='middle' dy='.3em' font-size='14'%3E%F0%9F%8E%A5%3C/text%3E%3C/svg%3E`;
                    (e.target as HTMLImageElement).src = fallbackSvg;
                  }}
                />
                <div className="card-title" onClick={() => handleFilePlay(file.file_path)}>
                  {getFileName(file.file_path)}
                </div>
                <div className="card-meta" onClick={() => handleFilePlay(file.file_path)}>
                  {file.scan_status === 'done' && file.duration_seconds ? (
                    <>
                      <div>{file.width}x{file.height}</div>
                      <div>{Math.round(file.duration_seconds)}s</div>
                    </>
                  ) : file.scan_status === 'pending' ? (
                    <div>Scanning...</div>
                  ) : (
                    <div>Error scanning</div>
                  )}
                </div>
                {(file.camera || file.lens) && (
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', padding: '4px 8px 0' }}>
                    {file.camera && (
                      <span style={{ fontSize: '11px', background: '#2a2a2a', border: '1px solid #444', borderRadius: '3px', padding: '1px 5px', color: '#bbb' }}>
                        {file.camera}
                      </span>
                    )}
                    {file.lens && (
                      <span style={{ fontSize: '11px', background: '#2a2a2a', border: '1px solid #444', borderRadius: '3px', padding: '1px 5px', color: '#bbb' }}>
                        {file.lens}
                      </span>
                    )}
                  </div>
                )}
                {canEdit() && (
                  <button
                    title="Source tags"
                    onClick={(e) => { e.stopPropagation(); setTagFiles(file); setTagPanelOpen(true); }}
                    style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      background: 'rgba(0,0,0,0.6)',
                      border: '1px solid #555',
                      borderRadius: '4px',
                      color: '#ccc',
                      cursor: 'pointer',
                      fontSize: '13px',
                      padding: '2px 6px',
                      lineHeight: 1,
                    }}
                  >
                    🏷
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Selection toolbar */}
      {canEdit() && selectedIds.size > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#1e1e1e',
          border: '1px solid #444',
          borderRadius: '8px',
          padding: '10px 16px',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          zIndex: 200,
        }}>
          <span style={{ fontSize: '13px', color: '#ccc' }}>
            {selectedIds.size} file{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => { setTagFiles(selectedFiles); setTagPanelOpen(true); }}
          >
            🏷 Tag Selected
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      <SourceTagPanel
        isOpen={tagPanelOpen}
        onClose={() => { setTagPanelOpen(false); setTagFiles(null); }}
        files={tagFiles}
        onSaved={handleTagSaved}
      />

      {showDeleteConfirm && (
        <ConfirmOverlay
          message="Delete this project? This action cannot be undone."
          onConfirm={handleDeleteProject}
          onCancel={() => setShowDeleteConfirm(false)}
          confirmText="Delete"
          isDanger
        />
      )}
    </div>
  );
}
