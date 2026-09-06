import { evaluatePolicyGate } from '../policyEnforcementService';
import { getConnectorCredential } from './connectorAuth.js';

const CALLE_API_BASE = 'https://api.heycall-e.com';

// No `recipients` field: that structure is for CALL-E's multi-recipient/batch
// dialing (out of scope). For a single-recipient call, the phone number is
// embedded directly in the natural-language `task` string -- this matches
// CALL-E's own quickstart example verbatim.
export interface CalleCreateCallRequest {
  task: string;
  resultSchema?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export type CalleCallStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'canceled';

export interface CalleTranscriptTurn {
  speaker: 'bot' | 'user' | 'unknown';
  text: string;
}

export interface CalleCallAttempt {
  phone: string;
  status: string;
  transcriptTurns: CalleTranscriptTurn[];
  startedAt: string | null;
  completedAt: string | null;
}

export interface CalleCallTask {
  id: string;
  object: 'call_task';
  status: CalleCallStatus;
  task: string;
  // transcript_turns exists ONLY under recipients[].attempts[] -- verified
  // against CALL-E's OpenAPI spec, there is no task-level transcript field.
  recipients: Array<{
    id: string;
    phones: string[];
    status: string;
    structuredResult: Record<string, unknown> | null;
    summary: string | null;
    attempts: CalleCallAttempt[];
  }>;
  // structuredResult/summary/taskCompleted are read from these TASK-LEVEL
  // fields (CALL-E's own rollup across recipients) rather than
  // recipients[0]'s own copies of the same fields.
  structuredResult: Record<string, unknown> | null;
  summary: string | null;
  taskCompleted: boolean | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

async function calleRequest(
  method: string,
  path: string,
  apiKey: string,
  body?: Record<string, unknown>,
  approved = false,
  idempotencyKey?: string
): Promise<any> {
  const gate = evaluatePolicyGate({
    connectorId: 'calle',
    actionType: 'external_call',
    commandPreview: JSON.stringify({ method, path, body }),
    approved,
    auth: { enabled: false, isAuthorized: false }
  });
  if (!gate.ok) {
    throw new Error(gate.reason || 'Policy gate blocked');
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const response = await fetch(`${CALLE_API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    let detail = '';
    try {
      const errBody = await response.json();
      detail = errBody?.message || JSON.stringify(errBody);
    } catch {
      detail = response.statusText;
    }
    throw new Error(`CALL-E API error (${response.status}): ${detail}`);
  }
  return response.json();
}

// idempotencyKey is REQUIRED, not optional -- CALL-E's API supports an
// Idempotency-Key header specifically to make retries safe. Without it, a
// double-click on "Approve & Place Call", or any error-handling retry, risks
// placing a duplicate real phone call to the same business.
export async function createCall(
  apiKey: string,
  request: CalleCreateCallRequest,
  idempotencyKey: string,
  options: { approved?: boolean } = {}
): Promise<CalleCallTask> {
  return calleRequest('POST', '/v1/calls', apiKey, request as unknown as Record<string, unknown>, options.approved ?? false, idempotencyKey);
}

export async function getCall(apiKey: string, callId: string): Promise<CalleCallTask> {
  return calleRequest('GET', `/v1/calls/${callId}`, apiKey);
}

export async function pollCallUntilTerminal(
  apiKey: string,
  callId: string,
  { intervalMs = 5000, timeoutMs = 300000, onProgress }: { intervalMs?: number; timeoutMs?: number; onProgress?: (call: CalleCallTask) => void } = {}
): Promise<CalleCallTask> {
  const start = Date.now();
  const terminal = new Set(['completed', 'failed', 'canceled']);
  // Fire an immediate 'queued' progress signal BEFORE the 60s delay below so
  // a live status card never shows nothing for a full minute after submission.
  onProgress?.({ status: 'queued' } as CalleCallTask);
  // First poll after ~60s per CALL-E's own recommendation (calls take real
  // time to place and hold a conversation) -- not a hard deadline, just a
  // sane first-check delay so we're not hammering the API immediately.
  await new Promise((resolve) => setTimeout(resolve, 60000));
  while (Date.now() - start < timeoutMs) {
    const call = await getCall(apiKey, callId);
    onProgress?.(call);
    if (terminal.has(call.status)) return call;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`CALL-E call ${callId} did not reach a terminal state within ${timeoutMs}ms`);
}

export function isCalleConfigured(): boolean {
  return Boolean(getConnectorCredential('calle', 'CALLE_API_KEY'));
}
