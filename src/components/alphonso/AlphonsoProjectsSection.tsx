import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FolderOpen, Trash2 } from 'lucide-react';
import { listProjects, saveProjects, type AlphonsoProject } from '../../services/alphonso/projects';
import { listInstalledModels } from '../../services/jose/joseModels';
import { SmallModelNotice } from '../SmallModelNotice';

interface Props {
  settings: Record<string, any>;
  setSettings: (patch: Record<string, any>) => void;
}

const field = 'w-full rounded-lg bg-(--surface-1) px-3 py-2 text-xs text-(--text-1) focus:outline-hidden focus:ring-1 focus:ring-(--accent-border)';

/** Settings → Agents (agent phase 6): the projects Alphonso works in, and the model for his code. */
export function AlphonsoProjectsSection({ settings, setSettings }: Props): React.JSX.Element {
  const [projects, setProjects] = useState<AlphonsoProject[]>(() => listProjects());
  const [name, setName] = useState('');
  const [folder, setFolder] = useState('');
  const [problem, setProblem] = useState('');
  const [models, setModels] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    listInstalledModels().then((list) => { if (live) setModels(list); }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  const store = (list: AlphonsoProject[]) => {
    const saved = saveProjects(list);
    if (saved.ok === false) { setProblem(saved.reason); return false; }
    setProblem('');
    setProjects(listProjects());
    return true;
  };

  const browse = async () => {
    try {
      const result = await invoke<{ picked: boolean; path: string }>('pick_folder');
      if (result?.picked && result.path) setFolder(result.path);
    } catch { /* type the folder instead */ }
  };

  const add = () => {
    if (store([...projects, { name, folder }])) { setName(''); setFolder(''); }
  };

  return (
    <div className="space-y-3 p-4 bg-(--surface-2) rounded-2xl">
      <div>
        <div className="text-sm font-semibold text-(--text-1)">Alphonso's projects</div>
        <div className="text-[11px] text-(--text-3) mt-0.5">Alphonso works in one of these at a time. A request that names a project works there.</div>
      </div>
      {projects.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-2 text-xs text-(--text-2)">
          <span><strong className="text-(--text-1)">{p.name}</strong> <span className="font-mono text-(--text-3)">{p.folder}</span></span>
          <button aria-label={`Remove ${p.name}`} onClick={() => store(projects.filter((x) => x.name !== p.name))} className="text-(--text-3) hover:text-(--error)">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto_auto]">
        <input aria-label="Project name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
        <input aria-label="Project folder" placeholder="Folder" value={folder} onChange={(e) => setFolder(e.target.value)} className={`${field} font-mono`} />
        <button aria-label="Browse for the project folder" onClick={browse} className="rounded-lg bg-(--surface-1) px-2 text-(--text-3) hover:text-(--text-1)">
          <FolderOpen className="h-3.5 w-3.5" />
        </button>
        <button onClick={add} className="rounded-lg bg-(--accent-dim) px-3 py-2 text-xs font-semibold text-(--accent)">Add project</button>
      </div>
      {problem && <div className="text-[11px] text-(--error)">{problem}</div>}
      <div className="flex items-center justify-between gap-3 pt-2">
        <label htmlFor="alphonso-code-model" className="text-xs font-semibold text-(--text-1)">Model for Alphonso's code</label>
        <select
          id="alphonso-code-model"
          value={String(settings.alphonsoCodeModel || '')}
          onChange={(e) => setSettings({ alphonsoCodeModel: e.target.value })}
          className="rounded-md bg-(--surface-1) px-2 py-1 text-xs text-(--text-1)"
        >
          <option value="">Same as Alphonso</option>
          {models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <SmallModelNotice model={String(settings.alphonsoCodeModel || settings.selectedModel || '')} />
    </div>
  );
}
