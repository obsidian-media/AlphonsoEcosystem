import React, { useState } from 'react';
import { Button } from '../ui';
import type { ContentBrand, ContentProject } from '../../services/contentFactory/contentTypes';

export interface ContentProjectBarProps {
  brands: ContentBrand[];
  brandId: string;
  onBrand(id: string): void;
  projects: ContentProject[];
  projectId: string | null;
  onProject(id: string): void;
  onNewProject(name: string): void;
  outputRoot: string;
}

/** Brand, project, and where the files go. */
export function ContentProjectBar({ brands, brandId, onBrand, projects, projectId, onProject, onNewProject, outputRoot }: ContentProjectBarProps) {
  const [name, setName] = useState('');
  const field = 'rounded-lg bg-(--surface-2) px-2 py-1 text-[12px] text-(--text-1)';
  const brand = brands.find((b) => b.id === brandId);
  return (
    <section className="rounded-2xl bg-(--surface-1) p-3 space-y-2" aria-label="Project">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[11px] text-(--text-3)">
          Brand
          <select aria-label="Brand" className={`${field} block mt-1`} value={brandId} onChange={(e) => onBrand(e.target.value)}>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-(--text-3)">
          Project
          <select aria-label="Project" className={`${field} block mt-1`} value={projectId || ''} onChange={(e) => onProject(e.target.value)} disabled={projects.length === 0}>
            {projects.length === 0 && <option value="">No projects yet</option>}
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-(--text-3)">
          New project
          <input aria-label="New project name" className={`${field} block mt-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        </label>
        <Button size="sm" disabled={!name.trim()} onClick={() => { onNewProject(name.trim()); setName(''); }}>Create</Button>
      </div>
      {outputRoot ? (
        <div className="text-[11px] text-(--text-3)">Files: {outputRoot}\{brand?.folderName || '…'}\{projects.find((p) => p.id === projectId)?.folderName || '…'}</div>
      ) : (
        <div className="rounded-xl bg-(--warning-dim) px-3 py-2 text-[12px] text-(--warning)">Choose an output folder in Settings first. Every project is saved in a folder per brand inside it.</div>
      )}
    </section>
  );
}
