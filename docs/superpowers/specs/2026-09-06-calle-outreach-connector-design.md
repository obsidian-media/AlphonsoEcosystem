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

## Architecture — revised after self-critique

**The first version of this spec wired execution through Jose's
assignment/wave pipeline (`selectDistributionTarget`/`runMarcusDistribution`
in `marcusExecutionService.ts`). That was wrong on two counts, caught in
self-review before any code was written:**

1. The panel is a **direct form submission**, not a chat command Jose
   classifies into an assignment — there was no real path from "user fills in
   a form" to "Jose assignment with the right `actionType`/`payload`," and
   inventing one would have been unscoped extra work for a trigger path the
   MVP doesn't use.
2. Even if it did go through Jose, a real phone call plus its poll-to-terminal
   wait can take **up to ~6 minutes** (a 60s initial delay CALL-E recommends,
   plus up to a 5-minute poll timeout). Jose's own pipeline has a **5-minute
   total wall-clock budget across every assignment in every wave**
   (`PIPELINE_MAX_DURATION_MS` in `joseExecutionEngineService.ts`). A single
   outreach call would blow through Jose's entire pipeline budget by itself —
   this is a long-running, human-timescale external operation, exactly the
   shape Jose's synchronous wave loop was never designed for.

**Revised design: the panel talks to `calleOutreachService.ts` directly.**
Marcus is kept only as a *narrative/attribution* label — the call shows up in
Marcus's agent activity log (`appendAgentActivity({ agent: 'marcus', ... })`),
matching his "approved outbound distribution actions" role — but nothing
routes through Jose's assignment pipeline. This removes an entire unscoped
integration surface and the budget conflict along with it.

**Second self-critique pass caught a related problem this didn't fully fix:**
removing the Jose dependency stops the *pipeline-budget* conflict, but it
doesn't answer *who holds the up-to-6-minute poll open*. If the panel's
"Approve & Place Call" button `await`s `runOutreachCall` end-to-end, a React
click handler holds an async chain open for up to 6 minutes — and if the
desktop app is closed during that window, the real call keeps running on
CALL-E's side (money spent, call placed) while Alphonso's in-memory poll dies
with the process, leaving the record stuck at `in_progress` forever with no
way to ever learn the outcome.

**Fix:** `runOutreachCall` only `await`s the fast part (`createCall`, which
returns in seconds once the call is accepted) and does **not** await
`pollCallUntilTerminal` — that poll is kicked off but left to run
independently; the panel discovers progress purely by re-reading
`listOutreachCalls()` on its own interval (already the plan), not by holding
open the original promise. This still doesn't survive the app being closed
mid-call, so a **boot-time recovery check** mirroring the existing
`recoverInterruptedExecutions()` pattern (`orchestrationQueueService.ts`,
already wired at app boot) is added: on startup, any `OutreachCallRecord`
left in `queued`/`in_progress` gets one `getCall` check against CALL-E's API
(which has its own durable state regardless of whether Alphonso was running)
to pick up a result that landed while the app was closed, rather than being
silently stuck forever. If that single check still shows a non-terminal
status, the record is left as-is (CALL-E is still working it) rather than
resuming a full poll loop — the user can re-open the panel to keep watching.

```
User (via panel) → CalleOutreachPanel.tsx
                       │ submit (creates a 'pending_approval' record)
                       ▼
              calleOutreachService.ts ──persists record──► localStorage
                       │
                       │ user clicks "Approve & Place Call"
                       ▼
              calleOutreachService.ts (runOutreachCall, approved: true)
                       │ appendAgentActivity({ agent: 'marcus', ... })
                       │ AWAITS createCall only (fast) -> record becomes 'queued'
                       ▼
              calleConnector.ts ──fetch()──► https://api.heycall-e.com/v1/calls
                       │ evaluatePolicyGate() runs first -- blocks here if
                       │ approved wasn't actually true (defense in depth)
                       ▼
              pollCallUntilTerminal kicked off WITHOUT being awaited by the
              caller -- runs independently, updates the record as it goes.
              CalleOutreachPanel.tsx never awaits this; it re-reads
              listOutreachCalls() on its own interval (matching
              OrchestratorQueueView.tsx's existing 5s-refresh pattern).
                       │
                       ▼
              calleOutreachService.ts updates the local record with the result
                       │
                       ▼
              On next app boot, any record still 'queued'/'in_progress' gets
              one getCall() recovery check (mirrors recoverInterruptedExecutions()).
```

### 1. `src/services/connectors/calleConnector.ts` — raw API client

Plain-`fetch` client, matching `discordConnector.ts`'s shape (policy gate
check inside each request function, typed request/response interfaces, no
SDK dependency).

```ts
const CALLE_API_BASE = 'https://api.heycall-e.com';

// No `recipients` field: that structure is for CALL-E's multi-recipient/batch
// dialing (out of scope, see Non-goals). For a single-recipient call, the
// phone number is embedded directly in the natural-language `task` string --
// this matches CALL-E's own quickstart example verbatim
// (`task: "Call +15550123456 and confirm tomorrow's 9am appointment."`)
// rather than inventing a second, untested code path through `recipients`.
export interface CalleCreateCallRequest {
  task: string;
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
  // structuredResult/summary/taskCompleted are read from these TASK-LEVEL
  // fields, not the per-recipient ones under `recipients[]` -- for a
  // single-recipient call the task-level fields are CALL-E's own rollup and
  // are what OutreachCallRecord actually stores (see calleOutreachService.ts
  // below). The per-recipient fields exist in the response but are unused by
  // this connector; documented here so a future batch-calling addition knows
  // where to look instead of guessing.
  structuredResult: Record<string, unknown> | null;
  summary: string | null;
  taskCompleted: boolean | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

async function calleRequest(method: string, path: string, apiKey: string, body?: Record<string, unknown>, approved = false, idempotencyKey?: string): Promise<any> {
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

// createCall is the only request that actually places a phone call, so it's
// the only one that needs `approved` threaded through -- getCall/polling are
// read-only status checks and are never gated (matches the pattern: only
// external_call, the write action, is in HIGH_RISK_ACTION_PATTERNS' spirit).
//
// `idempotencyKey` is REQUIRED, not optional -- CALL-E's API supports an
// Idempotency-Key header specifically to make retries safe. Without it, a
// double-click on "Approve & Place Call", or any error-handling retry, risks
// placing a duplicate real phone call to the same business. The caller
// (calleOutreachService.ts) generates one once per OutreachCallRecord and
// reuses it on every retry of that same record, never a fresh one per attempt.
export async function createCall(apiKey: string, request: CalleCreateCallRequest, idempotencyKey: string, options: { approved?: boolean } = {}): Promise<CalleCallTask> {
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
  // Fire an immediate 'queued' progress signal BEFORE the 60s delay below --
  // the original design left the panel showing nothing at all for a full
  // minute after submission, which is a bad look for a "live status card."
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

### 2. `src/services/calleOutreachService.ts` — call-record persistence

Mirrors `hectorResearchService.js`'s draft/report pattern (localStorage-backed
rows, `listX`/`createX` functions), so the panel has something to read for
its history list.

```ts
const CALLE_OUTREACH_KEY = 'alphonso_calle_outreach_v1';
// Best-effort estimate only, sourced from CALL-E's pricing page as of
// 2026-09-06 -- that page itself states pricing is "early-stage... subject
// to change." Shown in the approval prompt as an estimate, never presented
// as a guaranteed/contractual figure; re-check before the actual demo.
const ESTIMATED_COST_USD = 0.05;

// PolicyBlockKind distinguishes WHY a call is stuck in 'pending_approval' --
// the first pass conflated every block reason into one status, which would
// have told a Zero-Cost-Mode-blocked user to "click Approve again" when what
// they actually need is to go change a Settings toggle first.
export type PolicyBlockKind = 'needs_approval_click' | 'zero_cost_mode' | 'license_tier' | null;

export interface OutreachCallRecord {
  id: string;
  idempotencyKey: string; // generated once at draft time, reused on every retry -- never regenerated
  businessName: string;
  phone: string;
  taskType: 'outreach' | 'custom';
  task: string;
  status: CalleCallStatus | 'pending_approval' | 'failed_to_start' | 'dismissed';
  policyBlockKind: PolicyBlockKind;
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
}): OutreachCallRecord {
  // Duplicate-submission guard: if an existing record for the same `phone`
  // is not yet in a terminal-or-dismissed state (pending_approval/queued/
  // in_progress), return that record instead of creating a second one. The
  // panel checks this before showing the form as submittable for a given
  // phone number -- but see dismissOutreachCall below for the escape hatch,
  // since without one a record stuck in pending_approval (e.g. blocked by
  // Zero-Cost Mode until the user changes a Setting) would permanently lock
  // out that phone number with no way to abandon it.
  // ...generates a fresh idempotencyKey (e.g. `outreach_${generateId()}`),
  // pushes a 'pending_approval' record, returns it.
}

// Lets the user abandon a stuck/failed/blocked record so the duplicate-
// submission guard above doesn't permanently lock out that phone number.
// Does not cancel an in-flight CALL-E call (there's no cancel-call use case
// here); only clears the LOCAL record out of the way.
export function dismissOutreachCall(recordId: string): void { /* sets status: 'dismissed', persists */ }

// Called once the panel's "Approve & Place Call" step passes approved: true.
// Without it, createCall's own evaluatePolicyGate check blocks before
// anything is sent to CALL-E -- this function does not duplicate that gate,
// it just threads the flag through. Attributed to Marcus in the activity log
// (his "approved outbound distribution action" role) -- this is a narrative
// label only, NOT a dependency on Jose's assignment pipeline (see the
// Architecture section above for why that path was dropped).
//
// IMPORTANT: this function only AWAITS the fast part (createCall). It does
// NOT await pollCallUntilTerminal -- that promise is started and left to run
// independently (fire-and-forget from the caller's perspective), updating
// the persisted record as it progresses. The panel never awaits this
// function's full completion; it discovers progress by re-reading
// listOutreachCalls() on its own interval (see Section 5). This is the fix
// for the "who holds the 6-minute poll open" problem raised in the
// Architecture section above.
export async function runOutreachCall(recordId: string, options: { approved?: boolean } = {}): Promise<OutreachCallRecord> {
  // 1. look up the draft record (has its stable idempotencyKey already)
  // 2. build the single OUTREACH_RESULT_SCHEMA (see below) and interpolate
  //    record.phone directly into the task text if not already present
  // 3. appendAgentActivity({ agent: 'marcus', action: 'calle_outreach_call', detail: record.businessName })
  // 4. await calleConnector.createCall(apiKey, request, record.idempotencyKey, { approved: options.approved })
  //    -> update record to 'queued', persist, RETURN the updated record here
  //    - on policy-gate block (thrown Error), set status: 'pending_approval'
  //      and policyBlockKind from the gate's reason (zero_cost_mode /
  //      license_tier / needs_approval_click), persist, return -- do not
  //      treat as a hard failure
  // 5. (NOT awaited) calleConnector.pollCallUntilTerminal(...).then((call) => {
  //      update the record with final status/result, reading
  //      structuredResult/summary/taskCompleted from the TASK-LEVEL response
  //      fields (not recipients[].*, see calleConnector.ts), persist
  //    }).catch((error) => { set status: 'failed_to_start' or similar, error: String(error), persist })
}

// Boot-time recovery, mirroring orchestrationQueueService.ts's
// recoverInterruptedExecutions() pattern: any record left 'queued' or
// 'in_progress' from a prior app session gets ONE getCall() check against
// CALL-E's own durable server-side state, since the in-memory poll loop that
// was tracking it died when the app closed. If still non-terminal, the
// record is left as-is (CALL-E is still working it); the user reopening the
// panel resumes watching it via the normal listOutreachCalls() polling.
export async function recoverInterruptedOutreachCalls(): Promise<void> { /* ... */ }
```

**One unified result schema** — the demo scenario is a single compound task
("ask about website interest, *and/or* book a demo appointment"), not two
separate goals. The first version of this spec split this into two
overlapping schemas (`WEBSITE_ENQUIRY_SCHEMA` vs. a near-duplicate
`BOOK_APPOINTMENT_SCHEMA`) for no real reason — collapsed to one:

```ts
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
```

`taskType: 'outreach'` uses this schema with a default task template
("Call and ask if they'd be interested in an updated website; if so, offer to
book a time for the owner to see a demo we've already built."). `taskType:
'custom'` sends no `resultSchema` (free-text `summary` only) for anything
outside this one scenario.

### 3. Activity attribution — no Jose/Marcus pipeline dependency

Per the revised Architecture above, this connector has **no Marcus executor,
no distribution-target branch, no Jose assignment routing**. The only
"Marcus" touchpoint is a single `appendAgentActivity` call inside
`runOutreachCall` (shown in Section 2), so the call shows up in Marcus's
activity log with the same visual/narrative treatment as his GitHub/Slack
actions, without any of the three files that make up Jose's assignment
pipeline needing to know this connector exists. `marcusExecutionService.ts`,
`joseExecutionEngineService.ts`, and `agentBusService.ts` are untouched by
this spec.

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
  `runOutreachCall`'s try/catch (Section 2) turns into a `pending_approval`
  record with a `policyBlockKind` set from the gate's actual reason
  (`needs_approval_click` / `zero_cost_mode` / `license_tier`), not a hard
  failure and not one conflated status string — the panel needs to tell these
  apart because they require different user actions (click Approve again, vs.
  go change a Settings toggle, vs. upgrade tier).
  - **The panel's two-step Submit → separate "Approve & Place Call" flow is a
    deliberate extra safety layer, not just an artifact of following the
    gate.** Even if Approval Mode were somehow off, this connector still
    requires an explicit second click before `approved: true` is ever passed
    — no single form submission can place a real phone call outright. This is
    intentional given the "governed, careful outreach" narrative the
    integration is meant to demonstrate, and is worth calling out explicitly
    rather than leaving it as an implicit side effect of the UI shape.
  - No second approval *mechanism* is invented though: the panel's "Approve &
    Place Call" button is what actually threads `approved: true` down through
    `runOutreachCall(recordId, { approved: true })` →
    `calleConnector.createCall(apiKey, request, idempotencyKey, { approved:
    true })` on retry. Until that explicit second step, the call is created
    as a local `pending_approval` record only — nothing is ever sent to
    CALL-E's API without it. The approval prompt shown in the panel displays
    the estimated cost (`ESTIMATED_COST_USD`, Section 2 — an estimate only,
    see that constant's comment) alongside the business name/phone/task so
    the human approving it can see what they're authorizing, not just a bare
    confirm button.

### 5. `src/components/calle/CalleOutreachPanel.tsx` — basic, functional UI

Built with **today's existing `ui/` primitives** (`Card`, `CardHeader`,
`CardContent`, `Button`, `Badge`, `StatusDot`, `Input`, `EmptyState`) — not the
in-progress UI redesign's new design system. Explicitly interim: functional
now, restyled once the redesign lands and a final placement is chosen.

- **Form**: business name, phone (E.164 required — validated with a strict
  regex before Submit is enabled, since a malformed number risks placing a
  real call to the wrong stranger, not just an API error), task-type toggle
  (Outreach / Custom — custom reveals a free-text task field), Submit button.
  Submit is also disabled if an existing non-terminal record already exists
  for the same phone number (the duplicate-submission guard in
  `createOutreachDraft`, Section 2), with an inline note pointing at the
  existing record instead of silently doing nothing.
- **On submit**: calls `createOutreachDraft(...)` directly (Section 2), which
  creates a local `pending_approval` record. The panel calls
  `calleOutreachService` directly — no Jose/Marcus pipeline involved (see the
  revised Architecture section).
- **Approval step**: a distinct "Approve & Place Call" action (not the same
  click as Submit) shows the business name, phone, task, and estimated cost,
  then calls `runOutreachCall(recordId, { approved: true })`. Since that call
  only awaits the fast `createCall` step (Section 2), the button's own loading
  state resolves in seconds, not minutes — it does not sit disabled for the
  duration of the phone call.
- **Blocked-record messaging**: a record sitting in `pending_approval` shows
  different copy depending on `policyBlockKind` — `needs_approval_click`
  shows the Approve button as the next step; `zero_cost_mode` and
  `license_tier` instead show a message pointing at the relevant Settings
  toggle / upgrade link, since clicking Approve again would just re-hit the
  same gate. Every blocked/failed/dismissable record shows a "Dismiss" action
  (`dismissOutreachCall`, Section 2) so it never permanently locks the
  duplicate-submission guard against that phone number.
- **Live status card**: while a call is in flight, shows a `StatusDot` +
  status label (`queued`/`in_progress`), polling `listOutreachCalls()` on an
  interval (matching `OrchestratorQueueView.tsx`'s existing 5s-refresh
  pattern) to reflect the background poll happening independently in
  `calleOutreachService.ts` (not awaited by anything the panel itself holds
  open — see the Architecture section's fix for why).
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
  is created but never dispatched; `policyBlockKind` records which one, and
  the panel shows kind-specific guidance (see Section 5) rather than one
  generic "blocked" message.
- CALL-E API error (4xx/5xx) or poll timeout: record moves to a `failed`-like
  state with `error` populated; panel shows it distinctly (red state, matching
  `ResearchReportPanel.tsx`'s failed-source styling) with no silent retry, and
  offers Dismiss.
- Network failure mid-poll: `pollCallUntilTerminal`'s promise rejects;
  because `runOutreachCall` does not await it (Architecture section), the
  rejection is caught by the `.catch()` attached where it's kicked off, which
  sets `error` and leaves the record in whatever status was last successfully
  observed (not silently marked complete).
- App closed mid-call: covered by `recoverInterruptedOutreachCalls()`
  (Section 2), run once at boot — see the Architecture section for the full
  reasoning behind why this exists.

## Testing

Following this repo's existing connector test conventions
(`discordConnector.test.js`-shaped): mock `global.fetch`, assert on the
constructed request (URL, method, headers, body), assert on parsed response
mapping, and assert the policy-gate check runs before every request.

- `src/test/connectors/calleConnector.test.ts` — `createCall` (including
  asserting the `Idempotency-Key` header is set from the passed key,
  unchanged across repeat calls with the same key), `getCall`,
  `pollCallUntilTerminal` (including the immediate `onProgress({status:
  'queued'})` call before the 60s delay, the terminal-status short-circuit,
  and the timeout-throws case), `isCalleConfigured`.
- `src/test/services/calleOutreachService.test.ts` — `createOutreachDraft`
  (including the duplicate-submission guard and stable `idempotencyKey`
  generation), `dismissOutreachCall` (frees the phone number for a new
  draft afterward), `runOutreachCall` (mocking `calleConnector`, asserting:
  the same `idempotencyKey` is reused across a retry; the function's
  returned promise resolves as soon as `createCall` resolves, WITHOUT waiting
  for a mocked slow `pollCallUntilTerminal` to settle — this is the critical
  regression test proving the fire-and-forget fix actually works and doesn't
  silently regress back to blocking; each `policyBlockKind` value is set
  correctly for its corresponding gate-block reason), the result-schema
  builder, persistence round-trip via `listOutreachCalls`, the
  `appendAgentActivity({ agent: 'marcus', ... })` call, and
  `recoverInterruptedOutreachCalls` (a record left `in_progress` gets exactly
  one `getCall` check; a record already terminal is left untouched; a record
  still non-terminal after the check is left as `in_progress`, not re-polled
  in a loop).
- `src/test/components/calle/CalleOutreachPanel.test.tsx` — form validation,
  submit dispatches `createOutreachDraft`, duplicate-phone submission is
  blocked with a pointer to the existing record, the three `policyBlockKind`
  values each render their own distinct guidance copy (not one generic
  "blocked" message), Dismiss clears a record and re-enables submission for
  that phone number, status card reflects record state, history list renders
  past records, disabled-when-unconfigured state.

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
- **Implementation-plan reminder, not yet decided here**: `recoverInterruptedOutreachCalls()`
  needs a real boot-time call site. `App.tsx` already has one
  `recoverInterruptedExecutions()` call in a one-shot boot `useEffect` (see
  CLAUDE.md's "Crash-recovery checkpoint" row) — the implementation plan
  should confirm whether this new function is added to that same effect or
  needs its own, rather than inventing a second boot-recovery mechanism.
