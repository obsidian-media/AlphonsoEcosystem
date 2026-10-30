// Resource manager (2026-10-30): the gate every step passes before it runs.
//
// The step's need is estimated; then it runs when it fits, makes room first
// (idle things only), waits with a plain reason on its request step, or fails
// as too big for this computer. Admitted work reserves its estimate, so two
// steps admitted a moment apart don't count the same free memory: a
// reservation counts until a reading taken RESERVATION_SETTLE_MS after it
// (by then the step's memory shows in the reading). While waiting, the next
// reading decides again (or a fresh one after WAIT_RECHECK_MS when the watcher
// is quiet). A stop while waiting ends the wait at once. Outside the desktop
// app every step runs: nothing here can be measured.
import { isTauri } from '@tauri-apps/api/core';
import { updateJoseStep } from '../jose/joseRequestStore';
import { STOPPED_LINE } from '../jose/joseStop';
import { decideAdmission } from './admission';
import { ensureTools, type EnsureResult } from './ensureTools';
import { freeThings } from './freeMemory';
import { latestResources, onResources } from './idleStop';
import { readResources, type ResourceState } from './resourceState';
import { estimateNeed, recordStepUse, type StepAssignment, type StepNeed } from './stepNeeds';
import { beginUse, endUse, usageRecord } from './toolUse';

export const WAIT_RECHECK_MS = 30_000;
export const RESERVATION_SETTLE_MS = 30_000;

export type Admitted = { ok: true; release: () => void };
export type NotAdmitted = { ok: false; reason: string; stopped?: true };

interface Reservation { ramMb: number; gpuMb: number; atMs: number }
const reservations = new Map<string, Reservation>();

/** Memory promised to running steps that a reading taken at `readingAtMs` may not show yet. */
export function reservedTotal(readingAtMs: number): { ramMb: number; gpuMb: number } {
  let ramMb = 0;
  let gpuMb = 0;
  for (const r of reservations.values()) {
    if (readingAtMs >= r.atMs + RESERVATION_SETTLE_MS) continue;
    ramMb += r.ramMb;
    gpuMb += r.gpuMb;
  }
  return { ramMb, gpuMb };
}

function inTauri(): boolean {
  try { return isTauri(); } catch { return false; }
}

function noteWaiting(requestId: string, stepId: string, patch: { waitingFor?: string; waitingSinceMs?: number }): void {
  try { updateJoseStep(requestId, stepId, patch); } catch { /* a step not saved still waits */ }
}

const read = () => readResources(usageRecord());

/** The next reading, a fresh one after WAIT_RECHECK_MS, or null when stopped. */
function nextReading(signal?: AbortSignal): Promise<ResourceState | null> {
  return new Promise((resolve) => {
    if (signal?.aborted) { resolve(null); return; }
    let settled = false;
    const finish = (value: ResourceState | null) => {
      if (settled) return;
      settled = true;
      off();
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve(value);
    };
    const onAbort = () => finish(null);
    const off = onResources((state) => finish(state));
    const timer = setTimeout(() => { void read().then(finish, () => finish(null)); }, WAIT_RECHECK_MS);
    signal?.addEventListener('abort', onAbort);
  });
}

function startRun(key: string, need: StepNeed, state: ResourceState): Admitted {
  reservations.set(key, { ramMb: need.gpuSpillsToRam ? 0 : need.ramMb, gpuMb: need.gpuMb, atMs: Date.now() });
  const uses = [...need.tools, ...(need.modelKey ? [need.modelKey] : [])];
  for (const tool of uses) beginUse(tool, key);
  // The lowest free memory seen while it runs: what it took, learned for next time.
  const before = { ram: state.ramFreeMb, gpu: state.gpuFreeMb };
  let lowest: { ram: number; gpu: number | null } | null = null;
  const off = onResources((s) => {
    lowest = {
      ram: Math.min(lowest?.ram ?? s.ramFreeMb, s.ramFreeMb),
      gpu: s.gpuFreeMb === null ? (lowest?.gpu ?? null) : Math.min(lowest?.gpu ?? s.gpuFreeMb, s.gpuFreeMb),
    };
  });
  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      off();
      reservations.delete(key);
      for (const tool of uses) endUse(tool, key);
      const seen = lowest as { ram: number; gpu: number | null } | null;
      if (seen) {
        recordStepUse(need.key, {
          ramMb: Math.max(0, before.ram - seen.ram),
          gpuMb: before.gpu !== null && seen.gpu !== null ? Math.max(0, before.gpu - seen.gpu) : 0,
        });
      }
    },
  };
}

/** Waits until this step may run; `release()` when it ends. Never throws. */
export async function admitStep(requestId: string, stepId: string, assignment: StepAssignment, signal?: AbortSignal): Promise<Admitted | NotAdmitted> {
  const noop: Admitted = { ok: true, release: () => undefined };
  if (!inTauri()) return noop;
  let need: StepNeed;
  try { need = await estimateNeed(assignment); } catch { return noop; }
  if (!need.tools.length && !need.ramMb && !need.gpuMb) return noop;

  const key = `${requestId}:${stepId}`;
  const tried = new Set<string>();
  let waiting = false;
  const stopWaiting = () => { if (waiting) noteWaiting(requestId, stepId, { waitingFor: undefined, waitingSinceMs: undefined }); };
  let state: ResourceState | null = latestResources() ?? await read();

  for (;;) {
    if (signal?.aborted) { stopWaiting(); return { ok: false, reason: STOPPED_LINE, stopped: true }; }
    if (!state) state = await read();
    const decision = decideAdmission(need, state, reservedTotal(state.atMs));

    if (decision.kind === 'too_big') { stopWaiting(); return { ok: false, reason: decision.reason }; }

    if (decision.kind === 'run') {
      stopWaiting();
      const run = startRun(key, need, state);
      const tools: EnsureResult = await ensureTools(need.tools).catch((): EnsureResult => ({ ok: true }));
      if (!tools.ok) { run.release(); return { ok: false, reason: (tools as { reason: string }).reason }; }
      return run;
    }

    if (decision.kind === 'free_first') {
      // Each thing is offered once; when freeing changed nothing, wait instead.
      const fresh = decision.free.filter((t) => !tried.has(`${t.kind}:${t.name}`));
      if (fresh.length) {
        for (const t of fresh) tried.add(`${t.kind}:${t.name}`);
        await freeThings(fresh);
        state = await read();
        continue;
      }
    }

    const reason = decision.kind === 'wait' ? decision.reason : 'Waiting for memory to free up.';
    noteWaiting(requestId, stepId, waiting ? { waitingFor: reason } : { waitingFor: reason, waitingSinceMs: Date.now() });
    waiting = true;
    state = await nextReading(signal);
    if (!state && signal?.aborted) { stopWaiting(); return { ok: false, reason: STOPPED_LINE, stopped: true }; }
  }
}

/** What a plan's first step needs, for the queue (`takeTurn`); undefined outside the desktop app. */
export async function firstStepNeed(steps: Array<StepAssignment & { needs?: string[] }>): Promise<StepNeed | undefined> {
  if (!inTauri()) return undefined;
  const first = steps.find((s) => !(s.needs || []).length);
  if (!first) return undefined;
  try { return await estimateNeed(first); } catch { return undefined; }
}

export function resetGateForTests(): void {
  reservations.clear();
}
