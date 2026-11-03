// Teams on the phone (phase 3 part B, owner 2026-11-02): see each saved team's steps and run one with a
// job typed here. Building and editing teams stays on the computer.
import React, { useEffect, useState } from 'react';
import { reasonOf, type MoreData } from '../../services/phone/remoteData';
import { agentName } from '../../services/jose/agentNames';

export function TeamsScreen({ more, onOpenRequest }: { more: MoreData; onOpenRequest: (requestId: string) => void }) {
  const [teams, setTeams] = useState(more.teams());
  const [jobs, setJobs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [started, setStarted] = useState<string | null>(null);
  useEffect(() => more.subscribe(() => setTeams(more.teams())), [more]);

  const run = async (id: string) => {
    setBusy(id);
    setStarted(null);
    try {
      const r = await more.call('team.run', { id, text: (jobs[id] || '').trim() });
      if (r.ok) {
        setMessage('Started: it shows on the Requests board.');
        setStarted(typeof r.value?.requestId === 'string' ? r.value.requestId : null);
      } else setMessage(reasonOf(r));
    } finally { setBusy(null); }
  };
  return (
    <div className="space-y-3 pt-2 text-sm" data-testid="mobile-teams">
      {more.readOnly && more.readOnlyReason && <p className="text-xs text-(--text-3)">{more.readOnlyReason}</p>}
      {message && (
        <div role="status" className="flex items-center justify-between gap-2 rounded-lg bg-(--surface-3) px-3 py-2 text-xs">
          <span>{message}</span>
          {started && <button type="button" onClick={() => onOpenRequest(started)} className="text-(--accent)">Open on the board</button>}
        </div>
      )}
      {teams.length === 0 && <p className="text-xs text-(--text-3)">No teams yet. Build one on your computer (System → Teams).</p>}
      <ul className="space-y-2">
        {teams.map((t) => (
          <li key={t.id} className="space-y-2 rounded-xl bg-(--surface-2) p-3">
            <span className="block font-medium">{t.name}</span>
            <ol className="list-decimal space-y-0.5 pl-5 text-xs text-(--text-2)">
              {t.steps.map((s) => <li key={s.stepId}>{`${agentName(s.agent)}: ${s.actionType}`}</li>)}
            </ol>
            {t.problems.map((p) => <p key={p} className="text-xs text-(--warning)">{p}</p>)}
            <input aria-label={`Job for ${t.name}`} value={jobs[t.id] || ''} onChange={(e) => setJobs({ ...jobs, [t.id]: e.target.value })} placeholder="What should the team do?" className="w-full rounded-lg bg-(--surface-1) px-3 py-2" />
            <button type="button" aria-label={`Run ${t.name}`} onClick={() => void run(t.id)} disabled={more.readOnly || busy !== null || t.problems.length > 0 || !(jobs[t.id] || '').trim()} className="min-h-11 rounded-lg bg-(--accent) px-4 py-2 text-white disabled:opacity-50">Run</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
