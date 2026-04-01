'use client';

import { useEffect, useState, useRef } from 'react';
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
import { motion } from 'framer-motion';

const gridContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const gridItem = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  show: {
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  },
};

interface ProjectViewProps {
  projectId: string;
}

// ── Inline SVG star ───────────────────────────────────────────────────────────
function StarIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
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

  // Per-file tag input state
  const [addingTagForFile, setAddingTagForFile] = useState<string | null>(null);
  const [tagInputValue, setTagInputValue] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [allDistinctTags, setAllDistinctTags] = useState<string[]>([]);
  const [expandedTagFileId, setExpandedTagFileId] = useState<string | null>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Per-file hover rating state (fileId -> hovered star index 1-5, or 0)
  const [hoverRating, setHoverRating] = useState<Record<string, number>>({});

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

  const handleFilePlay = (filePath: string, fileId: string, sourceRect?: DOMRect) => {
    startPlayback(filePath, 0, fileId, sourceRect);
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

  // ── Annotation helpers ────────────────────────────────────────────────────

  const openTagInput = async (fileId: string) => {
    setAddingTagForFile(fileId);
    setTagInputValue('');
    // Fetch distinct tags for autocomplete if not already loaded
    if (allDistinctTags.length === 0) {
      const res = await apiFetch('/api/files/tags');
      if (res.ok) {
        const tags: string[] = await res.json();
        setAllDistinctTags(tags);
        setTagSuggestions(tags);
      }
    } else {
      setTagSuggestions(allDistinctTags);
    }
    setTimeout(() => tagInputRef.current?.focus(), 50);
  };

  const handleTagInputChange = (value: string) => {
    setTagInputValue(value);
    const lower = value.toLowerCase();
    setTagSuggestions(
      lower ? allDistinctTags.filter((t) => t.toLowerCase().includes(lower)) : allDistinctTags
    );
  };

  const submitTag = async (fileId: string, tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    const file = files.find((f) => f.id === fileId);
    if (!file) return;
    if (file.tags.includes(trimmed)) {
      setAddingTagForFile(null);
      setTagInputValue('');
      return;
    }
    // Optimistic update
    setFiles((prev) => prev.map((f) => f.id === fileId ? { ...f, tags: [...f.tags, trimmed] } : f));
    setAddingTagForFile(null);
    setTagInputValue('');
    setAllDistinctTags((prev) => prev.includes(trimmed) ? prev : [...prev, trimmed].sort());

    const res = await apiFetch(`/api/files/${fileId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag: trimmed }),
    });
    if (!res.ok) {
      toast.error('Failed to add tag');
      setFiles((prev) => prev.map((f) => f.id === fileId ? { ...f, tags: f.tags.filter((t) => t !== trimmed) } : f));
    }
  };

  const removeTag = async (fileId: string, tag: string) => {
    // Optimistic update
    setFiles((prev) => prev.map((f) => f.id === fileId ? { ...f, tags: f.tags.filter((t) => t !== tag) } : f));
    const res = await apiFetch(`/api/files/${fileId}/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('Failed to remove tag');
      setFiles((prev) => prev.map((f) => f.id === fileId ? { ...f, tags: [...f.tags, tag] } : f));
    }
  };

  const setRating = async (fileId: string, rating: number | null) => {
    const prevRating = files.find((f) => f.id === fileId)?.rating ?? null;
    // Optimistic update
    setFiles((prev) => prev.map((f) => f.id === fileId ? { ...f, rating } : f));
    const res = await apiFetch(`/api/files/${fileId}/rating`, {
      method: 'PUT',
      body: JSON.stringify({ rating }),
    });
    if (!res.ok) {
      toast.error('Failed to save rating');
      setFiles((prev) => prev.map((f) => f.id === fileId ? { ...f, rating: prevRating } : f));
    }
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

      <motion.div key={`files-${files.length}`} className="grid-cards" variants={gridContainer} initial="hidden" animate="show">
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
            const tags = file.tags ?? [];
            const isExpanded = expandedTagFileId === file.id;
            const visibleTags = isExpanded ? tags : tags.slice(0, 4);
            const overflowCount = tags.length - 4;
            const currentRating = file.rating ?? 0;
            const hoveredStar = hoverRating[file.id] ?? 0;
            const displayRating = hoveredStar || currentRating;

            return (
              <motion.div key={file.id} variants={gridItem}>
              <div
                className={`group relative overflow-hidden cursor-pointer rounded-lg border bg-card
                  transition-[transform,box-shadow,border-color] duration-200 ease-out will-change-transform
                  hover:-translate-y-0.5 hover:scale-[1.012] hover:border-primary/40
                  hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.3),0_8px_24px_rgba(0,0,0,0.4)]
                  active:translate-y-0 active:scale-[0.99] active:duration-75
                  ${isSelected ? 'border-primary/60 ring-1 ring-primary/40' : 'border-border'}`}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('button,input,label')) return;
                  handleFilePlay(file.file_path, file.id, (e.currentTarget as HTMLElement).getBoundingClientRect());
                }}
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
                    onError={(e) => { (e.target as HTMLImageElement).src = fallbackSvg; }}
                  />
                </div>
                <div className="px-3 py-2">
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

                  {/* ── Tags ──────────────────────────────────────────────── */}
                  {(tags.length > 0 || canEdit()) && (
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap gap-1 items-center">
                        {visibleTags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0 text-[10px] rounded bg-amber-500/15 text-amber-300 border border-amber-500/25"
                          >
                            {tag}
                            {canEdit() && (
                              <button
                                className="ml-0.5 text-amber-400/60 hover:text-amber-300 leading-none"
                                onClick={() => removeTag(file.id, tag)}
                                title="Remove tag"
                              >
                                ×
                              </button>
                            )}
                          </span>
                        ))}
                        {!isExpanded && overflowCount > 0 && (
                          <button
                            className="text-[10px] text-zinc-400 hover:text-zinc-200 px-1.5 py-0 rounded border border-zinc-700 hover:border-zinc-500"
                            onClick={() => setExpandedTagFileId(file.id)}
                          >
                            +{overflowCount} more
                          </button>
                        )}
                        {isExpanded && tags.length > 4 && (
                          <button
                            className="text-[10px] text-zinc-400 hover:text-zinc-200 px-1.5 py-0 rounded border border-zinc-700 hover:border-zinc-500"
                            onClick={() => setExpandedTagFileId(null)}
                          >
                            less
                          </button>
                        )}
                        {canEdit() && addingTagForFile !== file.id && (
                          <button
                            className="text-[10px] text-zinc-500 hover:text-zinc-200 px-1.5 py-0 rounded border border-dashed border-zinc-700 hover:border-zinc-400"
                            onClick={() => openTagInput(file.id)}
                          >
                            + tag
                          </button>
                        )}
                      </div>

                      {/* Tag input with autocomplete */}
                      {canEdit() && addingTagForFile === file.id && (
                        <div className="relative mt-1">
                          <input
                            ref={tagInputRef}
                            type="text"
                            value={tagInputValue}
                            onChange={(e) => handleTagInputChange(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') submitTag(file.id, tagInputValue);
                              if (e.key === 'Escape') { setAddingTagForFile(null); setTagInputValue(''); }
                            }}
                            onBlur={() => {
                              // Small delay to allow suggestion click to register
                              setTimeout(() => { setAddingTagForFile(null); setTagInputValue(''); }, 150);
                            }}
                            placeholder="tag name…"
                            className="w-full h-6 px-1.5 text-[11px] bg-zinc-800 border border-zinc-600 rounded text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/50"
                          />
                          {tagSuggestions.length > 0 && tagInputValue && (
                            <div className="absolute z-20 top-full left-0 right-0 mt-0.5 bg-zinc-800 border border-zinc-600 rounded shadow-lg max-h-28 overflow-y-auto">
                              {tagSuggestions.map((s) => (
                                <button
                                  key={s}
                                  className="w-full text-left px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700"
                                  onMouseDown={(e) => { e.preventDefault(); submitTag(file.id, s); }}
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Star Rating ───────────────────────────────────────── */}
                  <div
                    className="flex items-center gap-0.5 mt-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        className={`w-4 h-4 transition-colors ${
                          canEdit()
                            ? 'cursor-pointer hover:scale-110'
                            : 'cursor-default'
                        } ${star <= displayRating ? 'text-amber-400' : 'text-zinc-600'}`}
                        onMouseEnter={() => canEdit() && setHoverRating((p) => ({ ...p, [file.id]: star }))}
                        onMouseLeave={() => canEdit() && setHoverRating((p) => ({ ...p, [file.id]: 0 }))}
                        onClick={() => {
                          if (!canEdit()) return;
                          const newRating = star === currentRating ? null : star;
                          setRating(file.id, newRating);
                        }}
                        title={canEdit() ? (star === currentRating ? 'Clear rating' : `Rate ${star}`) : `${currentRating || 0}/5`}
                      >
                        <StarIcon filled={star <= displayRating} className="w-full h-full" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              </motion.div>
            );
          })
        )}
      </motion.div>

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
