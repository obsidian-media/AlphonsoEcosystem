// Projects on the phone (phase 3 part A, owner 2026-11-02): the saved projects, Start a run, open the
// latest run on the Requests board (where its steps wait for approval), and a new project with the
// same intake as the computer's Projects page.
import React, { useEffect, useState } from 'react';
import { reasonOf, type MoreData } from '../../services/phone/remoteData';
import type { ProjectIntake } from '../../services/projects/projectStore';

const FIELDS: Array<{ key: Exclude<keyof ProjectIntake, 'priority'>; label: string; long?: boolean }> = [
  { key: 'name', label: 'Name' },
  { key: 'description', label: 'Description', long: true },
  { key: 'type', label: 'Type' },
  { key: 'stack', label: 'Stack' },
  { key: 'features', label: 'Features', long: true },
  { key: 'constraints', label: 'Constraints', long: true },
  { key: 'risks', label: 'Risks', long: true },
  { key: 'deadline', label: 'Deadline' },
];
const EMPTY_INTAKE: ProjectIntake = { name: '', description: '', stack: '', deadline: '', type: '', features: '', constraints: '', risks: '', priority: 'medium' };

function NewProjectForm({ more, onDone }: { more: MoreData; onDone: (message: string) => void }) {
  const [intake, setIntake] = useState<ProjectIntake>(EMPTY_INTAKE);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const r = await more.call('project.create', { intake });
      onDone(r.ok ? `Saved ${intake.name.trim()}.` : reasonOf(r));
    } finally { setBusy(false); }
  };
  return (
    <form className="space-y-2 pt-2 text-sm" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      {FIELDS.map((f) => (
        <label key={f.key} className="block">
          <span className="block text-xs text-(--text-2)">{f.label}</span>
          {f.long
            ? <textarea aria-label={f.label} value={intake[f.key]} onChange={(e) => setIntake({ ...intake, [f.key]: e.target.value })} rows={3} className="w-full rounded-lg bg-(--surface-2) px-3 py-2" />
            : <input aria-label={f.label} value={intake[f.key]} onChange={(e) => setIntake({ ...intake, [f.key]: e.target.value })} className="w-full rounded-lg bg-(--surface-2) px-3 py-2" />}
        </label>
      ))}
      <label className="block">
        <span className="block text-xs text-(--text-2)">Priority</span>
        <select aria-label="Priority" value={intake.priority} onChange={(e) => setIntake({ ...intake, priority: e.target.value as ProjectIntake['priority'] })} className="w-full rounded-lg bg-(--surface-2) px-3 py-2">
          <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
        </select>
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={busy || more.readOnly || !intake.name.trim() || !intake.description.trim()} className="min-h-11 flex-1 rounded-lg bg-(--accent) px-4 py-2 text-white">Save project</button>
        <button type="button" onClick={() => onDone('')} className="min-h-11 rounded-lg bg-(--surface-3) px-4 py-2">Cancel</button>
      </div>
    </form>
  );
}

export function ProjectsScreen({ more, onOpenRequest }: { more: MoreData; onOpenRequest: (requestId: string) => void }) {
  const [projects, setProjects] = useState(more.projects());
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => more.subscribe(() => setProjects(more.projects())), [more]);

  if (creating) return <NewProjectForm more={more} onDone={(m) => { setCreating(false); setMessage(m); }} />;

  const start = async (id: string) => {
    setBusy(id);
    try {
      const r = await more.call('project.start', { id });
      setMessage(r.ok ? 'Started: Jose is planning it. It shows on the Requests board.' : reasonOf(r));
    } finally { setBusy(null); }
  };
  return (
    <div className="space-y-3 pt-2 text-sm" data-testid="mobile-projects">
      {more.readOnly && more.readOnlyReason && <p className="text-xs text-(--text-3)">{more.readOnlyReason}</p>}
      {message && <p role="status" className="rounded-lg bg-(--surface-3) px-3 py-2 text-xs">{message}</p>}
      <button type="button" onClick={() => setCreating(true)} disabled={more.readOnly} className="rounded-lg bg-(--accent) px-4 py-2 text-white">New project</button>
      {projects.length === 0 && <p className="text-xs text-(--text-3)">No projects yet.</p>}
      <ul className="space-y-2">
        {projects.map((p) => (
          <li key={p.id} data-testid={`project-${p.id}`} className="space-y-2 rounded-xl bg-(--surface-2) p-3">
            <span className="block font-medium">{p.name}</span>
            {p.intake?.description && <span className="block text-xs text-(--text-2)">{p.intake.description}</span>}
            <div className="flex gap-2">
              <button type="button" disabled={more.readOnly || busy === p.id} onClick={() => void start(p.id)} className="min-h-11 flex-1 rounded-lg bg-(--accent) px-4 py-2 text-white">Start</button>
              {p.latestRequestId && <button type="button" onClick={() => onOpenRequest(p.latestRequestId as string)} className="min-h-11 flex-1 rounded-lg bg-(--surface-3) px-4 py-2">Open the latest run</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
