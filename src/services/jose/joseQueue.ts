// Local-model requests (Jose phase 7, owner 2026-10-27; memory-aware since the resource manager,
// 2026-10-30). A request that will use a local Ollama model or ComfyUI starts at once when nothing
// local runs, or beside the others when the memory its first step needs fits (the latest reading,
// less what running steps have reserved); otherwise it waits, first come, first served: nothing
// jumps ahead of a request already waiting. Each step still passes the resource gate
// (`resources/resourceGate.ts`), which measures memory before it runs. Plain answers never get here.
// A request whose steps all use paid or cloud models doesn't wait. A request that starts waiting
// for you gives its turn back, and rejoins at the back when it carries on.
import { getJoseRequest, listJoseRequests, onRequestStatusChange, setJoseRequestStatus, setRequestQueuedAt, type JoseRequestStatus } from './joseRequestStore';
import { onStopRequested } from './joseStop';
import { getAgentProvider } from '../modelSelectionService';
import { decideAdmission } from '../resources/admission';
import { latestResources } from '../resources/idleStop';
import { reservedTotal } from '../resources/resourceGate';
import type { StepNeed } from '../resources/stepNeeds';
import type { PlanStep } from './stepGraph';

// Until 2026-10-30 this listed 'nvidia', which is not a provider id, so NVIDIA steps queued.
const CLOUD_PROVIDERS = new Set(['nvidia_nim', 'gemini', 'hermes', 'openrouter']);
const PAID_MODEL = /^(claude|chatgpt):/;

const current = new Set<string>();
const order: string[] = [];
const waiters = new Map<string, () => void>();
const needs = new Map<string, StepNeed | undefined>();

/** With others running: may this request start too? Only on a fresh reading. */
function fitsBeside(need: StepNeed | undefined): boolean {
  if (!need) return false;
  const state = latestResources();
  if (!state) return false;
  return decideAdmission(need, state, reservedTotal(state.atMs)).kind === 'run';
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] || 'th'}`;
}

export const QUEUED_LINE = (n: number): string => `Queued (${ordinal(n)}).`;
export const WAITING_FOR_TURN = 'Waiting for another request to finish.';

/** Whether a plan's steps use the local model or graphics memory. */
export function usesLocalModel(steps: PlanStep[]): boolean {
  return steps.some((step) => {
    if ((step as { contentStep?: unknown }).contentStep) return true;
    if (step.model && PAID_MODEL.test(step.model)) return false;
    const provider = getAgentProvider(step.agent)?.provider || 'ollama';
    return !CLOUD_PROVIDERS.has(provider);
  });
}

/** Position among the waiting, 1-based; null when not waiting. */
export function queuePosition(requestId: string): number | null {
  const i = order.indexOf(requestId);
  return i < 0 ? null : i + 1;
}

function next(): void {
  while (order.length) {
    const id = order[0];
    const wake = waiters.get(id);
    if (!wake) { order.shift(); needs.delete(id); continue; }
    if (current.size && !fitsBeside(needs.get(id))) return;
    order.shift();
    waiters.delete(id);
    needs.delete(id);
    current.add(id);
    try { setJoseRequestStatus(id, 'running'); } catch { /* removed meanwhile */ }
    wake();
  }
}

/** Resolves when this request may run; marks it queued while it waits. `firstNeed`: what its first step needs. */
export function takeTurn(requestId: string, firstNeed?: StepNeed): Promise<void> {
  if (!current.size || current.has(requestId) || (!order.length && fitsBeside(firstNeed))) {
    current.add(requestId);
    return Promise.resolve();
  }
  needs.set(requestId, firstNeed);
  if (!order.includes(requestId)) order.push(requestId);
  try {
    setRequestQueuedAt(requestId, Date.now());
    setJoseRequestStatus(requestId, 'queued' as JoseRequestStatus);
  } catch { /* a request that isn't saved still waits */ }
  return new Promise((resolve) => waiters.set(requestId, resolve));
}

/** The request is done with the local model. */
export function giveBackTurn(requestId: string): void {
  if (current.delete(requestId)) next();
  else leaveQueue(requestId);
}

/** Out of the queue (stopped while waiting): its run goes on, and stops at once. */
export function leaveQueue(requestId: string): void {
  const i = order.indexOf(requestId);
  if (i >= 0) order.splice(i, 1);
  needs.delete(requestId);
  const wake = waiters.get(requestId);
  if (wake) {
    waiters.delete(requestId);
    wake();
  }
}

/** Requests queued when the app closed, carried on oldest first. */
export function requeueAtStart(carryOn: (requestId: string) => Promise<unknown>): string[] {
  const queued = listJoseRequests()
    .filter((r) => r.status === ('queued' as JoseRequestStatus))
    .sort((a, b) => (a.queuedAtMs || a.createdAtMs) - (b.queuedAtMs || b.createdAtMs))
    .map((r) => r.id);
  for (const id of queued) void Promise.resolve(carryOn(id)).catch(() => undefined);
  return queued;
}

export function resetQueueForTests(): void {
  current.clear();
  order.length = 0;
  waiters.clear();
  needs.clear();
}

// A request that holds the turn and stops running (done, failed, waiting for you, stopped,
// cancelled) gives it back.
const STILL_RUNNING = new Set(['running', 'queued']);
onRequestStatusChange((requestId, status) => {
  if (current.has(requestId) && !STILL_RUNNING.has(status)) {
    current.delete(requestId);
    next();
  }
});
onStopRequested((requestId) => {
  if (getJoseRequest(requestId)?.status === ('queued' as JoseRequestStatus) || order.includes(requestId)) leaveQueue(requestId);
});
