'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { ProjectFile } from '@/lib/types';
import { getFileName } from '@/lib/utils';
import { toast } from 'sonner';
import { usePlayerContext } from '@/context/PlayerContext';
import { useAuth } from '@/hooks/useAuth';
import { usePanelContext } from '@/context/PanelContext';
import { Loader2, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ConfirmOverlay from '@/components/custom/ConfirmOverlay';
import SourceTagPanel from '@/components/panels/SourceTagPanel';

interface ProjectViewProps {
  projectId: string;
}

export default function ProjectView({ projectId }: ProjectViewProps) {
  const router = useRouter();
  const { startPlayback } = usePlayerContext();
  const { canEdit } = useAuth();
  const { openPanel } = usePanelContext();
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [, setDeleting] = useState(false);

  const [tagPanelOpen, setTagPanelOpen] = useState(false);
  const [tagFiles, setTagFiles] = useState<ProjectFile | ProjectFile[] | null>(null);

  const [filterCamera, setFilterCamera] = useState('');
  const [filterLens, setFilterLens] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadProjectFiles();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadProjectFiles = async () => {
    try {
      setLoading(true);
      const res = await apiFetch(`/api/projects/${projectId}`);
      if (!res.ok) {
        toast.error('Failed to load project');
        router.replace('/');
        return;
      }

      const data = await res.json();
      setFiles(data.files || []);
    } catch (e) {
      toast.error(`Error: ${e}`);
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

      toast.success('Project deleted');
      router.push('/');
    } catch (e) {
      toast.error(`${e}`);
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
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
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
      <div className="flex justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <Button size="sm" onClick={() => openPanel('createShare')}>Create Share</Button>
        <Button size="sm" variant="outline" onClick={() => openPanel('shareLinks')}>Share Links</Button>
        {canEdit() && (
          <Button size="sm" variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
            Delete Project
          </Button>
        )}
      </div>

      {(distinctCameras.length > 0 || distinctLenses.length > 0) && (
        <div className="flex gap-2 items-center flex-wrap py-2 mb-2">
          <span className="text-sm text-muted-foreground">Filter:</span>
          {distinctCameras.length > 0 && (
            <Select value={filterCamera || '_all'} onValueChange={(v) => setFilterCamera(v === '_all' ? '' : (v ?? ''))}>
              <SelectTrigger className="h-8 w-36 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All cameras</SelectItem>
                {distinctCameras.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {distinctLenses.length > 0 && (
            <Select value={filterLens || '_all'} onValueChange={(v) => setFilterLens(v === '_all' ? '' : (v ?? ''))}>
              <SelectTrigger className="h-8 w-36 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All lenses</SelectItem>
                {distinctLenses.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {(filterCamera || filterLens) && (
            <Button size="sm" variant="ghost" onClick={() => { setFilterCamera(''); setFilterLens(''); }}>
              Clear
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {visibleFiles.length} / {files.length} files
          </span>
        </div>
      )}

      <div className="grid-cards">
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
            const fallbackSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='120'%3E%3Crect fill='%2318181b' width='200' height='120'/%3E%3Ctext x='50%25' y='50%25' fill='%23666' text-anchor='middle' dy='.3em' font-size='14'%3E%F0%9F%8E%A5%3C/text%3E%3C/svg%3E`;
            return (
              <div
                key={file.id}
                className={`group relative overflow-hidden cursor-pointer rounded-lg border bg-card
                  transition-[transform,box-shadow,border-color] duration-200 ease-out will-change-transform
                  hover:-translate-y-0.5 hover:scale-[1.012] hover:border-primary/40
                  hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.3),0_8px_24px_rgba(0,0,0,0.4)]
                  active:translate-y-0 active:scale-[0.99] active:duration-75
                  ${isSelected ? 'border-primary/60 ring-1 ring-primary/40' : 'border-border'}`}
              >
                {canEdit() && (
                  <div className="absolute top-2 left-2 z-10">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(file.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-zinc-950/60 backdrop-blur-sm border-white/30"
                    />
                  </div>
                )}
                {canEdit() && (
                  <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 bg-zinc-950/60 backdrop-blur-sm hover:bg-zinc-950/80"
                      title="Source tags"
                      onClick={(e) => { e.stopPropagation(); setTagFiles(file); setTagPanelOpen(true); }}
                    >
                      <Tag className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
                <div className="aspect-video rounded-t-lg overflow-hidden bg-zinc-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/thumb?path=${encodeURIComponent(file.file_path)}&w=200`}
                    alt={getFileName(file.file_path)}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                    onClick={() => handleFilePlay(file.file_path, file.id)}
                    onError={(e) => { (e.target as HTMLImageElement).src = fallbackSvg; }}
                  />
                </div>
                <div className="px-3 py-2" onClick={() => handleFilePlay(file.file_path, file.id)}>
                  <div className="font-medium text-sm truncate">{getFileName(file.file_path)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {file.scan_status === 'done' && file.duration_seconds ? (
                      `${file.width}x${file.height} · ${Math.round(file.duration_seconds)}s`
                    ) : file.scan_status === 'pending' ? 'Scanning...' : 'Error scanning'}
                  </div>
                  {(file.camera || file.lens) && (
                    <div className="flex gap-1 flex-wrap mt-1">
                      {file.camera && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{file.camera}</Badge>}
                      {file.lens && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{file.lens}</Badge>}
                    </div>
                  )}
                </div>
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
