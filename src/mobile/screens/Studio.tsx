import React, { useEffect, useState } from 'react';
import type { StudioData } from '../../services/phone/remoteData';
import type { PhoneProject } from '../../services/phone/contentMirror';
import type { PhoneLock } from '../MobileApp';
import { STEP_ORDER } from '../../services/contentFactory/contentTypes';
import { STEP_LABELS, STATUS_TEXT } from '../../components/miya/stepWords';
import { StudioProject } from './StudioProject';
import { NewProject } from './NewProject';

/** The first step waiting for you, else the one running. */
function whereItIs(p: PhoneProject): { line: string; waiting: boolean } {
  const steps = STEP_ORDER.filter((id) => p.steps?.[id]);
  const waiting = steps.find((id) => p.steps[id].status === 'needs_approval');
  if (waiting) return { line: `${STEP_LABELS[waiting]}: ${STATUS_TEXT.needs_approval}`, waiting: true };
  const running = steps.find((id) => p.steps[id].status === 'running');
  if (running) return { line: `${STEP_LABELS[running]}: ${STATUS_TEXT.running}`, waiting: false };
  return { line: '', waiting: false };
}

/** Miya Studio on the phone (phase 2): projects, the one waiting for you first. */
export function StudioScreen({ studio, lock, openProjectId }: { studio: StudioData; lock: PhoneLock; openProjectId?: string }) {
  const [projects, setProjects] = useState(studio.projects());
  const [openId, setOpenId] = useState<string | null>(openProjectId || null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => studio.subscribe(() => setProjects(studio.projects())), [studio]);

  const open = projects.find((p) => p.id === openId);
  if (open) return <StudioProject key={open.id} studio={studio} project={open} lock={lock} onBack={() => setOpenId(null)} />;
  if (creating) return <NewProject studio={studio} onDone={(m) => { setCreating(false); setMessage(m); }} />;

  const brands = new Map(studio.brands().map((b) => [b.id, b.name]));
  const rows = projects.map((p) => ({ p, ...whereItIs(p) }))
    .sort((a, b) => Number(b.waiting) - Number(a.waiting) || b.p.updatedAtMs - a.p.updatedAtMs);
  return (
    <div className="space-y-3 pt-2 text-sm" data-testid="mobile-studio">
      {message && <p role="status" className="rounded-lg bg-(--surface-3) px-3 py-2 text-xs">{message}</p>}
      <button type="button" onClick={() => setCreating(true)} disabled={studio.readOnly} className="rounded-lg bg-(--accent) px-4 py-2 text-white">New project</button>
      {rows.length === 0 && <p className="text-xs text-(--text-3)">No projects yet.</p>}
      <ul className="space-y-2">
        {rows.map(({ p, line, waiting }) => (
          <li key={p.id} data-testid={`studio-project-${p.id}`}>
            <button type="button" onClick={() => setOpenId(p.id)} className={`w-full rounded-xl p-3 text-left ${waiting ? 'bg-(--accent-dim)' : 'bg-(--surface-2)'}`}>
              <span className="block font-medium">{p.name}</span>
              <span className="block text-xs text-(--text-2)">{brands.get(p.brandId) || ''}{line ? ` · ${line}` : ''}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
