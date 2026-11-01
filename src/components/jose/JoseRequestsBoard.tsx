// The live board (owner: Q13, Q21; phase 3): every Jose request, and for the
// selected one its plan as a map, how it was planned, its change log, and the
// actions its state allows. A waiting plan can be run, edited or cancelled
// here or from Chat; whichever is clicked first runs it, and only once.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../ui';
import { JosePlanMap } from './JosePlanMap';
import { JosePlanEditor } from './JosePlanEditor';
import { JoseStepOutput } from './JoseStepOutput';
import { CodePreviewView } from '../alphonso/CodePreviewView';
import { editCodeFile } from '../../services/alphonso/editChange';
import { EchoRemembered } from '../echo/EchoRemembered';
import { CleanupProposals } from '../echo/CleanupProposals';
import { pickForget } from '../../services/echo/echoPicks';
import { templateProblems } from '../../services/jose/teams';
import { describePlanSource, type JosePlan } from '../../services/jose/josePlanner';
import type { JoseRequest } from '../../services/jose/joseRequestStore';
import { runResultText, useBoardData } from '../../services/phone/boardData';
import { saveUserTemplate } from '../../services/jose/joseUserTemplates';
import { QUEUED_LINE, queuePosition } from '../../services/jose/joseQueue';
import { groupRequests } from '../../services/jose/requestGroups';
import { agentName } from '../../services/jose/agentNames';
import { pickAlphonsoProject } from '../../services/joseExecutionEngineService';
import { describeHermesApproval } from '../../services/hermes/hermesConstants';
import { describeSend } from '../../services/marcus/describeSend';

export const STATUS_LABELS: Record<string, string> = {
  waiting_plan_approval: 'Plan waiting for you',
  running: 'Running',
  waiting_approval: 'Waiting for your approval',
  waiting_setup: 'Waiting for something to be set up',
  done: 'Done',
  failed: 'Failed',
  interrupted: 'Interrupted',
  cancelled: 'Cancelled',
  expired: 'Expired',
  stopped: 'Stopped by you',
  queued: 'Queued',
};

/** A request's status in words; a queued one with its place in the queue (Jose phase 7). */
export function statusLabel(request: JoseRequest): string {
  const place = request.status === 'queued' ? queuePosition(request.id) : null;
  if (place) return QUEUED_LINE(place);
  // Resource manager (2026-10-30): a running request held back by memory says what holds it.
  const memoryWait = request.status === 'running' ? request.steps.find((s) => s.waitingFor)?.waitingFor : undefined;
  if (memoryWait) return memoryWait;
  return STATUS_LABELS[request.status] || request.status;
}

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

export { runResultText };

export function JoseRequestsBoard({ selectedRequestId }: { selectedRequestId?: string }) {
  const data = useBoardData();
  const [requests, setRequests] = useState<JoseRequest[]>(() => data.requests());
  const [selectedId, setSelectedId] = useState<string | undefined>(selectedRequestId || data.requests()[0]?.id);
  const [editing, setEditing] = useState(false);
  // The step picked in the map, whose output shows below it (phase 6a).
  const [stepId, setStepId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const [message, setMessage] = useState('');
  const [templateName, setTemplateName] = useState<string | null>(null);
  // Send back / Edit text on a waiting send (phone app phase 2): which step, and what is typed.
  const [sendTool, setSendTool] = useState<{ stepId: string; kind: 'back' | 'edit'; text: string; base: string } | null>(null);

  const refresh = useCallback(() => setRequests(data.requests()), [data]);
  useEffect(() => {
    const timer = setInterval(refresh, 2000);
    const off = data.subscribe(refresh);
    return () => { clearInterval(timer); off(); };
  }, [refresh, data]);
  // On the phone the board shows the computer's requests; while it is offline, only reading.
  const readOnly = data.readOnly;
  // An answer shown at once (the computer) or when it arrives (the phone).
  const show = (answer: string | Promise<string>) => {
    if (typeof answer === 'string') { if (answer) setMessage(answer); refresh(); return; }
    answer.then((text) => { if (text) setMessage(text); refresh(); }).catch((error) => setMessage(`It could not run: ${String(error)}`));
  };

  const selected = selectedId ? requests.find((r) => r.id === selectedId) || data.request(selectedId) : null;
  const waiting = selected?.status === 'waiting_plan_approval';
  // A waiting plan that breaks the rules says so before you run it (agent roles Part C1).
  const planProblems = waiting && selected ? templateProblems({ steps: selected.steps as never }) : [];

  const run = async () => {
    if (!selected || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setMessage('');
    try {
      setMessage(await data.runPlan(selected.id));
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
      setMessage(await data.approveStep(selected.id, stepId));
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
      setMessage(await data.carryOn(selected.id));
    } catch (error) {
      setMessage(`It could not run: ${String(error)}`);
    } finally {
      runningRef.current = false;
      setRunning(false);
      refresh();
    }
  };
  // A Hermes run asking to do something (Hermes gateway, 2026-10-30): its request keeps running.
  const hermesSteps = data.local && selected?.status === 'running' ? selected.steps.filter((s) => s.status === 'waiting_approval' && s.hermesApproval) : [];
  const answerHermes = async (stepId: string, yes: boolean) => {
    if (!selected) return;
    const { answerHermesApproval } = await import('../../services/hermes/hermesApprovals');
    setMessage((await answerHermesApproval(selected.id, stepId, yes)).summary);
    refresh();
  };
  const waitingSteps = selected?.status === 'waiting_approval' ? selected.steps.filter((s) => s.status === 'waiting_approval' && !s.hermesApproval) : [];
  // "Which project" (agent phase 6).
  const choosingStep = data.local && selected?.status === 'waiting_setup' ? selected.steps.find((s) => s.status === 'setup_needed' && s.projectChoices?.length) : undefined;
  // Echo's pickers (agent phase 7): which decision to forget, or his cleanup proposals.
  const forgetStep = data.local && selected?.status === 'waiting_setup' ? selected.steps.find((s) => s.status === 'setup_needed' && s.decisionChoices?.length) : undefined;
  const cleanupStep = data.local && selected?.status === 'waiting_setup' ? selected.steps.find((s) => s.status === 'setup_needed' && s.cleanupSetId) : undefined;
  const asking = Boolean(choosingStep || forgetStep || cleanupStep);
  const forget = async (decisionId: string) => {
    if (!selected || !forgetStep || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    try {
      setMessage((await pickForget(selected.id, forgetStep.stepId, decisionId)).summary);
    } catch (error) {
      setMessage(`It could not carry on: ${String(error)}`);
    } finally {
      runningRef.current = false;
      setRunning(false);
      refresh();
    }
  };
  const pick = async (project: string) => {
    if (!selected || !choosingStep || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    try {
      setMessage((await pickAlphonsoProject(selected.id, choosingStep.stepId, project)).summary);
    } catch (error) {
      setMessage(`It could not carry on: ${String(error)}`);
    } finally {
      runningRef.current = false;
      setRunning(false);
      refresh();
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      <ul className="space-y-1" aria-label="Jose requests">
        {requests.length === 0 && <li className="text-xs text-(--text-3)">No requests yet. Ask Jose something in Chat.</li>}
        {/* A project's requests together under its name (Jose phase 7). */}
        {groupRequests(requests).map((entry) => entry.group ? (
          <li key={`group-${entry.group.id}`} data-testid={`jose-group-${entry.group.id}`}>
            <div className="px-1 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-(--text-3)">{entry.group.label}</div>
            <ul className="space-y-1 border-l border-(--border) pl-2">
              {entry.requests.map((request) => (
              <li key={request.id}>
                <button
                  type="button"
                  onClick={() => { setSelectedId(request.id); setEditing(false); setMessage(''); setStepId(null); }}
                  className={`w-full rounded-md px-2 py-1.5 text-left text-xs ${request.id === selectedId ? 'bg-(--surface-3)' : 'bg-(--surface-2) hover:bg-(--surface-3)'}`}
                >
                  <div className="truncate font-medium text-(--text-1)">{request.text}</div>
                  <div className="text-[10px] text-(--text-3)">{statusLabel(request)} · {new Date(request.createdAtMs).toLocaleString()}</div>
                </button>
              </li>
              ))}
            </ul>
          </li>
        ) : entry.requests.map((request) => (
          <li key={request.id}>
            <button
              type="button"
              onClick={() => { setSelectedId(request.id); setEditing(false); setMessage(''); setStepId(null); }}
              className={`w-full rounded-md px-2 py-1.5 text-left text-xs ${request.id === selectedId ? 'bg-(--surface-3)' : 'bg-(--surface-2) hover:bg-(--surface-3)'}`}
            >
              <div className="truncate font-medium text-(--text-1)">{request.text}</div>
              <div className="text-[10px] text-(--text-3)">{statusLabel(request)} · {new Date(request.createdAtMs).toLocaleString()}</div>
            </button>
          </li>
        )))}
      </ul>

      {selected && (
        <div className="space-y-3 min-w-0">
          <div>
            <div className="text-sm font-semibold text-(--text-1)">{selected.text}</div>
            <div className="text-xs text-(--text-3)">{statusLabel(selected)}</div>
            {requestPlanLabel(selected) && <div className="text-xs text-(--text-2) mt-1">{requestPlanLabel(selected)}</div>}
          </div>

          {editing && waiting
            ? <JosePlanEditor request={selected} onSaved={() => { setEditing(false); refresh(); }} />
            : (
              <>
                {selected.steps.some((s) => s.waitingFor) && (
                  <div data-testid="memory-waiting" className="mb-2 rounded-lg bg-(--warning-dim) border border-(--warning-border) px-3 py-2 text-xs text-(--text-1)">
                    {selected.steps.filter((s) => s.waitingFor).map((s) => `${agentName(s.agent)}: ${s.waitingFor}`).join(' ')}
                  </div>
                )}
                <JosePlanMap steps={selected.steps} selectedStepId={stepId || undefined} onSelectStep={(id) => setStepId(id === stepId ? null : id)} />
                {stepId && selected.steps.some((s) => s.stepId === stepId) && (
                  <div className="mt-2 rounded-xl bg-(--surface-2) p-3">
                    <div className="mb-1 text-xs font-semibold text-(--text-2)">What {agentName(selected.steps.find((s) => s.stepId === stepId)!.agent)}'s step produced</div>
                    {selected.steps.find((s) => s.stepId === stepId)?.note && (
                      <p className="text-xs text-(--text-secondary) mb-2" data-testid="jose-step-note">{selected.steps.find((s) => s.stepId === stepId)!.note}</p>
                    )}
                    {selected.steps.find((s) => s.stepId === stepId)?.skillReason && (
                      <p className="text-xs text-(--text-2) mb-2" data-testid="jose-step-skill">
                        {selected.steps.find((s) => s.stepId === stepId)?.skill
                          ? `Skill: ${selected.steps.find((s) => s.stepId === stepId)!.skill} — ${selected.steps.find((s) => s.stepId === stepId)!.skillReason}`
                          : selected.steps.find((s) => s.stepId === stepId)!.skillReason}
                      </p>
                    )}
                    <JoseStepOutput key={`${selected.commandId}-${stepId}-${selected.steps.find((s) => s.stepId === stepId)!.status}`} commandId={selected.commandId} stepId={stepId} />
                  </div>
                )}
              </>
            )}

          {data.local && waitingSteps.filter((s) => s.codePreview).map((s) => (
            <CodePreviewView
              key={`preview-${s.stepId}`}
              preview={s.codePreview!}
              onEdit={(path, content) => { const out = editCodeFile(selected.id, s.stepId, path, content); refresh(); return out; }}
            />
          ))}
          {choosingStep && (
            <div className="space-y-2 rounded-xl bg-(--surface-2) p-3 text-xs">
              <div className="text-(--text-1)">{choosingStep.error}</div>
              <div className="flex flex-wrap gap-2">
                {choosingStep.projectChoices!.map((project) => (
                  <Button key={project} data-testid={`alphonso-pick-${project}`} disabled={running} onClick={() => pick(project)}>{project}</Button>
                ))}
              </div>
            </div>
          )}

          {forgetStep && (
            <div className="space-y-2 rounded-xl bg-(--surface-2) p-3 text-xs">
              <div className="text-(--text-1)">{forgetStep.error}</div>
              <div className="flex flex-wrap gap-2">
                {forgetStep.decisionChoices!.map((c) => (
                  <Button key={c.id} data-testid={`echo-forget-${c.id}`} disabled={running} onClick={() => forget(c.id)}>{c.text}</Button>
                ))}
              </div>
            </div>
          )}
          {cleanupStep && (
            <CleanupProposals key={cleanupStep.cleanupSetId} requestId={selected.id} stepId={cleanupStep.stepId} setId={cleanupStep.cleanupSetId!} onDone={(summary) => { setMessage(summary); refresh(); }} />
          )}
          {data.local && <EchoRemembered requestId={selected.id} />}
          {readOnly && data.readOnlyReason && <div data-testid="board-read-only" className="rounded-md bg-(--surface-2) p-2 text-xs text-(--text-2)">{data.readOnlyReason}</div>}

          {planProblems.length > 0 && (
            <ul data-testid="jose-plan-problems" className="rounded-xl bg-(--surface-2) p-3 text-xs text-(--warning)">
              {planProblems.map((p) => <li key={p}>{p}</li>)}
              <li className="text-(--text-3)">Edit the plan to fix this before running it.</li>
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            {waiting && !editing && (
              <>
                <Button variant="primary" disabled={running || readOnly || planProblems.length > 0} onClick={run}>Run this plan</Button>
                {data.local && <Button onClick={() => setEditing(true)}>Edit</Button>}
                <Button variant="ghost" disabled={readOnly} onClick={() => show(data.cancelPlan(selected.id))}>Cancel</Button>
              </>
            )}
            {(selected.status === 'running' || selected.status === ('queued' as string)) && (
              <Button variant="ghost" data-testid="jose-stop" disabled={readOnly} onClick={() => show(data.stop(selected.id))}>Stop</Button>
            )}
            {(selected.status === 'interrupted' || (selected.status === 'waiting_setup' && !asking)) && (
              <>
                <Button variant="primary" disabled={running || readOnly} onClick={carryOn}>Carry on</Button>
                <Button variant="ghost" data-testid="jose-cancel-request" disabled={running || readOnly} onClick={() => show(data.cancel(selected.id))}>Cancel</Button>
              </>
            )}
            {hermesSteps.map((step) => (
              <div key={`hermes-${step.stepId}`} data-testid={`jose-hermes-approval-${step.stepId}`} className="flex w-full flex-wrap items-center gap-2">
                <span className="text-sm text-(--text-primary)">{describeHermesApproval({ agent: step.agent, ...(step.hermesApproval as NonNullable<typeof step.hermesApproval>) })}</span>
                <Button variant="primary" onClick={() => answerHermes(step.stepId, true)}>{`Approve: ${agentName(step.agent)}`}</Button>
                <Button variant="ghost" onClick={() => answerHermes(step.stepId, false)}>{`Reject: ${agentName(step.agent)}`}</Button>
              </div>
            ))}
            {waitingSteps.map((step) => (
              <React.Fragment key={step.stepId}>
                {step.sendPreview?.text && (
                  <p data-testid={`jose-send-preview-${step.stepId}`} className="w-full whitespace-pre-wrap rounded-lg bg-(--surface-1) p-2 text-xs text-(--text-1)">{describeSend(step.sendPreview)}</p>
                )}
                {/* A code change is read file by file: it is approved on the computer, never from the phone. */}
                {step.codePreview && !data.local ? (
                  <p data-testid={`jose-code-on-computer-${step.stepId}`} className="w-full text-xs text-(--text-2)">{`${agentName(step.agent)}'s change to your code is checked on your computer: open it there to approve.`}</p>
                ) : (
                  <Button variant="primary" disabled={running || readOnly} onClick={() => approveStep(step.stepId)}>
                    {`Approve and carry on: ${agentName(step.agent)} ${step.actionType}`}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  disabled={running || readOnly}
                  onClick={() => show(data.rejectStep(selected.id, step.stepId))}
                >
                  {`Reject: ${agentName(step.agent)} ${step.actionType}`}
                </Button>
              </React.Fragment>
            ))}
            {waitingSteps.filter((step) => step.sendPreview?.sourceStepId || step.sendPreview?.text).map((step) => (
              <React.Fragment key={`send-tools-${step.stepId}`}>
                {step.sendPreview?.sourceStepId && (
                  <Button variant="ghost" data-testid={`jose-send-back-${step.stepId}`} disabled={running || readOnly}
                    onClick={() => setSendTool({ stepId: step.stepId, kind: 'back', text: '', base: '' })}>
                    {`Send back: ${agentName(step.agent)}`}
                  </Button>
                )}
                <Button variant="ghost" data-testid={`jose-edit-send-${step.stepId}`} disabled={running || readOnly}
                  onClick={() => setSendTool({ stepId: step.stepId, kind: 'edit', text: step.sendPreview?.text || '', base: step.sendPreview?.text || '' })}>
                  {`Edit text: ${agentName(step.agent)}`}
                </Button>
              </React.Fragment>
            ))}
            {editing && <Button variant="ghost" onClick={() => setEditing(false)}>Stop editing</Button>}
            {data.local && <Button variant="ghost" onClick={() => setTemplateName(templateName === null ? '' : null)}>Save as template</Button>}
          </div>

          {sendTool && selected && (
            <div className="flex flex-col gap-2" data-testid="jose-send-tool">
              <textarea
                aria-label={sendTool.kind === 'back' ? 'What to change' : 'Text Marcus sends'}
                value={sendTool.text}
                onChange={(e) => setSendTool({ ...sendTool, text: e.target.value })}
                rows={sendTool.kind === 'back' ? 2 : 6}
                className="w-full rounded-sm bg-(--surface-1) px-2 py-1 text-sm"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="primary" disabled={!sendTool.text.trim() || readOnly}
                  onClick={() => {
                    const tool = sendTool;
                    setSendTool(null);
                    show(tool.kind === 'back'
                      ? data.sendBack(selected.id, tool.stepId, tool.text)
                      : data.editSendText(selected.id, tool.stepId, tool.text, tool.base));
                  }}>
                  {sendTool.kind === 'back' ? 'Send it back' : 'Save text'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSendTool(null)}>Cancel</Button>
              </div>
            </div>
          )}

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
