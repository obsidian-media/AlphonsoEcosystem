// Every request Jose runs, saved with its steps and their status: the base for
// the live board (phase 3) and resuming after a restart (phase 5).
// Design: docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md §5
import { durableGet, durableSet } from '../../lib/durableStore.js';
import type { PlanStep } from './stepGraph';

const REQUESTS_KEY = 'alphonso_jose_requests_v1';
const MAX_REQUESTS = 200;

export type JoseRequestStatus = 'running' | 'waiting_approval' | 'done' | 'failed' | 'interrupted';

export interface JoseRequestStep extends PlanStep {
  status: string;
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

export function createJoseRequest(input: { commandId: string; source: string; text: string; kind: 'normal' | 'project'; steps: PlanStep[]; plan?: JoseRequest['plan'] }): JoseRequest {
  const now = Date.now();
  const request: JoseRequest = {
    id: `jose-request-${input.commandId}`,
    commandId: input.commandId,
    source: input.source,
    text: input.text,
    kind: input.kind,
    status: 'running',
    steps: input.steps.map((s) => ({ ...s, status: 'waiting' })),
    ...(input.plan ? { plan: input.plan } : {}),
    createdAtMs: now,
    updatedAtMs: now,
  };
  const all = [...readAll().filter((r) => r.id !== request.id), request]
    .sort((a, b) => a.createdAtMs - b.createdAtMs)
    .slice(-MAX_REQUESTS);
  writeAll(all);
  return request;
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
