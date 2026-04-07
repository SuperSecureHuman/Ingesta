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
import { Library as LibraryIcon, Clapperboard } from 'lucide-react';
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

export default function HomeView({ onReady }: { onReady?: () => void }) {
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
      onReady?.();
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
        {!loading && libraries.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="rounded-full bg-zinc-800/50 p-4">
              <LibraryIcon className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No libraries</p>
              <p className="text-xs text-muted-foreground mt-0.5">Create a library to start organizing footage</p>
            </div>
            {isAdmin() && (
              <Button size="sm" variant="outline" onClick={() => openPanel('createLibrary')}>+ New Library</Button>
            )}
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
        {!loading && projects.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="rounded-full bg-zinc-800/50 p-4">
              <Clapperboard className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No projects</p>
              <p className="text-xs text-muted-foreground mt-0.5">Create a project to group files for review</p>
            </div>
            {canEdit() && (
              <Button size="sm" variant="outline" onClick={() => openPanel('createProject')}>+ New Project</Button>
            )}
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
