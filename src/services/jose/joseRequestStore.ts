// Every request Jose runs, saved with its steps and their status: the base for
// the live board (phase 3) and resuming after a restart (phase 5).
// Design: docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md §5
import { durableGet, durableSet } from '../../lib/durableStore.js';
import type { PlanStep } from './stepGraph';
import { rewireNeeds } from './josePlanEdits';
import { getPacketById } from '../agentBusService';
import { randomHex } from '../../lib/randomId';

const REQUESTS_KEY = 'alphonso_jose_requests_v1';
const MAX_REQUESTS = 200;

export type JoseRequestStatus = 'waiting_plan_approval' | 'running' | 'waiting_approval' | 'waiting_setup' | 'done' | 'failed' | 'interrupted' | 'cancelled' | 'expired';

export interface JoseRequestStep extends PlanStep {
  status: string;
  /** For a review step: what it found (phase 4). */
  verdict?: 'pass' | 'fix';
  error?: string;
  startedAtMs?: number;
  endedAtMs?: number;
}

export interface JoseRequest {
  id: string;
  commandId: string;
  source: string;
  text: string;
  kind: 'normal' | 'project';
  status: JoseRequestStatus;
  steps: JoseRequestStep[];
  /** How the plan was made (phase 2): fresh, from a template (as is or adapted), or by the rules. */
  plan?: { source: string; templateId: string | null; note: string };
  /** Plain-language record of changes to the plan (phase 3), oldest first. */
  changeLog?: { atMs: number; text: string }[];
  /** How to run a plan that waits for approval (phase 3). */
  runOptions?: { source: string; previewMode?: boolean; zeroCostMode?: boolean; endpoint?: string; allowPaidModels?: boolean };
  createdAtMs: number;
  updatedAtMs: number;
}

function readAll(): JoseRequest[] {
  try {
    const parsed = JSON.parse(durableGet(REQUESTS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(requests: JoseRequest[]): void {
  durableSet(REQUESTS_KEY, JSON.stringify(requests));
}

function update(id: string, change: (request: JoseRequest) => void): JoseRequest {
  const all = readAll();
  const request = all.find((r) => r.id === id);
  if (!request) throw new Error(`Jose request not found: ${id}`);
  change(request);
  request.updatedAtMs = Date.now();
  writeAll(all);
  return request;
}

/** A step as the board saves it: the content data (brief, brand) stays on the command (phase 6b). */
function savedStep(step: PlanStep): PlanStep {
  const { contentStep: _content, payload: _payload, ...rest } = step;
  return rest;
}

export function createJoseRequest(input: { commandId: string; source: string; text: string; kind: 'normal' | 'project'; steps: PlanStep[]; plan?: JoseRequest['plan']; runOptions?: JoseRequest['runOptions'] }): JoseRequest {
  const now = Date.now();
  const request: JoseRequest = {
    id: `jose-request-${input.commandId}`,
    commandId: input.commandId,
    source: input.source,
    text: input.text,
    kind: input.kind,
    status: 'running',
    steps: input.steps.map((s) => ({ ...savedStep(s), status: 'waiting' })),
    ...(input.plan ? { plan: input.plan } : {}),
    ...(input.runOptions ? { runOptions: input.runOptions } : {}),
    createdAtMs: now,
    updatedAtMs: now,
  };
  const all = [...readAll().filter((r) => r.id !== request.id), request]
    .sort((a, b) => a.createdAtMs - b.createdAtMs)
    .slice(-MAX_REQUESTS);
  writeAll(all);
  return request;
}

function saveNew(request: JoseRequest): JoseRequest {
  const all = [...readAll().filter((r) => r.id !== request.id), request]
    .sort((a, b) => a.createdAtMs - b.createdAtMs)
    .slice(-MAX_REQUESTS);
  writeAll(all);
  return request;
}

/** A plan saved to wait for the user before it runs (phase 3). */
export function createWaitingPlanRequest(input: {
  text: string;
  source: string;
  kind: 'normal' | 'project';
  steps: PlanStep[];
  plan: NonNullable<JoseRequest['plan']>;
  runOptions: NonNullable<JoseRequest['runOptions']>;
}): JoseRequest {
  const now = Date.now();
  return saveNew({
    id: `jose-request-plan-${now.toString(36)}-${randomHex(6)}`,
    commandId: '',
    source: input.source,
    text: input.text,
    kind: input.kind,
    status: 'waiting_plan_approval',
    steps: input.steps.map((s) => ({ ...s, status: 'waiting' })),
    plan: input.plan,
    changeLog: [],
    runOptions: input.runOptions,
    createdAtMs: now,
    updatedAtMs: now,
  });
}

/** Replace a waiting plan's steps (an edit), with a plain reason for the change log. */
export function replacePlanSteps(requestId: string, steps: PlanStep[], reason: string): JoseRequest {
  return update(requestId, (r) => {
    if (r.status !== 'waiting_plan_approval') throw new Error('Only a plan that is waiting can be changed.');
    r.steps = steps.map((s) => ({ ...s, status: 'waiting' }));
    r.changeLog = [...(r.changeLog || []), { atMs: Date.now(), text: reason }];
  });
}

/** Take a waiting plan to run it. Returns null if it is not waiting (already run, or cancelled). */
export function claimPlanForRun(requestId: string): JoseRequest | null {
  const all = readAll();
  const request = all.find((r) => r.id === requestId);
  if (!request || request.status !== 'waiting_plan_approval') return null;
  request.status = 'running';
  request.updatedAtMs = Date.now();
  writeAll(all);
  return request;
}

/** Cancel a plan that is waiting. */
export function cancelJoseRequest(requestId: string): JoseRequest {
  return update(requestId, (r) => {
    if (r.status !== 'waiting_plan_approval') throw new Error('Only a plan that is waiting can be cancelled.');
    r.status = 'cancelled';
    r.changeLog = [...(r.changeLog || []), { atMs: Date.now(), text: 'Cancelled.' }];
  });
}

/** Put a claimed plan back to waiting (its edited steps failed the rule check). */
export function returnPlanToWaiting(requestId: string, reason: string): JoseRequest {
  return update(requestId, (r) => {
    r.status = 'waiting_plan_approval';
    r.changeLog = [...(r.changeLog || []), { atMs: Date.now(), text: reason }];
  });
}

/** Tie a run to a request saved earlier (an approved plan): its command, its steps reset to waiting. */
export function attachRunToRequest(requestId: string, input: { commandId: string; steps: PlanStep[] }): JoseRequest {
  return update(requestId, (r) => {
    r.commandId = input.commandId;
    r.status = 'running';
    r.steps = input.steps.map((s) => ({ ...s, status: 'waiting' }));
  });
}

/** Steps Jose added while the request runs (phase 4), with the reason in the change log. */
export function addRequestSteps(requestId: string, steps: PlanStep[], reason: string): JoseRequest {
  return update(requestId, (r) => {
    r.steps = [...r.steps, ...steps.map((s) => ({ ...savedStep(s), status: 'waiting' }))];
    r.changeLog = [...(r.changeLog || []), { atMs: Date.now(), text: reason }];
  });
}

/** Later steps that needed `from` now need `to` (phase 4). */
export function rewireRequestNeeds(requestId: string, from: string[], to: string[], except: string[] = []): JoseRequest {
  return update(requestId, (r) => {
    const rewired = rewireNeeds(r.steps, from, to, except);
    r.steps = r.steps.map((s, i) => ({ ...s, needs: rewired[i].needs }));
  });
}

/** A plain note in the change log (a change that was not made, a review that still found problems). */
export function appendRequestNote(requestId: string, text: string): JoseRequest {
  return update(requestId, (r) => {
    r.changeLog = [...(r.changeLog || []), { atMs: Date.now(), text }];
  });
}

export function updateJoseStep(requestId: string, stepId: string, patch: Partial<JoseRequestStep>): JoseRequest {
  return update(requestId, (r) => {
    const step = r.steps.find((s) => s.stepId === stepId);
    if (step) Object.assign(step, patch);
  });
}

export function setJoseRequestStatus(requestId: string, status: JoseRequestStatus): JoseRequest {
  return update(requestId, (r) => { r.status = status; });
}

export function getJoseRequest(id: string): JoseRequest | null {
  return readAll().find((r) => r.id === id) || null;
}

/** The request a packet's step belongs to (phase 4), or null for a packet made outside Jose's requests. */
export function findRequestByPacket(packetId: string): JoseRequest | null {
  const packet: any = getPacketById(packetId);
  const commandId = packet?.payload?.joseCommandId;
  const stepId = packet?.payload?.assignment?.stepId;
  if (!commandId || !stepId) return null;
  return readAll().find((r) => r.commandId === commandId && r.steps.some((step) => step.stepId === stepId)) || null;
}

export function listJoseRequests(): JoseRequest[] {
  return readAll().sort((a, b) => b.createdAtMs - a.createdAtMs);
}

/** A request still "running" after a restart was cut off when the app closed. */
export function markRunningRequestsInterrupted(): number {
  const all = readAll();
  let count = 0;
  for (const r of all) {
    if (r.status === 'running') {
      r.status = 'interrupted';
      count += 1;
    }
  }
  if (count > 0) writeAll(all);
  return count;
}
