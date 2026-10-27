// One local-model request at a time (Jose phase 7, owner 2026-10-27). A request that will use a
// local Ollama model or ComfyUI waits while another such request runs; first come, first served.
// Plain answers never get here (they don't run as requests). A request whose steps all use paid or
// cloud models doesn't wait. A request that starts waiting for you gives its turn back, and rejoins
// at the back when it carries on. Not the resource manager: nothing here measures memory.
import { getJoseRequest, listJoseRequests, onRequestStatusChange, setJoseRequestStatus, setRequestQueuedAt, type JoseRequestStatus } from './joseRequestStore';
import { onStopRequested } from './joseStop';
import { getAgentProvider } from '../modelSelectionService';
import type { PlanStep } from './stepGraph';

const CLOUD_PROVIDERS = new Set(['nvidia', 'gemini']);
const PAID_MODEL = /^(claude|chatgpt):/;

let current: string | null = null;
const order: string[] = [];
const waiters = new Map<string, () => void>();

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
    const id = order.shift()!;
    const wake = waiters.get(id);
    if (!wake) continue;
    waiters.delete(id);
    current = id;
    try { setJoseRequestStatus(id, 'running'); } catch { /* removed meanwhile */ }
    wake();
    return;
  }
  current = null;
}

/** Resolves when it is this request's turn; marks it queued while it waits. */
export function takeTurn(requestId: string): Promise<void> {
  if (!current || current === requestId) {
    current = requestId;
    return Promise.resolve();
  }
  if (!order.includes(requestId)) order.push(requestId);
  try {
    setRequestQueuedAt(requestId, Date.now());
    setJoseRequestStatus(requestId, 'queued' as JoseRequestStatus);
  } catch { /* a request that isn't saved still waits */ }
  return new Promise((resolve) => waiters.set(requestId, resolve));
}

/** The request is done with the local model. */
export function giveBackTurn(requestId: string): void {
  if (current === requestId) next();
  else leaveQueue(requestId);
}

/** Out of the queue (stopped while waiting): its run goes on, and stops at once. */
export function leaveQueue(requestId: string): void {
  const i = order.indexOf(requestId);
  if (i >= 0) order.splice(i, 1);
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
  current = null;
  order.length = 0;
  waiters.clear();
}

// A request that holds the turn and stops running (done, failed, waiting for you, stopped,
// cancelled) gives it back.
const STILL_RUNNING = new Set(['running', 'queued']);
onRequestStatusChange((requestId, status) => {
  if (current === requestId && !STILL_RUNNING.has(status)) next();
});
onStopRequested((requestId) => {
  if (getJoseRequest(requestId)?.status === ('queued' as JoseRequestStatus) || order.includes(requestId)) leaveQueue(requestId);
});
