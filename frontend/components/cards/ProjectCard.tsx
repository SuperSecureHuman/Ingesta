'use client';

import { Project } from '@/lib/types';
import { Film } from 'lucide-react';
import EntityCard from './EntityCard';

interface ProjectCardProps {
  project: Project;
  onSelect?: () => void;
  onDelete?: (projId: string) => void;
}

export default function ProjectCard({ project, onSelect, onDelete }: ProjectCardProps) {
  return (
    <EntityCard
      id={project.id}
      name={project.name}
      confirmMessage={`Delete "${project.name}"?`}
      gradientPos="40% 60%"
      icon={<Film className="relative h-10 w-10 text-amber-500/35 drop-shadow-[0_0_6px_rgba(245,158,11,0.25)]" />}
      infoRows={<div className="text-xs text-muted-foreground mt-0.5">{new Date(project.created_at).toLocaleDateString()}</div>}
      onSelect={onSelect}
      onDelete={onDelete}
    />
  );
}
