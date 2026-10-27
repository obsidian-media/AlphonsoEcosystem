// Work → Projects (agent roles Part C1): describe what to build, Start it, and follow the real
// Jose request: its plan, each step's work, what waits for you, and the result.
import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '../ui';
import { Tabs } from '../ui/Tabs';
import { JosePlanMap } from '../jose/JosePlanMap';
import { JoseStepOutput } from '../jose/JoseStepOutput';
import { getJoseRequest, type JoseRequest } from '../../services/jose/joseRequestStore';
import { closingSummary } from '../../services/jose/joseSummary';
import { agentName } from '../../services/jose/agentNames';
import { approveRequestStep, rejectRequestStep } from '../../services/joseExecutionEngineService';
import { listProjects, saveProject, startProject, deleteProject, type ProjectIntake, type SavedProject } from '../../services/projects/projectStore';

const EMPTY: ProjectIntake = { name: '', description: '', stack: '', deadline: '', type: 'web_app', features: '', constraints: '', risks: '', priority: 'medium' };
const FIELDS: Array<[keyof ProjectIntake, string, string]> = [
  ['name', 'Project name', 'Recipe box'],
  ['description', 'What it should do', 'A small web app to save and search recipes'],
  ['stack', 'Stack (optional)', 'React, SQLite'],
  ['features', 'Features (optional)', 'search, tags, import'],
  ['constraints', 'Must not (optional)', 'no paid services'],
  ['risks', 'Risks (optional)', ''],
  ['deadline', 'Deadline (optional)', ''],
];
const RUNNING = new Set(['running', 'waiting_plan_approval']);

export function ProjectsPage({ onOpenJoseBoard, settings }: { onOpenJoseBoard?: (requestId: string) => void; settings?: any }) {
  const [projects, setProjects] = useState<SavedProject[]>(() => listProjects());
  const [selectedId, setSelectedId] = useState<string | null>(() => listProjects()[0]?.id || null);
  const [intake, setIntake] = useState<ProjectIntake>(EMPTY);
  const [tab, setTab] = useState('plan');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState<JoseRequest | null>(null);

  const selected = projects.find((p) => p.id === selectedId) || null;
  // A string, so a re-render with a new projects array doesn't count as a new run.
  const latestRunId = selected?.runs[selected.runs.length - 1]?.requestId || '';

  const refresh = useCallback(() => {
    setRequest(latestRunId ? getJoseRequest(latestRunId) : null);
  }, [latestRunId]);
  const status = request?.status || '';
  useEffect(() => {
    refresh();
    if (!RUNNING.has(status)) return undefined;
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [refresh, status]);

  const waiting = (request?.steps || []).filter((s) => s.status === 'waiting_approval');
  const resultsLocked = !request || waiting.length > 0 || RUNNING.has(request.status);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const project = saveProject(intake, selectedId && selected?.name === intake.name ? selectedId : undefined);
      setSelectedId(project.id);
      // The run shows here as soon as Jose starts it, not only once it ends.
      const out = await startProject(project.id, {
        settings,
        onStarted: () => { setProjects(listProjects()); setMessage('Jose is working on it. Follow it here or on the board.'); },
      });
      setMessage(out.ok ? 'Jose is planning it. Follow it here or on the board.' : String(out.reason));
      setProjects(listProjects());
      if (out.ok && out.requestId) setRequest(getJoseRequest(out.requestId));
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => any) => {
    setBusy(true);
    try { const out = await fn(); setMessage(String(out?.summary || '')); } finally { setBusy(false); setProjects(listProjects()); refresh(); }
  };

  return (
    <div className="grid gap-4 p-4 md:grid-cols-[260px_1fr]">
      <div className="space-y-3">
        <form data-testid="projects-intake" className="space-y-2" onSubmit={(e) => { e.preventDefault(); void start(); }}>
          {FIELDS.map(([key, label, placeholder]) => (
            <label key={key} className="block text-xs text-(--text-2)">
              {label}
              <input aria-label={label} className="mt-1 w-full rounded-md bg-(--surface-2) px-2 py-1 text-(--text-1)" placeholder={placeholder} value={String(intake[key] || '')} onChange={(e) => setIntake({ ...intake, [key]: e.target.value })} />
            </label>
          ))}
          <label className="block text-xs text-(--text-2)">
            Priority
            <select aria-label="Priority" className="mt-1 w-full rounded-md bg-(--surface-2) px-2 py-1" value={intake.priority} onChange={(e) => setIntake({ ...intake, priority: e.target.value as ProjectIntake['priority'] })}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </label>
          <Button variant="primary" type="submit" data-testid="projects-start" disabled={busy}>Start</Button>
        </form>
        {message && <p className="text-xs text-(--text-2)">{message}</p>}
        <ul data-testid="projects-list" className="space-y-1">
          {projects.length === 0 && <li className="text-xs text-(--text-3)">No projects yet.</li>}
          {projects.map((p) => (
            <li key={p.id} className="flex items-center gap-1">
              <button type="button" onClick={() => { setSelectedId(p.id); setIntake(p.intake); setTab('plan'); }} className={`flex-1 truncate rounded-md px-2 py-1 text-left text-xs ${p.id === selectedId ? 'bg-(--surface-3)' : 'bg-(--surface-2)'}`}>
                {p.name} · {p.runs.length} {p.runs.length === 1 ? 'run' : 'runs'}
              </button>
              <Button variant="ghost" onClick={() => { deleteProject(p.id); setProjects(listProjects()); if (p.id === selectedId) setSelectedId(null); }}>Delete</Button>
            </li>
          ))}
        </ul>
      </div>

      <div className="min-w-0 space-y-3">
        {!request && <p className="text-sm text-(--text-3)">{selected ? 'This project has not been started yet.' : 'Describe a project and press Start. Jose plans it from the Build an app template and the agents do the work.'}</p>}
        {request && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold text-(--text-1)">{selected?.name}</div>
              <div className="text-xs text-(--text-3)">{request.status.replace(/_/g, ' ')}</div>
              {onOpenJoseBoard && <Button variant="ghost" onClick={() => onOpenJoseBoard(request.id)}>Open on the board</Button>}
            </div>
            <Tabs
              tabs={[
                { id: 'plan', label: 'Plan' },
                { id: 'steps', label: 'Steps' },
                { id: 'approval', label: waiting.length ? `Approval (${waiting.length})` : 'Approval' },
                { id: 'results', label: 'Results', disabled: resultsLocked },
              ]}
              activeId={tab}
              onChange={setTab}
            />
            {tab === 'plan' && <JosePlanMap steps={request.steps} />}
            {tab === 'steps' && (
              <ul data-testid="projects-steps" className="space-y-2">
                {request.steps.map((s) => (
                  <li key={s.stepId} className="rounded-xl bg-(--surface-2) p-3 text-xs">
                    <div className="font-semibold text-(--text-1)">{agentName(s.agent)} · {s.status.replace(/_/g, ' ')}</div>
                    {s.instruction && <div className="text-(--text-2)">{s.instruction}</div>}
                    {s.error && <div className="text-(--warning)">{s.error}</div>}
                    {s.status === 'done' && <JoseStepOutput commandId={request.commandId} stepId={s.stepId} />}
                  </li>
                ))}
              </ul>
            )}
            {tab === 'approval' && (
              <div data-testid="projects-approval" className="space-y-2">
                {waiting.length === 0 && <p className="text-xs text-(--text-3)">Nothing is waiting for you.</p>}
                {waiting.map((s) => (
                  <div key={s.stepId} className="flex flex-wrap items-center gap-2 rounded-xl bg-(--surface-2) p-3 text-xs">
                    <span className="flex-1 text-(--text-1)">{agentName(s.agent)}: {s.instruction || s.actionType}</span>
                    <Button variant="primary" disabled={busy} onClick={() => act(() => approveRequestStep(request.id, s.stepId))}>Approve and carry on</Button>
                    <Button variant="ghost" disabled={busy} onClick={() => act(() => rejectRequestStep(request.id, s.stepId))}>Reject</Button>
                  </div>
                ))}
              </div>
            )}
            {tab === 'results' && !resultsLocked && (
              <pre data-testid="projects-results" className="whitespace-pre-wrap rounded-xl bg-(--surface-2) p-3 text-xs text-(--text-1)">{closingSummary(request)}</pre>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default ProjectsPage;
