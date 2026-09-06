# CALL-E Outreach Connector — Design Spec

## Context

The owner is considering entering the "CALL-E: Your Code Is Calling" Devpost
hackathon (`call-e.devpost.com`, submission deadline **2026-09-14** — an
~8-day window from when this design started, 2026-09-06). CALL-E
(`heycall-e.com`) is an AI voice-agent platform: you give it a natural-language
task and a phone number, and it places a real outbound phone call, adapts in
conversation, and returns a structured result.

This spec covers integrating CALL-E into AlphonsoEcosystem as a new connector,
scoped to a single concrete demo scenario: **calling a business to gauge
interest in an updated website, and/or to book an appointment for the owner to
see a demo website Alphonso has already built for them.**

Full logged context and the fit/timeline assessment live in
`docs/TRUTH_FIRST_EXECUTION_PLAN.md` §J3.

## Non-goals (explicitly out of scope for this pass)

- **No webhook receiver.** CALL-E supports async delivery via a webhook POST
  to a URL you provide, but Alphonso is a desktop app with no public server.
  This design uses polling (`GET /v1/calls/{id}` until terminal) instead.
  Standing up a public webhook relay (mirroring `gateway/whatsapp-cloud`'s
  pattern) is a possible future addition, not this pass.
- **No final UI placement decision.** The panel this spec adds is placed as a
  Dashboard quick-launch card for now (same low-commitment slot
  `HectorResearchDesk` uses). A separate, parallel UI redesign effort is in
  progress on its own branch/worktree; once that lands and a final navigation
  home is chosen, this panel gets restyled and possibly relocated. This spec
  explicitly does not block on that work landing first — the deadline risk of
  waiting was raised and rejected in favor of building now.
- **No `@call-e/calle` npm SDK dependency.** Every existing Alphonso connector
  (GitHub, Slack, Discord, Tavily, etc.) talks to its provider via plain
  `fetch()` against a documented REST API, not the provider's own SDK. CALL-E's
  REST API is fully documented via their public OpenAPI spec
  (`docs.heycall-e.com/openapi/calle.openapi.yaml`), so this follows the same
  convention rather than introducing a new package.
- **No changes to CALL-E's MCP/OAuth broker path** (`@call-e/core`,
  `packages/core` in their `call-e-integrations` repo). That path is for
  OAuth-brokered MCP clients (Claude Code, Codex, Cursor); Alphonso is a
  standalone app authenticating with a plain API key, which is the simpler
  "Developer API" path CALL-E's own docs describe.

## Architecture

Five pieces, following existing conventions exactly — no new patterns invented:

```
User (via panel) → CalleOutreachPanel.tsx
                       │ submit
                       ▼
              calleOutreachService.ts ──creates local record──► localStorage
                       │ dispatches through Marcus
                       ▼
              marcusExecutionService.ts (new executor + distribution target)
                       │
                       ▼
              calleConnector.ts ──fetch()──► https://api.heycall-e.com/v1/calls
                       │ poll until terminal
                       ▼
              calleOutreachService.ts updates the local record with the result
                       │
                       ▼
              CalleOutreachPanel.tsx re-renders (status + structured result)
```

### 1. `src/services/connectors/calleConnector.ts` — raw API client

Plain-`fetch` client, matching `discordConnector.ts`'s shape (policy gate
check inside each request function, typed request/response interfaces, no
SDK dependency).

```ts
const CALLE_API_BASE = 'https://api.heycall-e.com';

export interface CalleRecipient {
  phones: string[];
  locale?: string;
  region?: string;
}

export interface CalleCreateCallRequest {
  task: string;
  recipients?: CalleRecipient[];
  resultSchema?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export type CalleCallStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'canceled';

export interface CalleCallTask {
  id: string;
  object: 'call_task';
  status: CalleCallStatus;
  task: string;
  recipients: Array<{
    id: string;
    phones: string[];
    status: string;
    structuredResult: Record<string, unknown> | null;
    summary: string | null;
  }>;
  structuredResult: Record<string, unknown> | null;
  summary: string | null;
  taskCompleted: boolean | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

async function calleRequest(method: string, path: string, apiKey: string, body?: Record<string, unknown>, approved = false): Promise<any> {
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

  const response = await fetch(`${CALLE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
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

// createCall is the only request that actually places a phone call, so it's
// the only one that needs `approved` threaded through -- getCall/polling are
// read-only status checks and are never gated (matches the pattern: only
// external_call, the write action, is in HIGH_RISK_ACTION_PATTERNS' spirit).
export async function createCall(apiKey: string, request: CalleCreateCallRequest, options: { approved?: boolean } = {}): Promise<CalleCallTask> {
  return calleRequest('POST', '/v1/calls', apiKey, request, options.approved ?? false);
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

### 2. `src/services/calleOutreachService.ts` — call-record persistence

Mirrors `hectorResearchService.js`'s draft/report pattern (localStorage-backed
rows, `listX`/`createX` functions), so the panel has something to read for
its history list.

```ts
const CALLE_OUTREACH_KEY = 'alphonso_calle_outreach_v1';

export interface OutreachCallRecord {
  id: string;
  businessName: string;
  phone: string;
  taskType: 'website_enquiry' | 'book_appointment' | 'custom';
  task: string;
  status: CalleCallStatus | 'pending_approval' | 'failed_to_start';
  calleCallId: string | null;
  structuredResult: Record<string, unknown> | null;
  summary: string | null;
  transcriptAvailable: boolean;
  createdAtMs: number;
  completedAtMs: number | null;
  error: string | null;
}

export function listOutreachCalls(): OutreachCallRecord[] { /* readRows(CALLE_OUTREACH_KEY) */ }

export function createOutreachDraft({ businessName, phone, taskType, task }: {
  businessName: string; phone: string; taskType: OutreachCallRecord['taskType']; task: string;
}): OutreachCallRecord { /* pushes a 'pending_approval' record, returns it */ }

// Called by marcusExecutionService.ts once the panel's "Approve & Place Call"
// step passes approved: true. Without it, createCall's own evaluatePolicyGate
// check blocks before anything is sent to CALL-E -- this function does not
// duplicate that gate, it just threads the flag through.
export async function runOutreachCall(recordId: string, options: { approved?: boolean; onProgress?: (record: OutreachCallRecord) => void } = {}): Promise<OutreachCallRecord> {
  // 1. look up the draft record
  // 2. build the CALL-E resultSchema for the record's taskType (see below)
  // 3. calleConnector.createCall(apiKey, request, { approved: options.approved }) -> update record to 'queued'/'in_progress', options.onProgress
  //    - on policy-gate block (thrown Error), leave record as 'pending_approval' with the block reason, do not treat as a hard failure
  // 4. calleConnector.pollCallUntilTerminal(...) -> update record with final status/result
  // 5. persist + return
}
```

**Result schema per `taskType`:**

```ts
const WEBSITE_ENQUIRY_SCHEMA = {
  type: 'object',
  required: ['interested_in_website'],
  properties: {
    interested_in_website: { type: 'string', enum: ['yes', 'no', 'unknown'] },
    wants_demo_appointment: { type: 'boolean' },
    appointment_time: { type: ['string', 'null'] },
    notes: { type: 'string' }
  }
};

const BOOK_APPOINTMENT_SCHEMA = {
  type: 'object',
  required: ['appointment_booked'],
  properties: {
    appointment_booked: { type: 'boolean' },
    appointment_time: { type: ['string', 'null'] },
    notes: { type: 'string' }
  }
};
```

`taskType: 'custom'` sends no `resultSchema` (free-text `summary` only).

### 3. Marcus wiring — `src/services/marcusExecutionService.ts`

New executor, same shape as `executeMarcusSlackAction`:

```ts
export async function executeMarcusCalleOutreachAction(commandText: string, assignment: Assignment, options: Record<string, unknown> = {}): Promise<ExecutionResult> {
  const apiKey = getConnectorCredential('calle', 'CALLE_API_KEY') as string | null;
  const auth = isConnectorAuthenticated('calle') as { ok: boolean };
  if (!auth.ok || !apiKey) {
    return { ok: false, error: 'CALL-E connector not authenticated. Add CALLE_API_KEY in Connector Setup.', setupRequired: true };
  }
  const payload = assignment?.payload || {};
  const recordId = payload.outreachRecordId as string;
  const approved = Boolean(payload.approved || options.approved);
  if (!recordId) {
    return { ok: false, error: 'No outreach call record to execute.' };
  }
  try {
    const record = await runOutreachCall(recordId, { approved });
    if (record.status === 'pending_approval') {
      return { ok: false, error: 'Approval Mode requires explicit approval for this action.', setupRequired: false };
    }
    return { ok: true, type: 'calle_outreach_call', recordId: record.id, status: record.status, structuredResult: record.structuredResult };
  } catch (error: unknown) {
    return { ok: false, error: String((error as Error)?.message || error) };
  }
}
```

`selectDistributionTarget` gains a `'calle'` branch (matched on an action
type like `external_call`), and `runMarcusDistribution` gains a matching
`else if (target.type === 'calle')` dispatch — same shape as the existing
`github`/`slack` branches, nothing new invented.

### 4. Policy, registry, credentials

- **`policyEnforcementService.ts`**: add `'calle'` to `PAID_OR_METERED_CONNECTORS`
  (real $0.05/call cost, confirmed from CALL-E's pricing page). Add `calle`
  to `classifyConnectorRisk`'s unconditional-high-risk branch, alongside
  `telegram`/`whatsapp`/`hermes_agents` — every single call *is* the
  real-world action (there's no "safe" action type for this connector, unlike
  e.g. GitHub where only `publish`/`upload` actions are risky). Add
  `/external_call/i` to `HIGH_RISK_ACTION_PATTERNS`.
- **`connectorRegistry.js`**: new entry in `DEFAULT_CONNECTORS`:
  ```js
  {
    id: 'calle',
    name: 'CALL-E',
    status: 'not_configured',
    transport: 'calle_api',
    requiredEnv: ['CALLE_API_KEY'],
    permissions: ['place_outbound_call'],
    disabledReason: 'CALLE_API_KEY not configured.'
  }
  ```
- **`ConnectorSetupPanel.tsx`**: new credential section, one field
  (`CALLE_API_KEY`), saved via the existing `saveConnectorCredential()` path
  every other connector uses.
- **Approval gate — traced and confirmed, not a new mechanism.** The real,
  universal gate lives inside `evaluatePolicyGate()`
  (`policyEnforcementService.ts`): `if (policy.approvalMode && (requiresApproval
  || riskLevel === 'high') && !approved) return { ok: false, blocked: true,
  reason: 'Approval Mode requires explicit approval for this action.' }`.
  Because `calle` is classified unconditionally `'high'` risk (above), this
  blocks **every** call by default — `calleRequest()` already calls
  `evaluatePolicyGate` before hitting the network (same as
  `discordConnector.ts`'s pattern) and throws on a block, which
  `executeMarcusCalleOutreachAction`'s try/catch turns into `{ ok: false,
  error: gate.reason }`. No second approval mechanism is invented: the panel's
  "Approve & Place Call" button (distinct from the initial "Submit" step,
  matching `HectorResearchDesk`'s existing confirm-step pattern) is what
  actually threads `approved: true` down through `runOutreachCall(recordId, {
  approved: true })` → `executeMarcusCalleOutreachAction` →
  `calleConnector.createCall(apiKey, request, { approved: true })` on retry.
  Until that explicit second step, the call is created as a local
  `pending_approval` record only — nothing is ever sent to CALL-E's API
  without it.

### 5. `src/components/calle/CalleOutreachPanel.tsx` — basic, functional UI

Built with **today's existing `ui/` primitives** (`Card`, `CardHeader`,
`CardContent`, `Button`, `Badge`, `StatusDot`, `Input`, `EmptyState`) — not the
in-progress UI redesign's new design system. Explicitly interim: functional
now, restyled once the redesign lands and a final placement is chosen.

- **Form**: business name, phone (E.164, with basic format validation),
  task-type toggle (Website Enquiry / Book Appointment / Custom — custom
  reveals a free-text task field), Submit button.
- **On submit**: calls `createOutreachDraft(...)`, which creates a
  `pending_approval` record and routes it through Marcus/the existing
  approval flow (per §4) — the panel does not call `calleConnector` directly.
- **Live status card**: while a call is in flight, shows a `StatusDot` +
  status label (`queued`/`in_progress`), polling `listOutreachCalls()` on an
  interval (matching `OrchestratorQueueView.tsx`'s existing 5s-refresh
  pattern) to reflect the background poll happening in
  `calleOutreachService.ts`.
- **Result card**: once terminal, shows the structured result fields, the
  human-readable `summary`, and a link/expander for the transcript if
  present.
- **History list**: below, a simple list of past `OutreachCallRecord`s
  (business name, status badge, timestamp, click to re-expand its result) —
  same shape as `HectorResearchDesk`'s report list.
- **Placement**: a new quick-launch card on the main Dashboard (matching
  `HectorResearchDesk`'s existing slot pattern), not a new sidebar item —
  reversible, low-commitment, easy to relocate later.

## Error handling

- Missing/invalid API key: `isCalleConfigured()` gates the panel's Submit
  button (disabled + setup hint), matching every other connector's pattern.
- Policy gate block (Zero-Cost Mode, Approval Mode, license tier): the record
  is created but never dispatched; the panel shows the block reason inline
  (matching `ApprovalPanel`'s existing block-reason display).
- CALL-E API error (4xx/5xx) or poll timeout: record moves to a `failed`-like
  state with `error` populated; panel shows it distinctly (red state, matching
  `ResearchReportPanel.tsx`'s failed-source styling) with no silent retry.
- Network failure mid-poll: `pollCallUntilTerminal` lets the exception
  propagate; `runOutreachCall` catches it, sets `error`, and the record is
  left in whatever status was last successfully observed (not silently marked
  complete).

## Testing

Following this repo's existing connector test conventions
(`discordConnector.test.js`-shaped): mock `global.fetch`, assert on the
constructed request (URL, method, headers, body), assert on parsed response
mapping, and assert the policy-gate check runs before every request.

- `src/test/connectors/calleConnector.test.ts` — `createCall`, `getCall`,
  `pollCallUntilTerminal` (including the terminal-status short-circuit and
  the timeout-throws case), `isCalleConfigured`.
- `src/test/services/calleOutreachService.test.ts` — `createOutreachDraft`,
  `runOutreachCall` (mocking `calleConnector`), the two result-schema
  builders, persistence round-trip via `listOutreachCalls`.
- `src/test/services/marcusExecutionService.test.ts` (existing file) — new
  `describe('executeMarcusCalleOutreachAction', ...)` block, plus a
  `selectDistributionTarget`/`runMarcusDistribution` case for the `'calle'`
  target, matching the existing GitHub/Slack test coverage in that file.
- `src/test/components/calle/CalleOutreachPanel.test.tsx` — form validation,
  submit dispatches `createOutreachDraft`, status card reflects record state,
  history list renders past records, disabled-when-unconfigured state.

## What this does not fix / build

- No webhook receiver (see Non-goals).
- No final UI placement/redesign integration (see Non-goals) — this panel is
  explicitly a placeholder shell, not the polished demo-ready surface; a
  follow-up pass restyles it once the redesign lands.
- No handling of CALL-E's batch/scheduled-calling capabilities, IVR
  navigation details, or the "Goals"/`v1/goals` endpoints (not needed for the
  single-call outreach scenario this spec targets).
- No live-tested real phone call yet — this spec and the resulting
  implementation are code-complete-but-live-unverified until a real
  `CALLE_API_KEY` is used to place an actual call against a real phone number,
  which should happen before recording the hackathon demo video.
