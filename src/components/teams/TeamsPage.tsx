// Teams (agent roles Part C1): every saved template (teams and "Save as template" plans) with its
// problems, Run, Edit and Delete; the team builder; and each old Agent Pairing pair offered once.
import React, { useState } from 'react';
import { Button } from '../ui';
import { TeamBuilder, type BuilderRow } from './TeamBuilder';
import { listUserTemplates, deleteUserTemplate } from '../../services/jose/joseUserTemplates';
import type { JoseTemplate } from '../../services/jose/joseTemplates';
import { agentName } from '../../services/jose/agentNames';
import { taskTypesFor } from '../../services/jose/taskTypeMeanings';
import { dismissOldPair, oldPairOffers, runTeam, takeOldPair, templateProblems } from '../../services/jose/teams';

function rowsFor(template: JoseTemplate): BuilderRow[] {
  return template.steps.map((s, i) => ({
    agent: s.agent,
    actionType: s.actionType,
    instruction: s.instruction || '',
    needsPrevious: i > 0 && (s.needs || []).includes(template.steps[i - 1].stepId),
  }));
}

export function TeamsPage({ onOpenJoseBoard }: { onOpenJoseBoard?: (requestId: string) => void }) {
  const [templates, setTemplates] = useState<JoseTemplate[]>(() => listUserTemplates());
  const [offers, setOffers] = useState(() => oldPairOffers());
  const [builder, setBuilder] = useState<null | { initial?: { name: string; job: string; rows: BuilderRow[] }; editId?: string }>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runText, setRunText] = useState('');
  const [message, setMessage] = useState<{ text: string; requestId?: string } | null>(null);

  const refresh = () => { setTemplates(listUserTemplates()); setOffers(oldPairOffers()); };

  const run = async (template: JoseTemplate) => {
    const out: any = await runTeam(template.id, runText, { source: 'user' });
    if (out?.ok === false) setMessage({ text: String(out.problems?.join(' ') || out.reason || 'The team could not run.') });
    else {
      setMessage({ text: `${template.name} is working on it.`, requestId: out?.requestId || undefined });
      setRunningId(null);
      setRunText('');
    }
  };

  return (
    <div data-testid="teams-page" className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-(--text-1)">Teams</h2>
        <span className="text-xs text-(--text-3)">A team gives each agent only work it owns. Run one here, or in Chat with "use team Name to …".</span>
        <Button data-testid="teams-new" variant="primary" onClick={() => setBuilder({})}>New team</Button>
      </div>

      {offers.map((o) => (
        <div key={o.id} data-testid={`old-pair-${o.id}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-(--surface-2) p-3 text-xs">
          <span className="flex-1 text-(--text-2)">
            An old pair: {agentName(o.agents[0])} and {agentName(o.agents[1])}{o.job ? `, for "${o.job}"` : ''}. Pairs did nothing; a team runs.
          </span>
          <Button onClick={() => {
            const offer = takeOldPair(o.id);
            if (offer) setBuilder({ initial: { name: '', job: offer.job, rows: offer.agents.map((a, i) => ({ agent: a, actionType: taskTypesFor(a)[0]?.type || '', instruction: offer.note, needsPrevious: i > 0 })) } });
            refresh();
          }}>Make this a team</Button>
          <Button variant="ghost" onClick={() => { dismissOldPair(o.id); refresh(); }}>Dismiss</Button>
        </div>
      ))}

      {builder && (
        <TeamBuilder initial={builder.initial} editId={builder.editId} onSaved={() => { setBuilder(null); refresh(); }} onCancel={() => setBuilder(null)} />
      )}

      {message && (
        <div className="flex items-center gap-2 text-xs text-(--text-2)">
          <span>{message.text}</span>
          {message.requestId && onOpenJoseBoard && <Button variant="ghost" onClick={() => onOpenJoseBoard(message.requestId!)}>Open on the board</Button>}
        </div>
      )}

      <ul data-testid="teams-templates" className="space-y-2">
        {templates.length === 0 && <li className="text-xs text-(--text-3)">No teams or saved templates yet.</li>}
        {templates.map((t) => {
          const problems = templateProblems(t);
          return (
            <li key={t.id} className="space-y-2 rounded-xl bg-(--surface-2) p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-(--text-1)">{t.name}</span>
                <span className="flex-1 text-(--text-3)">{t.steps.map((s) => agentName(s.agent)).join(' → ') || 'No steps'}</span>
                <Button data-testid={`team-run-${t.id}`} disabled={problems.length > 0} onClick={() => { setRunningId(t.id); setMessage(null); }}>Run</Button>
                <Button variant="ghost" onClick={() => setBuilder({ initial: { name: t.name, job: '', rows: rowsFor(t) }, editId: t.id })}>Edit</Button>
                <Button data-testid={`team-delete-${t.id}`} variant="ghost" onClick={() => { if (window.confirm(`Delete ${t.name}?`)) { deleteUserTemplate(t.id); refresh(); } }}>Delete</Button>
              </div>
              {problems.length > 0 && (
                <ul data-testid={`team-problems-${t.id}`} className="text-(--warning)">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
              )}
              {runningId === t.id && (
                <div className="flex gap-2">
                  <input aria-label="What should the team do?" className="flex-1 rounded-md bg-(--surface-3) px-2 py-1 text-(--text-1)" value={runText} onChange={(e) => setRunText(e.target.value)} placeholder="Write two lines about tea" />
                  <Button variant="primary" onClick={() => void run(t)}>Run team</Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default TeamsPage;
