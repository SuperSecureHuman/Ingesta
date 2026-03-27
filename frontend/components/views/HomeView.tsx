'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Library, Project } from '@/lib/types';
import { useToast } from '@/context/ToastContext';
import { useAppContext } from '@/context/AppContext';
import { usePanels } from '@/hooks/usePanels';
import LibraryCard from '@/components/cards/LibraryCard';
import ProjectCard from '@/components/cards/ProjectCard';
import Spinner from '@/components/ui/Spinner';
import CreateLibraryPanel from '@/components/panels/CreateLibraryPanel';
import CreateProjectPanel from '@/components/panels/CreateProjectPanel';

export default function HomeView() {
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const { setCurrentView, setCurrentLibraryId, setCurrentProjectId } = useAppContext();
  const { activePanel, openPanel, closePanel } = usePanels();

  useEffect(() => {
    loadData();
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
      showToast(`Failed to load: ${e}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectLibrary = (libId: string) => {
    setCurrentLibraryId(libId);
    setCurrentProjectId(null);
    setCurrentView('library');
  };

  const handleSelectProject = (projId: string) => {
    setCurrentProjectId(projId);
    setCurrentLibraryId(null);
    setCurrentView('project');
  };

  const handleDeleteLibrary = async (libId: string) => {
    try {
      const res = await apiFetch(`/api/libraries/${libId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Library deleted', 'success');
        await loadData();
      } else {
        showToast('Failed to delete library', 'error');
      }
    } catch (e) {
      showToast(`Error: ${e}`, 'error');
    }
  };

  const handleDeleteProject = async (projId: string) => {
    try {
      const res = await apiFetch(`/api/projects/${projId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Project deleted', 'success');
        await loadData();
      } else {
        showToast('Failed to delete project', 'error');
      }
    } catch (e) {
      showToast(`Error: ${e}`, 'error');
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
      <div className="section-header">
        <h2>Libraries</h2>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => openPanel('createLibrary')}
        >
          + New Library
        </button>
      </div>
      <div className="grid">
        {libraries.length === 0 ? (
          <div style={{ gridColumn: '1/-1', color: '#666', padding: '20px' }}>
            No libraries yet. Create one to get started.
          </div>
        ) : (
          libraries.map((lib) => (
            <LibraryCard
              key={lib.id}
              library={lib}
              onSelect={() => handleSelectLibrary(lib.id)}
              onDelete={handleDeleteLibrary}
            />
          ))
        )}
      </div>

      <div className="section-header">
        <h2>Projects</h2>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => openPanel('createProject')}
        >
          + New Project
        </button>
      </div>
      <div className="grid">
        {projects.length === 0 ? (
          <div style={{ gridColumn: '1/-1', color: '#666', padding: '20px' }}>
            No projects yet. Create one to get started.
          </div>
        ) : (
          projects.map((proj) => (
            <ProjectCard
              key={proj.id}
              project={proj}
              onSelect={() => handleSelectProject(proj.id)}
              onDelete={handleDeleteProject}
            />
          ))
        )}
      </div>

      <CreateLibraryPanel
        isOpen={activePanel === 'createLibrary'}
        onClose={closePanel}
        onSuccess={() => {
          closePanel();
          loadData();
        }}
      />

      <CreateProjectPanel
        isOpen={activePanel === 'createProject'}
        onClose={closePanel}
        onSuccess={() => {
          closePanel();
          loadData();
        }}
      />
    </div>
  );
}
