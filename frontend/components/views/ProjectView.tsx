'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { ProjectFile } from '@/lib/types';
import { useToast } from '@/context/ToastContext';
import { useAppContext } from '@/context/AppContext';
import Spinner from '@/components/ui/Spinner';

export default function ProjectView() {
  const { currentProjectId, setCurrentView } = useAppContext();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<ProjectFile[]>([]);

  useEffect(() => {
    if (!currentProjectId) {
      setCurrentView('home');
      return;
    }
    loadProjectFiles();
  }, [currentProjectId]);

  const loadProjectFiles = async () => {
    if (!currentProjectId) return;
    try {
      setLoading(true);
      const res = await apiFetch(`/api/projects/${currentProjectId}`);
      if (!res.ok) {
        showToast('Failed to load project', 'error');
        setCurrentView('home');
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
        <button className="btn btn-primary btn-sm">Create Share</button>
        <button className="btn btn-secondary btn-sm">Share Links</button>
        <button className="btn btn-danger btn-sm">Delete Project</button>
      </div>
      <div className="grid">
        {files.length === 0 ? (
          <div style={{ gridColumn: '1/-1', color: '#666', padding: '20px' }}>
            No files in this project.
          </div>
        ) : (
          files.map((file) => (
            <div key={file.id} className="card">
              <img
                src={`/api/thumb?path=${encodeURIComponent(file.file_path)}&w=200`}
                alt={file.file_path.split('/').pop()}
                className="card-image"
                onError={(e) => {
                  const fallbackSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='120'%3E%3Crect fill='%231a1a1a' width='200' height='120'/%3E%3Ctext x='50%25' y='50%25' fill='%23666' text-anchor='middle' dy='.3em' font-size='14'%3E🎥%3C/text%3E%3C/svg%3E`;
                  (e.target as HTMLImageElement).src = fallbackSvg;
                }}
              />
              <div className="card-title">{file.file_path.split('/').pop()}</div>
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
    </div>
  );
}
