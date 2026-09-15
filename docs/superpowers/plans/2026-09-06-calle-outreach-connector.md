# CALL-E Outreach Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a CALL-E outreach connector so Alphonso can place a real, policy-gated, approval-gated outbound phone call (via a basic functional panel) asking a business about website interest and/or booking a demo appointment.

**Architecture:** Plain-`fetch` connector (`calleConnector.ts`) + localStorage-backed call-record service (`calleOutreachService.ts`, fire-and-forget polling, boot-time recovery) + policy/registry/credential wiring matching every existing connector + a basic panel using today's `ui/` primitives. No Jose/Marcus pipeline dependency — the panel calls the service directly; Marcus appears only as an activity-log label.

**Tech Stack:** TypeScript, plain `fetch()` (no SDK), Vitest, React, existing `src/components/ui/` primitives.

Full design rationale: `docs/superpowers/specs/2026-09-06-calle-outreach-connector-design.md` (3 self-critique passes — read it before deviating from anything below).

---

## Task 1: `calleConnector.ts` — raw API client

**Files:**
- Create: `src/services/connectors/calleConnector.ts`
- Test: `src/test/connectors/calleConnector.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/test/connectors/calleConnector.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/policyEnforcementService', () => ({
  evaluatePolicyGate: vi.fn(() => ({ ok: true, blocked: false, reason: null }))
}));
vi.mock('../../services/connectors/connectorAuth.js', () => ({
  getConnectorCredential: vi.fn(() => 'test-api-key')
}));

import { evaluatePolicyGate } from '../../services/policyEnforcementService';
import {
  createCall,
  getCall,
  pollCallUntilTerminal,
  isCalleConfigured
} from '../../services/connectors/calleConnector';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mockFetch);
  (evaluatePolicyGate as any).mockReturnValue({ ok: true, blocked: false, reason: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockJsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    statusText: 'OK'
  };
}

describe('createCall', () => {
  it('POSTs to /v1/calls with Authorization and Idempotency-Key headers', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ id: 'call_1', status: 'queued' }));

    await createCall('test-api-key', { task: 'Call and ask about the website.' }, 'idem-key-1', { approved: true });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.heycall-e.com/v1/calls',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-api-key',
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idem-key-1'
        }),
        body: JSON.stringify({ task: 'Call and ask about the website.' })
      })
    );
  });

  it('sends the same Idempotency-Key unchanged across a repeated call', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ id: 'call_1', status: 'queued' }));

    await createCall('test-api-key', { task: 'task A' }, 'stable-key', { approved: true });
    await createCall('test-api-key', { task: 'task A' }, 'stable-key', { approved: true });

    const firstHeaders = mockFetch.mock.calls[0][1].headers;
    const secondHeaders = mockFetch.mock.calls[1][1].headers;
    expect(firstHeaders['Idempotency-Key']).toBe('stable-key');
    expect(secondHeaders['Idempotency-Key']).toBe('stable-key');
  });

  it('calls evaluatePolicyGate with the actionType external_call and the approved flag before hitting fetch', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ id: 'call_1', status: 'queued' }));

    await createCall('test-api-key', { task: 'task A' }, 'idem-key', { approved: true });

    expect(evaluatePolicyGate).toHaveBeenCalledWith(
      expect.objectContaining({ connectorId: 'calle', actionType: 'external_call', approved: true })
    );
  });

  it('throws and never calls fetch when the policy gate blocks', async () => {
    (evaluatePolicyGate as any).mockReturnValue({ ok: false, blocked: true, reason: 'Approval Mode requires explicit approval for this action.' });

    await expect(createCall('test-api-key', { task: 'task A' }, 'idem-key', { approved: false }))
      .rejects.toThrow('Approval Mode requires explicit approval for this action.');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws a descriptive error on a non-ok response', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ message: 'Invalid phone number' }, false, 400));

    await expect(createCall('test-api-key', { task: 'task A' }, 'idem-key', { approved: true }))
      .rejects.toThrow('CALL-E API error (400): Invalid phone number');
  });
});

describe('getCall', () => {
  it('GETs /v1/calls/{id} with no Idempotency-Key header', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ id: 'call_1', status: 'completed' }));

    await getCall('test-api-key', 'call_1');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.heycall-e.com/v1/calls/call_1',
      expect.objectContaining({ method: 'GET' })
    );
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['Idempotency-Key']).toBeUndefined();
  });
});

describe('pollCallUntilTerminal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onProgress with a queued status immediately, before the initial delay', async () => {
    const onProgress = vi.fn();
    mockFetch.mockResolvedValue(mockJsonResponse({ id: 'call_1', status: 'completed' }));

    const promise = pollCallUntilTerminal('test-api-key', 'call_1', { onProgress });
    // Immediately, before any timers advance:
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ status: 'queued' }));

    await vi.runAllTimersAsync();
    await promise;
  });

  it('returns immediately once a terminal status is observed', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ id: 'call_1', status: 'completed', structuredResult: { interested_in_website: 'yes' } }));

    const promise = pollCallUntilTerminal('test-api-key', 'call_1');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe('completed');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps polling on a non-terminal status until one is reached', async () => {
    mockFetch
      .mockResolvedValueOnce(mockJsonResponse({ id: 'call_1', status: 'in_progress' }))
      .mockResolvedValueOnce(mockJsonResponse({ id: 'call_1', status: 'in_progress' }))
      .mockResolvedValueOnce(mockJsonResponse({ id: 'call_1', status: 'completed' }));

    const promise = pollCallUntilTerminal('test-api-key', 'call_1', { intervalMs: 1000 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe('completed');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('throws a timeout error if no terminal status is reached within timeoutMs', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ id: 'call_1', status: 'in_progress' }));

    const promise = pollCallUntilTerminal('test-api-key', 'call_1', { intervalMs: 1000, timeoutMs: 5000 });
    const assertion = expect(promise).rejects.toThrow(/did not reach a terminal state/);
    await vi.runAllTimersAsync();
    await assertion;
  });
});

describe('isCalleConfigured', () => {
  it('returns true when CALLE_API_KEY is present', () => {
    expect(isCalleConfigured()).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/connectors/calleConnector.test.ts --no-file-parallelism`
Expected: FAIL — `src/services/connectors/calleConnector.ts` doesn't exist yet.

- [ ] **Step 3: Implement the connector**

Create `src/services/connectors/calleConnector.ts`:

```ts
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
  return calleRequest('POST', '/v1/calls', apiKey, request, options.approved ?? false, idempotencyKey);
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/test/connectors/calleConnector.test.ts --no-file-parallelism`
Expected: PASS (all tests). If `vi.useFakeTimers()` interacts badly with the promise-based `setTimeout` chain in `pollCallUntilTerminal`, use `await vi.runAllTimersAsync()` (already in the tests above) rather than `vi.advanceTimersByTimeAsync()` step-by-step — the latter is fragile against this function's dynamic loop count.

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/services/connectors/calleConnector.ts src/test/connectors/calleConnector.test.ts
git commit -m "feat(calle): add raw API client for CALL-E outreach calls"
```

---

## Task 2: `calleOutreachService.ts` — call-record persistence

**Files:**
- Create: `src/services/calleOutreachService.ts`
- Test: `src/test/services/calleOutreachService.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/test/services/calleOutreachService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAppendAgentActivity = vi.fn();
vi.mock('../../services/agentActivityService', () => ({
  appendAgentActivity: (...args: unknown[]) => mockAppendAgentActivity(...args)
}));

const mockCreateCall = vi.fn();
const mockGetCall = vi.fn();
vi.mock('../../services/connectors/calleConnector', () => ({
  createCall: (...args: unknown[]) => mockCreateCall(...args),
  getCall: (...args: unknown[]) => mockGetCall(...args),
  pollCallUntilTerminal: (...args: unknown[]) => mockPollCallUntilTerminal(...args)
}));
const mockPollCallUntilTerminal = vi.fn();

vi.mock('../../services/connectors/connectorAuth.js', () => ({
  getConnectorCredential: vi.fn(() => 'test-api-key')
}));

import {
  createOutreachDraft,
  dismissOutreachCall,
  listOutreachCalls,
  runOutreachCall,
  recoverInterruptedOutreachCalls
} from '../../services/calleOutreachService';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('createOutreachDraft', () => {
  it('creates a pending_approval record with a stable idempotencyKey', () => {
    const record = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });

    expect(record.status).toBe('pending_approval');
    expect(record.idempotencyKey).toBeTruthy();
    expect(listOutreachCalls()).toHaveLength(1);
  });

  it('returns the existing record instead of creating a duplicate for a non-terminal phone number', () => {
    const first = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    const second = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });

    expect(second.id).toBe(first.id);
    expect(listOutreachCalls()).toHaveLength(1);
  });

  it('allows a new draft once the prior record for that phone is dismissed', () => {
    const first = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    dismissOutreachCall(first.id);
    const second = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });

    expect(second.id).not.toBe(first.id);
    expect(listOutreachCalls()).toHaveLength(2);
  });
});

describe('dismissOutreachCall', () => {
  it('sets status to dismissed', () => {
    const record = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    dismissOutreachCall(record.id);

    const updated = listOutreachCalls().find((r) => r.id === record.id);
    expect(updated?.status).toBe('dismissed');
  });
});

describe('runOutreachCall', () => {
  it('resolves as soon as createCall resolves, without waiting for a slow pollCallUntilTerminal', async () => {
    const draft = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    mockCreateCall.mockResolvedValue({ id: 'call_1', status: 'queued' });
    let resolvePoll: (value: unknown) => void = () => {};
    mockPollCallUntilTerminal.mockReturnValue(new Promise((resolve) => { resolvePoll = resolve; }));

    const result = await runOutreachCall(draft.id, { approved: true });

    expect(result.status).toBe('queued');
    expect(mockCreateCall).toHaveBeenCalled();
    // pollCallUntilTerminal was invoked but runOutreachCall did NOT wait on it:
    expect(mockPollCallUntilTerminal).toHaveBeenCalled();
    // clean up the dangling promise so the test doesn't leak a rejection
    resolvePoll({ status: 'completed', structuredResult: null, summary: null, recipients: [] });
  });

  it('reuses the same idempotencyKey across a retry', async () => {
    const draft = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    mockCreateCall.mockResolvedValue({ id: 'call_1', status: 'queued' });
    mockPollCallUntilTerminal.mockReturnValue(new Promise(() => {}));

    await runOutreachCall(draft.id, { approved: true });
    await runOutreachCall(draft.id, { approved: true });

    expect(mockCreateCall.mock.calls[0][2]).toBe(draft.idempotencyKey);
    expect(mockCreateCall.mock.calls[1][2]).toBe(draft.idempotencyKey);
  });

  it('sets policyBlockKind and keeps status pending_approval when createCall throws a policy-gate error', async () => {
    const draft = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    mockCreateCall.mockRejectedValue(new Error('Approval Mode requires explicit approval for this action.'));

    const result = await runOutreachCall(draft.id, { approved: false });

    expect(result.status).toBe('pending_approval');
    expect(result.policyBlockKind).toBe('needs_approval_click');
  });

  it('calls appendAgentActivity attributed to marcus', async () => {
    const draft = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    mockCreateCall.mockResolvedValue({ id: 'call_1', status: 'queued' });
    mockPollCallUntilTerminal.mockReturnValue(new Promise(() => {}));

    await runOutreachCall(draft.id, { approved: true });

    expect(mockAppendAgentActivity).toHaveBeenCalledWith(expect.objectContaining({ agent: 'marcus' }));
  });

  it('updates the record with structuredResult/summary/transcript once the fire-and-forget poll resolves', async () => {
    const draft = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    mockCreateCall.mockResolvedValue({ id: 'call_1', status: 'queued' });
    let resolvePoll: (value: unknown) => void = () => {};
    mockPollCallUntilTerminal.mockReturnValue(new Promise((resolve) => { resolvePoll = resolve; }));

    await runOutreachCall(draft.id, { approved: true });
    resolvePoll({
      status: 'completed',
      structuredResult: { interested_in_website: 'yes' },
      summary: 'They are interested.',
      recipients: [{ attempts: [{ transcriptTurns: [{ speaker: 'bot', text: 'Hello' }] }] }]
    });
    await new Promise((r) => setTimeout(r, 0)); // flush the .then()

    const updated = listOutreachCalls().find((r) => r.id === draft.id);
    expect(updated?.status).toBe('completed');
    expect(updated?.structuredResult).toEqual({ interested_in_website: 'yes' });
    expect(updated?.transcript).toEqual([{ speaker: 'bot', text: 'Hello' }]);
  });

  it('leaves status as in_progress (not a new terminal value) when the fire-and-forget poll rejects with a timeout', async () => {
    const draft = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    mockCreateCall.mockResolvedValue({ id: 'call_1', status: 'in_progress' });
    let rejectPoll: (reason: unknown) => void = () => {};
    mockPollCallUntilTerminal.mockReturnValue(new Promise((_, reject) => { rejectPoll = reject; }));

    await runOutreachCall(draft.id, { approved: true });
    rejectPoll(new Error('did not reach a terminal state'));
    await new Promise((r) => setTimeout(r, 0));

    const updated = listOutreachCalls().find((r) => r.id === draft.id);
    expect(updated?.status).toBe('in_progress');
    expect(updated?.error).toContain('did not reach a terminal state');
  });
});

describe('recoverInterruptedOutreachCalls', () => {
  it('checks getCall exactly once for a record left in_progress and updates it if now terminal', async () => {
    const draft = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    // simulate an in-flight record from a prior session
    const rows = JSON.parse(localStorage.getItem('alphonso_calle_outreach_v1') || '[]');
    rows[0].status = 'in_progress';
    rows[0].calleCallId = 'call_1';
    localStorage.setItem('alphonso_calle_outreach_v1', JSON.stringify(rows));

    mockGetCall.mockResolvedValue({ id: 'call_1', status: 'completed', structuredResult: { interested_in_website: 'no' }, summary: 'Not interested.', recipients: [] });

    await recoverInterruptedOutreachCalls();

    expect(mockGetCall).toHaveBeenCalledTimes(1);
    const updated = listOutreachCalls().find((r) => r.id === draft.id);
    expect(updated?.status).toBe('completed');
  });

  it('leaves an already-terminal record untouched (no getCall call)', async () => {
    const draft = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    const rows = JSON.parse(localStorage.getItem('alphonso_calle_outreach_v1') || '[]');
    rows[0].status = 'completed';
    localStorage.setItem('alphonso_calle_outreach_v1', JSON.stringify(rows));

    await recoverInterruptedOutreachCalls();

    expect(mockGetCall).not.toHaveBeenCalled();
  });

  it('leaves a record still non-terminal after the check as in_progress, not re-polled in a loop', async () => {
    const draft = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    const rows = JSON.parse(localStorage.getItem('alphonso_calle_outreach_v1') || '[]');
    rows[0].status = 'in_progress';
    rows[0].calleCallId = 'call_1';
    localStorage.setItem('alphonso_calle_outreach_v1', JSON.stringify(rows));

    mockGetCall.mockResolvedValue({ id: 'call_1', status: 'in_progress' });

    await recoverInterruptedOutreachCalls();

    expect(mockGetCall).toHaveBeenCalledTimes(1);
    const updated = listOutreachCalls().find((r) => r.id === draft.id);
    expect(updated?.status).toBe('in_progress');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/services/calleOutreachService.test.ts --no-file-parallelism`
Expected: FAIL — `src/services/calleOutreachService.ts` doesn't exist yet.

- [ ] **Step 3: Implement the service**

Create `src/services/calleOutreachService.ts`:

```ts
import { appendAgentActivity } from './agentActivityService';
import { getConnectorCredential } from './connectors/connectorAuth.js';
import { createCall, getCall, pollCallUntilTerminal, type CalleCallStatus, type CalleCallTask } from './connectors/calleConnector';

const CALLE_OUTREACH_KEY = 'alphonso_calle_outreach_v1';
// Best-effort estimate only, sourced from CALL-E's pricing page as of
// 2026-09-06 -- that page itself states pricing is "early-stage... subject
// to change." Shown in the approval prompt as an estimate, never presented
// as a guaranteed/contractual figure; re-check before the actual demo.
export const ESTIMATED_COST_USD = 0.05;

export type PolicyBlockKind = 'needs_approval_click' | 'zero_cost_mode' | 'license_tier' | null;

export interface OutreachCallRecord {
  id: string;
  idempotencyKey: string;
  businessName: string;
  phone: string;
  taskType: 'outreach' | 'custom';
  task: string;
  status: CalleCallStatus | 'pending_approval' | 'failed_to_start' | 'dismissed';
  policyBlockKind: PolicyBlockKind;
  calleCallId: string | null;
  structuredResult: Record<string, unknown> | null;
  summary: string | null;
  transcript: Array<{ speaker: 'bot' | 'user' | 'unknown'; text: string }> | null;
  createdAtMs: number;
  completedAtMs: number | null;
  error: string | null;
}

const OUTREACH_RESULT_SCHEMA = {
  type: 'object',
  required: ['interested_in_website'],
  properties: {
    interested_in_website: { type: 'string', enum: ['yes', 'no', 'unknown'] },
    wants_demo_appointment: { type: 'boolean' },
    appointment_time: { type: ['string', 'null'] },
    notes: { type: 'string' }
  }
};

const DEFAULT_OUTREACH_TASK_TEMPLATE = "Call and ask if they'd be interested in an updated website; if so, offer to book a time for the owner to see a demo we've already built.";

function readRows(): OutreachCallRecord[] {
  try {
    const raw = localStorage.getItem(CALLE_OUTREACH_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRows(rows: OutreachCallRecord[]): void {
  localStorage.setItem(CALLE_OUTREACH_KEY, JSON.stringify(rows.slice(-200)));
}

function updateRecord(recordId: string, patch: Partial<OutreachCallRecord>): OutreachCallRecord | null {
  const rows = readRows();
  const nextRows = rows.map((r) => (r.id === recordId ? { ...r, ...patch } : r));
  writeRows(nextRows);
  return nextRows.find((r) => r.id === recordId) || null;
}

function normalizePhoneForTask(phone: string, task: string): string {
  return task.includes(phone) ? task : `${task} Phone: ${phone}.`;
}

export function listOutreachCalls(): OutreachCallRecord[] {
  return readRows();
}

const NON_TERMINAL_STATUSES = new Set(['pending_approval', 'queued', 'in_progress']);

export function createOutreachDraft({ businessName, phone, taskType, task }: {
  businessName: string; phone: string; taskType: OutreachCallRecord['taskType']; task: string;
}): OutreachCallRecord {
  const existing = readRows().find((r) => r.phone === phone && NON_TERMINAL_STATUSES.has(r.status));
  if (existing) return existing;

  const record: OutreachCallRecord = {
    id: `calle-outreach-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    idempotencyKey: `outreach-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    businessName,
    phone,
    taskType,
    task: taskType === 'outreach' ? (task || DEFAULT_OUTREACH_TASK_TEMPLATE) : task,
    status: 'pending_approval',
    policyBlockKind: 'needs_approval_click',
    calleCallId: null,
    structuredResult: null,
    summary: null,
    transcript: null,
    createdAtMs: Date.now(),
    completedAtMs: null,
    error: null
  };

  const rows = readRows();
  writeRows([...rows, record]);
  return record;
}

export function dismissOutreachCall(recordId: string): void {
  updateRecord(recordId, { status: 'dismissed' });
}

function classifyPolicyBlockReason(message: string): PolicyBlockKind {
  const lower = message.toLowerCase();
  if (lower.includes('zero-cost')) return 'zero_cost_mode';
  if (lower.includes('license') || lower.includes('pro')) return 'license_tier';
  return 'needs_approval_click';
}

export async function runOutreachCall(recordId: string, options: { approved?: boolean } = {}): Promise<OutreachCallRecord> {
  const draft = readRows().find((r) => r.id === recordId);
  if (!draft) throw new Error('Outreach call record not found.');

  const apiKey = getConnectorCredential('calle', 'CALLE_API_KEY') as string;
  const request = {
    task: normalizePhoneForTask(draft.phone, draft.task),
    resultSchema: draft.taskType === 'outreach' ? OUTREACH_RESULT_SCHEMA : undefined
  };

  appendAgentActivity({ agent: 'marcus', action: 'calle_outreach_call', detail: draft.businessName });

  let created: CalleCallTask;
  try {
    created = await createCall(apiKey, request, draft.idempotencyKey, { approved: options.approved });
  } catch (error: unknown) {
    const message = String((error as Error)?.message || error);
    return updateRecord(recordId, {
      status: 'pending_approval',
      policyBlockKind: classifyPolicyBlockReason(message),
      error: message
    })!;
  }

  const queuedRecord = updateRecord(recordId, {
    status: created.status,
    calleCallId: created.id,
    policyBlockKind: null,
    error: null
  })!;

  // Fire-and-forget: NOT awaited by this function. See the design spec's
  // Architecture section for why -- awaiting this here would hold open
  // whatever caller invoked runOutreachCall for up to ~6 minutes.
  pollCallUntilTerminal(apiKey, created.id)
    .then((call) => {
      const attempts = call.recipients?.[0]?.attempts ?? [];
      const transcript = attempts.flatMap((a) => a.transcriptTurns ?? []);
      updateRecord(recordId, {
        status: call.status,
        structuredResult: call.structuredResult,
        summary: call.summary,
        transcript: transcript.length ? transcript : null,
        completedAtMs: Date.now()
      });
    })
    .catch((error: unknown) => {
      // A poll TIMEOUT is not proof the real call failed -- leave status
      // unchanged (still in_progress) so the duplicate guard and boot
      // recovery can still find it later.
      updateRecord(recordId, { error: String((error as Error)?.message || error) });
    });

  return queuedRecord;
}

export async function recoverInterruptedOutreachCalls(): Promise<void> {
  const apiKey = getConnectorCredential('calle', 'CALLE_API_KEY') as string;
  if (!apiKey) return;
  const stuck = readRows().filter((r) => (r.status === 'queued' || r.status === 'in_progress') && r.calleCallId);
  for (const record of stuck) {
    try {
      const call = await getCall(apiKey, record.calleCallId!);
      const terminal = new Set(['completed', 'failed', 'canceled']);
      if (terminal.has(call.status)) {
        const attempts = call.recipients?.[0]?.attempts ?? [];
        const transcript = attempts.flatMap((a) => a.transcriptTurns ?? []);
        updateRecord(record.id, {
          status: call.status,
          structuredResult: call.structuredResult,
          summary: call.summary,
          transcript: transcript.length ? transcript : null,
          completedAtMs: Date.now()
        });
      }
      // else: still non-terminal, leave as-is -- the user reopening the
      // panel resumes watching it via listOutreachCalls() polling.
    } catch {
      // non-critical: leave the record as-is, try again on the next boot
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/test/services/calleOutreachService.test.ts --no-file-parallelism`
Expected: PASS (all tests).

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/services/calleOutreachService.ts src/test/services/calleOutreachService.test.ts
git commit -m "feat(calle): add outreach call-record service with fire-and-forget polling and boot recovery"
```

---

## Task 3: Policy, connector registry, credential UI

**Files:**
- Modify: `src/services/policyEnforcementService.ts`
- Modify: `src/services/connectors/connectorRegistry.js`
- Modify: `src/components/ConnectorSetupPanel.tsx`
- Test: `src/test/policyEnforcementService.test.ts` (existing file, add cases)

- [ ] **Step 1: Write the failing tests**

There are two real, actively-maintained test files covering `classifyConnectorRisk` in this repo (confirmed via `grep -rl classifyConnectorRisk src/test/` — a root-level `.js` and a `services/`-scoped `.ts`, likely from an in-progress TS migration; do not assume one is stale without checking recent `git log` on both first): `src/test/policyEnforcementService.test.js` (340 lines) and `src/test/services/policyEnforcementService.test.ts` (205 lines). Add the same new `describe` block to **both** files so coverage stays symmetric between them:

```ts
describe('calle connector risk classification', () => {
  it('classifies calle as high risk unconditionally', () => {
    expect(classifyConnectorRisk('calle', 'anything')).toBe('high');
  });

  it('treats calle as paid/metered', () => {
    const result = evaluatePolicyGate({ connectorId: 'calle', actionType: 'external_call', approved: false });
    // With approvalMode default true and calle high-risk, this should block
    // without approved: true -- assert against whatever this test file's
    // existing pattern uses to check policy.approvalMode's default state.
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/policyEnforcementService.test.js src/test/services/policyEnforcementService.test.ts --no-file-parallelism`
Expected: FAIL — `calle` not yet classified as high risk.

- [ ] **Step 3: Wire policy, registry, and credential UI**

In `src/services/policyEnforcementService.ts`:

1. Add `/external_call/i` to `HIGH_RISK_ACTION_PATTERNS` (near line 31).
2. Add `'calle'` to the unconditional-high-risk branch in `classifyConnectorRisk` (the line reading `else if (id === 'telegram' || id === 'whatsapp' || id === 'hermes_agents') risk = 'high';` — change to include `|| id === 'calle'`).
3. Add `'calle'` to `PAID_OR_METERED_CONNECTORS` (the `Set` literal near line 18) — with a comment matching the existing style:
   ```ts
   // calle: real $0.05/call cost per CALL-E's pricing page (their own page
   // notes this is "early-stage... subject to change" -- re-verify before
   // relying on the exact figure).
   ```
   Add `'calle'` to the array.

In `src/services/connectors/connectorRegistry.js`, add to `DEFAULT_CONNECTORS` (following the `discord` entry's exact shape, near line 166):

```js
{
  id: 'calle',
  name: 'CALL-E',
  status: 'not_configured',
  transport: 'calle_api',
  requiredEnv: ['CALLE_API_KEY'],
  permissions: ['place_outbound_call'],
  disabledReason: 'CALLE_API_KEY not configured.'
},
```

In `src/components/ConnectorSetupPanel.tsx`:

1. Add a state hook near the other credential states (matching `discordBotToken`'s pattern near line 346):
   ```ts
   const [calleApiKey, setCalleApiKey] = useState(() => getConnectorCredential('calle', 'CALLE_API_KEY'));
   ```
2. Add a matching hydration line near line 387 (matching the `discordBotToken` hydration pattern):
   ```ts
   setCalleApiKey((prev) => prev || getConnectorCredential('calle', 'CALLE_API_KEY'));
   ```
3. Add a new `CredentialSection` after the Discord section (near line 808), matching its exact shape:
   ```tsx
   <CredentialSection title="CALL-E" icon={Phone} borderColor="border-rose-300/20" bgColor="bg-rose-500/8" accentColor="text-rose-400"
     fields={[{ label: 'API Key', placeholder: 'calle_live_key from dashboard.heycall-e.com/account/api-keys', value: calleApiKey, onChange: setCalleApiKey, key: 'CALLE_API_KEY' }]}
     onSave={() => saveConnectorApiKey('calle', { CALLE_API_KEY: calleApiKey })}
     hint="Real outbound phone calls, ~$0.05 each. Sign up at heycall-e.com and copy your API key from the dashboard."
   />
   ```
   Check the top of the file's icon imports (`lucide-react`) for a `Phone` icon already imported; if not present, add it to the existing import line (do not create a second import statement).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/test/policyEnforcementService.test.js src/test/services/policyEnforcementService.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Run typecheck and lint**

Run: `npx tsc --noEmit`
Run: `npm run lint`
Expected: 0 errors both.

- [ ] **Step 6: Commit**

```bash
git add src/services/policyEnforcementService.ts src/services/connectors/connectorRegistry.js src/components/ConnectorSetupPanel.tsx src/test/policyEnforcementService.test.ts
git commit -m "feat(calle): classify calle connector as high-risk/paid, add registry entry and credential UI"
```

---

## Task 4: Boot-time recovery wiring

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add a new boot `useEffect`**

In `src/App.tsx`, immediately after the existing crash-recovery `useEffect` (the one calling `recoverInterruptedExecutions`, near line 350-368), add a new, separate `useEffect` — do not overload the existing one, since it's scoped to Jose's orchestration queue and this is an unrelated recovery mechanism:

```tsx
// CALL-E outreach recovery: on boot, any outreach call left 'queued'/
// 'in_progress' from a prior session (its in-memory poll died when the app
// closed) gets one getCall() check against CALL-E's own durable server-side
// state. See docs/superpowers/specs/2026-09-06-calle-outreach-connector-design.md.
useEffect(() => {
  (async () => {
    try {
      const { recoverInterruptedOutreachCalls } = await import('./services/calleOutreachService');
      await recoverInterruptedOutreachCalls();
    } catch { /* non-critical */ }
  })();
}, []);
```

- [ ] **Step 2: Verify the app still boots cleanly**

Run: `npm run dev` (or `npm run build` if a dev server isn't practical in this environment), confirm no console errors related to this new effect. If a dev server can be started, click through to confirm the app loads normally.

- [ ] **Step 3: Run the existing App-level test suite**

Run: `npx vitest run src/test/appLazyImports.test.js --no-file-parallelism` (or whatever test file covers `App.tsx`'s boot effects, if one asserts on the list of boot `useEffect`s — check `src/test/` for an existing App boot-effects test before assuming none exists)
Expected: PASS, no regressions.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(calle): wire recoverInterruptedOutreachCalls into its own boot effect"
```

---

## Task 5: `CalleOutreachPanel.tsx` — basic, functional UI

**Files:**
- Create: `src/components/calle/CalleOutreachPanel.tsx`
- Test: `src/test/components/calle/CalleOutreachPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/test/components/calle/CalleOutreachPanel.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockCreateOutreachDraft = vi.fn();
const mockDismissOutreachCall = vi.fn();
const mockListOutreachCalls = vi.fn();
const mockRunOutreachCall = vi.fn();
vi.mock('../../../services/calleOutreachService', () => ({
  createOutreachDraft: (...args: unknown[]) => mockCreateOutreachDraft(...args),
  dismissOutreachCall: (...args: unknown[]) => mockDismissOutreachCall(...args),
  listOutreachCalls: (...args: unknown[]) => mockListOutreachCalls(...args),
  runOutreachCall: (...args: unknown[]) => mockRunOutreachCall(...args)
}));

const mockIsCalleConfigured = vi.fn(() => true);
vi.mock('../../../services/connectors/calleConnector', () => ({
  isCalleConfigured: (...args: unknown[]) => mockIsCalleConfigured(...args)
}));

import { CalleOutreachPanel } from '../../../components/calle/CalleOutreachPanel';

beforeEach(() => {
  vi.clearAllMocks();
  mockIsCalleConfigured.mockReturnValue(true);
  mockListOutreachCalls.mockReturnValue([]);
});

describe('CalleOutreachPanel', () => {
  it('disables Submit when CALL-E is not configured', () => {
    mockIsCalleConfigured.mockReturnValue(false);
    render(<CalleOutreachPanel />);
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
  });

  it('rejects an invalid phone number before allowing submit', () => {
    render(<CalleOutreachPanel />);
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: 'not-a-phone' } });
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
  });

  it('calls createOutreachDraft on submit with a valid phone', () => {
    mockCreateOutreachDraft.mockReturnValue({ id: 'r1', businessName: 'Joe\'s Pizza', phone: '+15550123456', status: 'pending_approval', policyBlockKind: 'needs_approval_click' });
    render(<CalleOutreachPanel />);
    fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: "Joe's Pizza" } });
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '+15550123456' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(mockCreateOutreachDraft).toHaveBeenCalledWith(expect.objectContaining({ businessName: "Joe's Pizza", phone: '+15550123456' }));
  });

  it('shows the Approve & Place Call action for a pending_approval record needing a click', () => {
    mockListOutreachCalls.mockReturnValue([{ id: 'r1', businessName: 'Joe\'s Pizza', phone: '+15550123456', status: 'pending_approval', policyBlockKind: 'needs_approval_click' }]);
    render(<CalleOutreachPanel />);
    expect(screen.getByRole('button', { name: /approve.*place call/i })).toBeTruthy();
  });

  it('shows Settings-change guidance instead of Approve for a zero_cost_mode block', () => {
    mockListOutreachCalls.mockReturnValue([{ id: 'r1', businessName: 'Joe\'s Pizza', phone: '+15550123456', status: 'pending_approval', policyBlockKind: 'zero_cost_mode' }]);
    render(<CalleOutreachPanel />);
    expect(screen.queryByRole('button', { name: /approve.*place call/i })).toBeNull();
    expect(screen.getByText(/zero-cost mode/i)).toBeTruthy();
  });

  it('calls runOutreachCall with approved: true when Approve & Place Call is clicked', async () => {
    mockListOutreachCalls.mockReturnValue([{ id: 'r1', businessName: 'Joe\'s Pizza', phone: '+15550123456', status: 'pending_approval', policyBlockKind: 'needs_approval_click' }]);
    mockRunOutreachCall.mockResolvedValue({ id: 'r1', status: 'queued' });
    render(<CalleOutreachPanel />);
    fireEvent.click(screen.getByRole('button', { name: /approve.*place call/i }));

    await waitFor(() => expect(mockRunOutreachCall).toHaveBeenCalledWith('r1', { approved: true }));
  });

  it('shows a Dismiss action for a blocked/failed record and calls dismissOutreachCall', () => {
    mockListOutreachCalls.mockReturnValue([{ id: 'r1', businessName: 'Joe\'s Pizza', phone: '+15550123456', status: 'failed_to_start', policyBlockKind: null, error: 'boom' }]);
    render(<CalleOutreachPanel />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(mockDismissOutreachCall).toHaveBeenCalledWith('r1');
  });

  it('renders the structured result and summary once a record is completed', () => {
    mockListOutreachCalls.mockReturnValue([{ id: 'r1', businessName: 'Joe\'s Pizza', phone: '+15550123456', status: 'completed', structuredResult: { interested_in_website: 'yes' }, summary: 'They are interested.' }]);
    render(<CalleOutreachPanel />);
    expect(screen.getByText('They are interested.')).toBeTruthy();
  });

  it('renders past records in a history list', () => {
    mockListOutreachCalls.mockReturnValue([
      { id: 'r1', businessName: 'Joe\'s Pizza', phone: '+15550123456', status: 'completed' },
      { id: 'r2', businessName: 'Ann\'s Bakery', phone: '+15550987654', status: 'failed_to_start' }
    ]);
    render(<CalleOutreachPanel />);
    expect(screen.getByText("Joe's Pizza")).toBeTruthy();
    expect(screen.getByText("Ann's Bakery")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/components/calle/CalleOutreachPanel.test.tsx --no-file-parallelism`
Expected: FAIL — `src/components/calle/CalleOutreachPanel.tsx` doesn't exist yet.

- [ ] **Step 3: Implement the panel**

Create `src/components/calle/CalleOutreachPanel.tsx`. Use `Card`, `CardHeader`, `CardContent`, `Button`, `Badge`, `StatusDot`, `Input`, `EmptyState` from `../ui` (the barrel import, per CLAUDE.md's UI primitive kit convention — do not import individual files). Structure:

```tsx
import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardContent, Button, Badge, StatusDot, Input, EmptyState } from '../ui';
import {
  createOutreachDraft,
  dismissOutreachCall,
  listOutreachCalls,
  runOutreachCall,
  ESTIMATED_COST_USD,
  type OutreachCallRecord
} from '../../services/calleOutreachService';
import { isCalleConfigured } from '../../services/connectors/calleConnector';

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

const STATUS_TO_DOT: Record<string, 'online' | 'offline' | 'pending' | 'error' | 'warning'> = {
  completed: 'online',
  failed: 'error',
  failed_to_start: 'error',
  canceled: 'offline',
  dismissed: 'offline',
  queued: 'pending',
  in_progress: 'pending',
  pending_approval: 'warning'
};

const POLICY_BLOCK_COPY: Record<string, string> = {
  zero_cost_mode: 'Blocked by Zero-Cost Mode. Change this in Settings before this call can be approved.',
  license_tier: 'This connector requires a Pro license. Upgrade in Settings.',
  needs_approval_click: ''
};

export function CalleOutreachPanel(): React.JSX.Element {
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [taskType, setTaskType] = useState<'outreach' | 'custom'>('outreach');
  const [customTask, setCustomTask] = useState('');
  const [records, setRecords] = useState<OutreachCallRecord[]>(() => listOutreachCalls());

  useEffect(() => {
    const interval = setInterval(() => setRecords(listOutreachCalls()), 5000);
    return () => clearInterval(interval);
  }, []);

  const configured = isCalleConfigured();
  const phoneValid = E164_PATTERN.test(phone);
  const hasNonTerminalForPhone = records.some(
    (r) => r.phone === phone && ['pending_approval', 'queued', 'in_progress'].includes(r.status)
  );
  const canSubmit = configured && phoneValid && businessName.trim().length > 0 && !hasNonTerminalForPhone;

  const handleSubmit = () => {
    createOutreachDraft({ businessName: businessName.trim(), phone, taskType, task: taskType === 'custom' ? customTask : '' });
    setRecords(listOutreachCalls());
    setBusinessName('');
    setPhone('');
    setCustomTask('');
  };

  const handleApprove = async (recordId: string) => {
    await runOutreachCall(recordId, { approved: true });
    setRecords(listOutreachCalls());
  };

  const handleDismiss = (recordId: string) => {
    dismissOutreachCall(recordId);
    setRecords(listOutreachCalls());
  };

  return (
    <Card>
      <CardHeader>CALL-E Outreach</CardHeader>
      <CardContent>
        <div className="space-y-3">
          <Input aria-label="Business name" placeholder="Business name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          <Input aria-label="Phone" placeholder="+15550123456" value={phone} onChange={(e) => setPhone(e.target.value)} />
          {hasNonTerminalForPhone && (
            <div className="text-xs text-amber-400">An outreach call for this number is already in progress.</div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setTaskType('outreach')} className={taskType === 'outreach' ? 'font-bold' : ''}>Outreach</button>
            <button type="button" onClick={() => setTaskType('custom')} className={taskType === 'custom' ? 'font-bold' : ''}>Custom</button>
          </div>
          {taskType === 'custom' && (
            <Input aria-label="Custom task" placeholder="Describe the call task" value={customTask} onChange={(e) => setCustomTask(e.target.value)} />
          )}
          <Button onClick={handleSubmit} disabled={!canSubmit}>Submit</Button>

          {records.length === 0 ? (
            <EmptyState message="No outreach calls yet." />
          ) : (
            <div className="space-y-2">
              {records.map((record) => (
                <div key={record.id} className="border rounded p-2">
                  <div className="flex items-center gap-2">
                    <StatusDot status={STATUS_TO_DOT[record.status] ?? 'offline'} />
                    <span>{record.businessName}</span>
                    <Badge>{record.status}</Badge>
                  </div>
                  {record.status === 'pending_approval' && record.policyBlockKind && record.policyBlockKind !== 'needs_approval_click' && (
                    <div className="text-xs text-amber-400">{POLICY_BLOCK_COPY[record.policyBlockKind]}</div>
                  )}
                  {record.status === 'pending_approval' && (!record.policyBlockKind || record.policyBlockKind === 'needs_approval_click') && (
                    <>
                      <div className="text-xs text-[--text-3]">Calling {record.phone} — est. ${ESTIMATED_COST_USD.toFixed(2)}: "{record.task}"</div>
                      <Button onClick={() => handleApprove(record.id)}>Approve & Place Call</Button>
                    </>
                  )}
                  {['pending_approval', 'failed_to_start', 'failed', 'canceled'].includes(record.status) && (
                    <Button onClick={() => handleDismiss(record.id)}>Dismiss</Button>
                  )}
                  {record.summary && <p className="text-sm">{record.summary}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

Adjust prop names (`aria-label` support on `Input`, `Badge`'s children API, etc.) to match this repo's actual `ui/` primitive signatures — read `src/components/ui/Input.tsx` and `src/components/ui/Badge.tsx` before finalizing, since this plan's sketch may not match their exact prop names.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/test/components/calle/CalleOutreachPanel.test.tsx --no-file-parallelism`
Expected: PASS (all tests). Adjust the component's markup/queries to match if any `getByRole`/`getByLabelText` selectors don't line up with the real primitives' rendered output.

- [ ] **Step 5: Run typecheck and lint**

Run: `npx tsc --noEmit`
Run: `npm run lint`
Expected: 0 errors both.

- [ ] **Step 6: Commit**

```bash
git add src/components/calle/CalleOutreachPanel.tsx src/test/components/calle/CalleOutreachPanel.test.tsx
git commit -m "feat(calle): add basic functional outreach panel using existing ui primitives"
```

---

## Task 6: Wire the panel into the Dashboard

**Files:**
- Modify: whichever component renders the Dashboard's quick-launch cards (search for `HectorResearchDesk` usage — likely `src/components/Dashboard.tsx` or similar; confirm the exact file with `grep -rl HectorResearchDesk src/components/` before editing)

- [ ] **Step 1: Find the exact Dashboard wiring pattern**

Run: `grep -n "HectorResearchDesk" src/components/*.tsx src/components/**/*.tsx` to find where it's lazy-imported and rendered as a quick-launch card. Follow that exact pattern (lazy import + named-export mapping, per `appLazyImports.test.js`'s enforced convention) for `CalleOutreachPanel`.

- [ ] **Step 2: Add the lazy import and card entry**

Mirror `HectorResearchDesk`'s lazy-import line and quick-launch card JSX exactly, substituting `CalleOutreachPanel`.

- [ ] **Step 3: Run the App lazy-imports regression test**

Run: `npx vitest run src/test/appLazyImports.test.js --no-file-parallelism`
Expected: PASS — confirms the new lazy import's export shape matches what the loader expects.

- [ ] **Step 4: Manual smoke check**

Start the dev server (`npm run dev`), navigate to the Dashboard, confirm the new CALL-E quick-launch card renders and opens the panel without console errors. If a dev server can't be exercised in this environment, note that explicitly rather than claiming it was verified.

- [ ] **Step 5: Commit**

```bash
git add <the modified dashboard file>
git commit -m "feat(calle): add CALL-E outreach quick-launch card to Dashboard"
```

---

## Task 7: Update CLAUDE.md's "Do Not Duplicate" table

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a row**

Per this repo's CI-enforced `verify:dnd-coverage` check (found the hard way in this same session on PR #227), every new service/component needs an entry. Add a row documenting: `calleConnector.ts`, `calleOutreachService.ts`, `CalleOutreachPanel.tsx` — one row is sufficient if it covers all three files, matching the style of other multi-file subsystem rows (e.g. the "Hector Research Desk subsystem" row).

- [ ] **Step 2: Verify**

Run: `npm run verify:dnd-coverage`
Expected: `[verify-dnd-coverage] All components and services are fully documented in CLAUDE.md. ✓`

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add CALL-E outreach connector to CLAUDE.md's Do Not Duplicate table"
```

---

## Task 8: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full targeted test run**

Run: `npx vitest run src/test/connectors/calleConnector.test.ts src/test/services/calleOutreachService.test.ts src/test/policyEnforcementService.test.ts src/test/components/calle/CalleOutreachPanel.test.tsx src/test/appLazyImports.test.js --no-file-parallelism --testTimeout=60000 --hookTimeout=60000`
Expected: PASS, 0 failures.

- [ ] **Step 2: Typecheck, lint, doc-count and dnd-coverage checks**

Run: `npx tsc --noEmit`
Run: `npm run lint`
Run: `npm run verify:docs`
Run: `npm run verify:dnd-coverage`
Expected: all clean.

- [ ] **Step 3: Confirm no accidental Jose/Marcus pipeline coupling**

Run: `grep -rn "calle" src/services/marcusExecutionService.ts src/services/joseExecutionEngineService.ts src/services/agentBusService.ts`
Expected: no output (empty) — confirms this connector genuinely has no dependency on those three files, per the spec's Architecture section.

- [ ] **Step 4: Live smoke test (not automatable — flag explicitly if skipped)**

With a real `CALLE_API_KEY` (from `dashboard.heycall-e.com/account/api-keys`), place one real outbound call to a real, consenting phone number end-to-end through the panel: Submit → Approve & Place Call → observe status transitions → confirm a structured result and transcript appear. This is the "code-complete-but-live-unverified" gap the design spec calls out explicitly — do not claim this integration works end-to-end until this step actually happens. If this step is skipped in a given session, say so plainly rather than letting the prior automated-test pass imply it.

- [ ] **Step 5: Final commit (if any cleanup was needed in Steps 2-4)**
