'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { Library } from '@/lib/types';
import { slugify } from '@/lib/utils';
import { toast } from 'sonner';
import { useAppContext } from '@/context/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { usePanels } from '@/hooks/usePanels';
import LibraryCard from '@/components/cards/LibraryCard';
import ProjectCard from '@/components/cards/ProjectCard';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CreateLibraryPanel from '@/components/panels/CreateLibraryPanel';
import CreateProjectPanel from '@/components/panels/CreateProjectPanel';
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

export default function HomeView() {
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { setProjects, projects } = useAppContext();
  const { activePanel, openPanel, closePanel } = usePanels();
  const { isAdmin, canEdit } = useAuth();

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [libRes, projRes] = await Promise.all([
        apiFetch('/api/libraries'),
        apiFetch('/api/projects'),
      ]);

      if (!libRes.ok || !projRes.ok) throw new Error('Failed to load');

      const libData = await libRes.json();
      const projData = await projRes.json();

      setLibraries(libData.libraries || []);
      setProjects(projData.projects || []);
    } catch (e) {
      toast.error(`Failed to load: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectLibrary = (lib: Library) => {
    router.push(`/library/${slugify(lib.name)}`);
  };

  const handleSelectProject = (projId: string) => {
    router.push(`/project/${projId}`);
  };

  const handleDeleteLibrary = async (libId: string) => {
    try {
      const res = await apiFetch(`/api/libraries/${libId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Library deleted');
        await loadData();
      } else {
        toast.error('Failed to delete library');
      }
    } catch (e) {
      toast.error(`Error: ${e}`);
    }
  };

  const handleDeleteProject = async (projId: string) => {
    try {
      const res = await apiFetch(`/api/projects/${projId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Project deleted');
        await loadData();
      } else {
        toast.error('Failed to delete project');
      }
    } catch (e) {
      toast.error(`Error: ${e}`);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Libraries</h2>
        {isAdmin() && (
          <Button size="sm" onClick={() => openPanel('createLibrary')}>
            + New Library
          </Button>
        )}
      </div>
      <motion.div key={`libs-${libraries.length}`} className="grid-cards" variants={gridContainer} initial="hidden" animate="show">
        {libraries.length === 0 ? (
          <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'center', padding: '40px', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📁</div>
              <p style={{ color: 'var(--color-muted)', marginBottom: '8px' }}>No libraries yet</p>
              <p style={{ fontSize: '13px', color: 'var(--color-muted)' }}>Create a new library to start organizing your media</p>
            </div>
          </div>
        ) : (
          libraries.map((lib) => (
            <motion.div key={lib.id} variants={gridItem}>
              <LibraryCard
                library={lib}
                onSelect={() => handleSelectLibrary(lib)}
                onDelete={isAdmin() ? handleDeleteLibrary : undefined}
              />
            </motion.div>
          ))
        )}
      </motion.div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Projects</h2>
        {canEdit() && (
          <Button size="sm" onClick={() => openPanel('createProject')}>
            + New Project
          </Button>
        )}
      </div>
      <motion.div key={`projs-${projects.length}`} className="grid-cards" variants={gridContainer} initial="hidden" animate="show">
        {projects.length === 0 ? (
          <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'center', padding: '40px', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎬</div>
              <p style={{ color: 'var(--color-muted)', marginBottom: '8px' }}>No projects yet</p>
              <p style={{ fontSize: '13px', color: 'var(--color-muted)' }}>Create a new project to start editing</p>
            </div>
          </div>
        ) : (
          projects.map((proj) => (
            <motion.div key={proj.id} variants={gridItem}>
              <ProjectCard
                project={proj}
                onSelect={() => handleSelectProject(proj.id)}
                onDelete={canEdit() ? handleDeleteProject : undefined}
              />
            </motion.div>
          ))
        )}
      </motion.div>

      {isAdmin() && (
        <CreateLibraryPanel
          isOpen={activePanel === 'createLibrary'}
          onClose={closePanel}
          onSuccess={() => {
            closePanel();
            loadData();
          }}
        />
      )}

      {canEdit() && (
        <CreateProjectPanel
          isOpen={activePanel === 'createProject'}
          onClose={closePanel}
          onSuccess={() => {
            closePanel();
            loadData();
          }}
        />
      )}
    </div>
  );
}
