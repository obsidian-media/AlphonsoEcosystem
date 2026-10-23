// The live board (owner: Q13, Q21; phase 3): every Jose request, and for the
// selected one its plan as a map, how it was planned, its change log, and the
// actions its state allows. A waiting plan can be run, edited or cancelled
// here or from Chat; whichever is clicked first runs it, and only once.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../ui';
import { JosePlanMap } from './JosePlanMap';
import { JosePlanEditor } from './JosePlanEditor';
import { JoseStepOutput } from './JoseStepOutput';
import { describePlanSource, type JosePlan } from '../../services/jose/josePlanner';
import { getJoseRequest, listJoseRequests, type JoseRequest } from '../../services/jose/joseRequestStore';
import { saveUserTemplate } from '../../services/jose/joseUserTemplates';
import { cancelPlan, runApprovedPlan } from '../../services/jose/submitToJose';
import { agentName } from '../../services/jose/agentNames';
import { approveRequestStep, carryOnRequest, rejectRequestStep } from '../../services/joseExecutionEngineService';

const STATUS_LABELS: Record<string, string> = {
  waiting_plan_approval: 'Plan waiting for you',
  running: 'Running',
  waiting_approval: 'Waiting for your approval',
  done: 'Done',
  failed: 'Failed',
  interrupted: 'Interrupted',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

export function requestPlanLabel(request: JoseRequest): string {
  if (!request.plan) return '';
  const plan: JosePlan = {
    steps: request.steps,
    source: request.plan.source as JosePlan['source'],
    templateId: request.plan.templateId,
    kind: request.kind,
    note: request.plan.note,
  };
  return describePlanSource(plan);
}

export function runResultText(result: any): string {
  if (result?.reason === 'plan_rejected') return `The plan didn't pass the checks: ${(result.problems || []).join(' ')} It is still waiting.`;
  return result?.command?.userReport?.summary || result?.reason || (result?.ok ? 'Done.' : 'It could not run.');
}

export function JoseRequestsBoard({ selectedRequestId }: { selectedRequestId?: string }) {
  const [requests, setRequests] = useState<JoseRequest[]>(() => listJoseRequests());
  const [selectedId, setSelectedId] = useState<string | undefined>(selectedRequestId || listJoseRequests()[0]?.id);
  const [editing, setEditing] = useState(false);
  // The step picked in the map, whose output shows below it (phase 6a).
  const [stepId, setStepId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const [message, setMessage] = useState('');
  const [templateName, setTemplateName] = useState<string | null>(null);

  const refresh = useCallback(() => setRequests(listJoseRequests()), []);
  useEffect(() => {
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [refresh]);

  const selected = selectedId ? requests.find((r) => r.id === selectedId) || getJoseRequest(selectedId) : null;
  const waiting = selected?.status === 'waiting_plan_approval';

  const run = async () => {
    if (!selected || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setMessage('');
    try {
      const result = await runApprovedPlan(selected.id);
      setMessage(runResultText(result));
    } catch (error) {
      setMessage(`It could not run: ${String(error)}`);
    } finally {
      runningRef.current = false;
      setRunning(false);
      refresh();
    }
  };

  // A step waiting for your approval (phase 4): approving it here carries the request on.
  const approveStep = async (stepId: string) => {
    if (!selected || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setMessage('');
    try {
      const result: any = await approveRequestStep(selected.id, stepId);
      setMessage(result?.summary || (result?.ok ? 'Done.' : 'It could not run.'));
    } catch (error) {
      setMessage(`It could not run: ${String(error)}`);
    } finally {
      runningRef.current = false;
      setRunning(false);
      refresh();
    }
  };
  // A request the app was closed on (phase 5): carry it on from where it was.
  const carryOn = async () => {
    if (!selected || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setMessage('');
    try {
      setMessage(runResultText(await carryOnRequest(selected.id)));
    } catch (error) {
      setMessage(`It could not run: ${String(error)}`);
    } finally {
      runningRef.current = false;
      setRunning(false);
      refresh();
    }
  };
  const waitingSteps = selected?.status === 'waiting_approval' ? selected.steps.filter((s) => s.status === 'waiting_approval') : [];

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      <ul className="space-y-1" aria-label="Jose requests">
        {requests.length === 0 && <li className="text-xs text-(--text-3)">No requests yet. Ask Jose something in Chat.</li>}
        {requests.map((request) => (
          <li key={request.id}>
            <button
              type="button"
              onClick={() => { setSelectedId(request.id); setEditing(false); setMessage(''); setStepId(null); }}
              className={`w-full rounded-md px-2 py-1.5 text-left text-xs ${request.id === selectedId ? 'bg-(--surface-3)' : 'bg-(--surface-2) hover:bg-(--surface-3)'}`}
            >
              <div className="truncate font-medium text-(--text-1)">{request.text}</div>
              <div className="text-[10px] text-(--text-3)">{STATUS_LABELS[request.status] || request.status} · {new Date(request.createdAtMs).toLocaleString()}</div>
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <div className="space-y-3 min-w-0">
          <div>
            <div className="text-sm font-semibold text-(--text-1)">{selected.text}</div>
            <div className="text-xs text-(--text-3)">{STATUS_LABELS[selected.status] || selected.status}</div>
            {requestPlanLabel(selected) && <div className="text-xs text-(--text-2) mt-1">{requestPlanLabel(selected)}</div>}
          </div>

          {editing && waiting
            ? <JosePlanEditor request={selected} onSaved={() => { setEditing(false); refresh(); }} />
            : (
              <>
                <JosePlanMap steps={selected.steps} selectedStepId={stepId || undefined} onSelectStep={(id) => setStepId(id === stepId ? null : id)} />
                {stepId && selected.steps.some((s) => s.stepId === stepId) && (
                  <div className="mt-2 rounded-xl bg-(--surface-2) p-3">
                    <div className="mb-1 text-xs font-semibold text-(--text-2)">What {agentName(selected.steps.find((s) => s.stepId === stepId)!.agent)}'s step produced</div>
                    <JoseStepOutput key={`${selected.commandId}-${stepId}-${selected.steps.find((s) => s.stepId === stepId)!.status}`} commandId={selected.commandId} stepId={stepId} />
                  </div>
                )}
              </>
            )}

          <div className="flex flex-wrap gap-2">
            {waiting && !editing && (
              <>
                <Button variant="primary" disabled={running} onClick={run}>Run this plan</Button>
                <Button onClick={() => setEditing(true)}>Edit</Button>
                <Button variant="ghost" onClick={() => { cancelPlan(selected.id); refresh(); }}>Cancel</Button>
              </>
            )}
            {selected.status === 'interrupted' && (
              <Button variant="primary" disabled={running} onClick={carryOn}>Carry on</Button>
            )}
            {waitingSteps.map((step) => (
              <React.Fragment key={step.stepId}>
                <Button variant="primary" disabled={running} onClick={() => approveStep(step.stepId)}>
                  {`Approve and carry on: ${agentName(step.agent)} ${step.actionType}`}
                </Button>
                <Button
                  variant="ghost"
                  disabled={running}
                  onClick={() => { setMessage(rejectRequestStep(selected.id, step.stepId).summary); refresh(); }}
                >
                  {`Reject: ${agentName(step.agent)} ${step.actionType}`}
                </Button>
              </React.Fragment>
            ))}
            {editing && <Button variant="ghost" onClick={() => setEditing(false)}>Stop editing</Button>}
            <Button variant="ghost" onClick={() => setTemplateName(templateName === null ? '' : null)}>Save as template</Button>
          </div>

          {templateName !== null && (
            <div className="flex gap-2">
              <input
                aria-label="Template name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Name, e.g. Product launch"
                className="flex-1 rounded-sm bg-(--surface-1) px-2 py-1 text-xs"
              />
              <Button
                size="sm"
                disabled={!templateName.trim()}
                onClick={() => {
                  const template = saveUserTemplate({ name: templateName.trim(), kind: selected.kind, steps: selected.steps, requestText: selected.text });
                  setTemplateName(null);
                  setMessage(`Saved as template "${template.name}". Jose will offer it for requests like this one.`);
                }}
              >
                Save template
              </Button>
            </div>
          )}

          {message && <div className="rounded-md bg-(--surface-2) p-2 text-xs text-(--text-1)" role="status">{message}</div>}

          {(selected.changeLog || []).length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-(--text-3)">Changes</div>
              <ul className="text-xs text-(--text-2) space-y-0.5">
                {(selected.changeLog || []).map((entry) => (
                  <li key={`${entry.atMs}-${entry.text}`}>{new Date(entry.atMs).toLocaleTimeString()} — {entry.text}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
