'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { ProjectFile, PanelName } from '@/lib/types';
import { getFileName } from '@/lib/utils';
import { useToast } from '@/context/ToastContext';
import { usePlayerContext } from '@/context/PlayerContext';
import { useAuth } from '@/hooks/useAuth';
import ConfirmOverlay from '@/components/ui/ConfirmOverlay';
import Spinner from '@/components/ui/Spinner';

interface ProjectViewProps {
  projectId: string;
  onOpenPanel?: (panel: PanelName) => void;
}

export default function ProjectView({ projectId, onOpenPanel }: ProjectViewProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const { startPlayback } = usePlayerContext();
  const { canEdit } = useAuth();
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const handleFilePlay = (filePath: string) => {
    startPlayback(filePath);
  };

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
          onClick={() => onOpenPanel?.('createShare')}
        >
          Create Share
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => onOpenPanel?.('shareLinks')}
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
      <div className="grid">
        {files.length === 0 ? (
          <div style={{ gridColumn: '1/-1', color: '#666', padding: '20px' }}>
            No files in this project.
          </div>
        ) : (
          files.map((file) => (
            <div key={file.id} className="card" onClick={() => handleFilePlay(file.file_path)} style={{ cursor: 'pointer' }}>
              <img
                src={`/api/thumb?path=${encodeURIComponent(file.file_path)}&w=200`}
                alt={getFileName(file.file_path)}
                className="card-image"
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  const fallbackSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='120'%3E%3Crect fill='%231a1a1a' width='200' height='120'/%3E%3Ctext x='50%25' y='50%25' fill='%23666' text-anchor='middle' dy='.3em' font-size='14'%3E🎥%3C/text%3E%3C/svg%3E`;
                  (e.target as HTMLImageElement).src = fallbackSvg;
                }}
              />
              <div className="card-title">{getFileName(file.file_path)}</div>
              <div className="card-meta">
                {file.scan_status === 'done' && file.duration_seconds ? (
                  <>
                    <div>
                      {file.width}x{file.height}
                    </div>
                    <div>{Math.round(file.duration_seconds)}s</div>
                  </>
                ) : file.scan_status === 'pending' ? (
                  <div>Scanning...</div>
                ) : (
                  <div>Error scanning</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

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
