// Build or edit a team (agent roles Part C1): a name, the job, and the agents in order. Each agent
// is offered only the work it owns; each step needs the one before unless you untick it.
import React, { useMemo, useState } from 'react';
import { Button } from '../ui';
import { AGENT_PERMISSION_TABLE } from '../../services/jose/agentPermissionTable';
import { taskTypesFor } from '../../services/jose/taskTypeMeanings';
import { agentName } from '../../services/jose/agentNames';
import { saveTeam, teamSteps, templateProblems, type TeamMember } from '../../services/jose/teams';

// Jose plans and routes; he has no step of his own in a team.
const AGENTS = Object.keys(AGENT_PERMISSION_TABLE).filter((a) => a !== 'jose' && taskTypesFor(a).length > 0);

export interface BuilderRow { agent: string; actionType: string; instruction: string; needsPrevious: boolean }

export function rowsToMembers(rows: BuilderRow[]): TeamMember[] {
  const ids = teamSteps(rows.map((r) => ({ agent: r.agent, actionType: r.actionType, instruction: '', needs: [] }))).map((s) => s.stepId);
  return rows.map((r, i) => ({ agent: r.agent, actionType: r.actionType, instruction: r.instruction, needs: r.needsPrevious && i > 0 ? [ids[i - 1]] : [] }));
}

export function TeamBuilder({ initial, editId, onSaved, onCancel }: {
  initial?: { name: string; job: string; rows: BuilderRow[] };
  editId?: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [job, setJob] = useState(initial?.job || '');
  const [rows, setRows] = useState<BuilderRow[]>(initial?.rows || []);
  const problems = useMemo(() => {
    const p = rows.length ? templateProblems({ steps: teamSteps(rowsToMembers(rows)) }) : ['Add at least one agent.'];
    return name.trim() ? p : ['Give the team a name.', ...p];
  }, [name, rows]);

  const addAgent = (agent: string) => {
    if (!agent) return;
    setRows([...rows, { agent, actionType: taskTypesFor(agent)[0]?.type || '', instruction: '', needsPrevious: rows.length > 0 }]);
  };
  const change = (i: number, patch: Partial<BuilderRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  };

  const save = () => {
    const out = saveTeam({ name, job, members: rowsToMembers(rows) }, editId);
    if (out.ok) onSaved();
  };

  return (
    <div data-testid="team-builder" className="space-y-3 rounded-xl bg-(--surface-2) p-3 text-xs">
      <label className="block text-(--text-2)">Team name
        <input aria-label="Team name" className="mt-1 w-full rounded-md bg-(--surface-3) px-2 py-1 text-(--text-1)" value={name} onChange={(e) => setName(e.target.value)} placeholder="Launch" />
      </label>
      <label className="block text-(--text-2)">The job
        <input aria-label="The job" className="mt-1 w-full rounded-md bg-(--surface-3) px-2 py-1 text-(--text-1)" value={job} onChange={(e) => setJob(e.target.value)} placeholder="Research a topic and write a short post" />
      </label>
      <ol className="space-y-2">
        {rows.map((r, i) => (
          <li key={i} className="space-y-1 rounded-lg bg-(--surface-3) p-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-(--text-1)">{i + 1}. {agentName(r.agent)}</span>
              <select aria-label={`Work for ${agentName(r.agent)}`} className="rounded-md bg-(--surface-2) px-2 py-1" value={r.actionType} onChange={(e) => change(i, { actionType: e.target.value })}>
                {taskTypesFor(r.agent).map((t) => <option key={t.type} value={t.type}>{t.meaning}</option>)}
              </select>
              <Button variant="ghost" onClick={() => move(i, -1)} aria-label="Move up">‹</Button>
              <Button variant="ghost" onClick={() => move(i, 1)} aria-label="Move down">›</Button>
              <Button variant="ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</Button>
            </div>
            <input aria-label={`What ${agentName(r.agent)} does`} className="w-full rounded-md bg-(--surface-2) px-2 py-1 text-(--text-1)" value={r.instruction} onChange={(e) => change(i, { instruction: e.target.value })} placeholder="What this agent should do" />
            {i > 0 && (
              <label className="flex items-center gap-2 text-(--text-3)">
                <input type="checkbox" checked={r.needsPrevious} onChange={(e) => change(i, { needsPrevious: e.target.checked })} />
                Starts after {agentName(rows[i - 1].agent)}
              </label>
            )}
          </li>
        ))}
      </ol>
      <label className="block text-(--text-2)">Add an agent
        <select aria-label="Add an agent" className="mt-1 w-full rounded-md bg-(--surface-3) px-2 py-1" value="" onChange={(e) => addAgent(e.target.value)}>
          <option value="">Choose…</option>
          {AGENTS.map((a) => <option key={a} value={a}>{agentName(a)}</option>)}
        </select>
      </label>
      {problems.length > 0 && <ul className="space-y-0.5 text-(--warning)">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      <div className="flex gap-2">
        <Button variant="primary" disabled={problems.length > 0} onClick={save}>Save team</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
