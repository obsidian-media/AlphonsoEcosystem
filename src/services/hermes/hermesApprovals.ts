// Hermes gateway (2026-10-30): when a Hermes run asks to do something, the
// step waits for you on the board and Telegram like any other waiting step. The
// request keeps running (it keeps its turn); only the step shows
// `waiting_approval` with `hermesApproval`. Approve answers Hermes `once`,
// Reject `deny`; nothing is kept for later, so every use asks again.
import { getJoseRequest, updateJoseStep } from '../jose/joseRequestStore';
import { agentName } from '../jose/agentNames';
import type { HermesApprovalRequest } from './hermesRun';
import { HERMES_TIMED_OUT, describeHermesApproval } from './hermesConstants';

export { describeHermesApproval };

export { HERMES_TIMED_OUT };
export const ALREADY_DONE = 'Already done.';

export interface StepHermesApproval {
  runId: string;
  command?: string;
  description: string;
}


type Choice = 'once' | 'deny';
const waiting = new Map<string, { agent: string; resolve: (c: Choice) => void }>();
const ended = new Set<string>();
const keyOf = (requestId: string, stepId: string) => `${requestId}:${stepId}`;

/** Makes the step wait and resolves with your answer. */
export function waitForHermesApproval(requestId: string, stepId: string, req: HermesApprovalRequest): Promise<Choice> {
  const key = keyOf(requestId, stepId);
  ended.delete(key);
  const approval: StepHermesApproval = { runId: req.runId, ...(req.command ? { command: req.command } : {}), description: req.description };
  updateJoseStep(requestId, stepId, { status: 'waiting_approval', hermesApproval: approval, note: describeHermesApproval(req) } as never);
  return new Promise<Choice>((resolve) => {
    waiting.set(key, { agent: req.agent, resolve });
  });
}

/** The run ended while the step waited (Hermes gave up, or the step stopped). */
export function endHermesApproval(requestId: string, stepId: string): void {
  const key = keyOf(requestId, stepId);
  const entry = waiting.get(key);
  if (!entry) return;
  waiting.delete(key);
  ended.add(key);
  // Settles the open question so nothing waits on it any more.
  entry.resolve('deny');
  updateJoseStep(requestId, stepId, { hermesApproval: undefined, note: HERMES_TIMED_OUT } as never);
}

/** True when this step waits on a Hermes approval right now. */
export function isWaitingOnHermes(requestId: string, stepId: string): boolean {
  return waiting.has(keyOf(requestId, stepId));
}

/** Your answer from the board or Telegram. */
export async function answerHermesApproval(requestId: string, stepId: string, yes: boolean): Promise<{ ok: boolean; summary: string }> {
  const key = keyOf(requestId, stepId);
  const entry = waiting.get(key);
  if (!entry) {
    if (ended.has(key)) return { ok: false, summary: HERMES_TIMED_OUT };
    const step = getJoseRequest(requestId)?.steps.find((s) => s.stepId === stepId) as { hermesApproval?: unknown } | undefined;
    // Waiting in the saved request but not in this app's memory: the app was closed since.
    if (step?.hermesApproval) return { ok: false, summary: HERMES_TIMED_OUT };
    return { ok: false, summary: ALREADY_DONE };
  }
  waiting.delete(key);
  updateJoseStep(requestId, stepId, { status: 'running', hermesApproval: undefined, note: undefined } as never);
  entry.resolve(yes ? 'once' : 'deny');
  const name = agentName(entry.agent);
  return { ok: true, summary: yes ? `Approved. ${name} carries on.` : `Rejected. ${name}'s Hermes profile won't do it.` };
}
