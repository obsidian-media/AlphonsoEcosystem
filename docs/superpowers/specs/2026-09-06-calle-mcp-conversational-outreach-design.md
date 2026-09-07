# CALL-E MCP Conversational Outreach — Design (Phase 2)

## Context

Phase 1 (`docs/superpowers/specs/2026-09-06-calle-outreach-connector-design.md`, shipped on
`feat/calle-outreach-connector`) added a REST-based CALL-E connector: a form panel
(`CalleOutreachPanel.tsx`) where the user fills in a business name, phone number, and task,
then approves a real outbound call via `POST /v1/calls`.

Separately, the user asked to also integrate CALL-E's **MCP** surface
(`https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth`), which exposes three tools:
`plan_call` (asks clarifying questions if the call isn't fully specified, returns a
`plan_id`/`confirm_token` once it is), `run_call` (places the call — requires the exact
`plan_id`/`confirm_token`, **no idempotency mechanism**), and `get_call_run` (read-only
status polling). This was verified directly against CALL-E's own MCP docs, not assumed.

The motivation for adding MCP alongside the already-working REST connector (confirmed with
the user directly, not assumed): (1) `plan_call`'s clarifying-question loop is genuinely
useful for an *underspecified* request typed straight into chat (e.g. "call Joe's Pizza and
ask about their website" — no phone number, no explicit task text), which the REST panel
doesn't need since its form already collects every field upfront; (2) protocol consistency
with how the user's own coding-agent tooling already talks to CALL-E.

This document also draws directly on `@call-e/core` (`packages/core` of
`github.com/CALLE-AI/call-e-integrations`, MIT licensed), the shared runtime module the
official `calle` CLI itself uses for brokered auth and MCP calls — read from its installed
`node_modules` source during this design pass, not guessed. It confirms MCP tool calls and
the OAuth broker are both plain HTTP + `fetch` (JSON-RPC over HTTPS for MCP, plain REST for
the broker) — **no MCP SDK dependency is needed**, matching this repo's existing
zero-SDK-per-connector convention.

## Non-goals

- Not replacing the Phase 1 REST connector or its panel — both paths continue to exist,
  independently, hitting different CALL-E surfaces (`api.heycall-e.com` REST vs.
  `seleven-mcp-sg.airudder.com` MCP).
- Not adding `@modelcontextprotocol/sdk` or any other new npm dependency.
- Not building a general-purpose MCP-client transport for the connector registry. This is a
  single, CALL-E-specific integration; a generic MCP-client capability is a separate, larger
  design if it's ever needed for another service.
- Not attempting a full OAuth *redirect* flow with a local loopback server (the pattern
  `scripts/auth-youtube.mjs` uses). CALL-E's own broker flow is poll-based: open a login URL
  in any browser, then poll a pending-session endpoint until it's authorized. No local
  server is needed at all, which is simpler than the existing YouTube/Meta pattern.
- Not touching Jose's execution pipeline (`joseExecutionEngineService.ts`) or its 5-minute
  budget ceiling — this flow deliberately runs outside it, same reasoning as Phase 1.

## Architecture

### 1. `src/services/calleMcpAuthService.ts` (new)

A TypeScript port of `@call-e/core`'s `broker-client.js` logic, adapted from Node's
filesystem-based token cache to this app's `secureStorageService.ts`.

```ts
const BROKER_BASE_URL = 'https://seleven-mcp-sg.airudder.com';
const MCP_SERVER_URL = 'https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth';
const TOKEN_STORAGE_KEY = 'CALLE_MCP_TOKEN';

interface CalleMcpTokenDocument {
  accessToken: string;
  expiresAt: string | null; // ISO string, or null if the broker gave no expiry
}

interface CallePendingLogin {
  sessionId: string;
  sessionSecret: string;
  loginUrl: string;
  status: 'PENDING' | 'AUTHORIZED' | 'EXPIRED' | 'FAILED' | 'EXCHANGED';
  pollAfterMs: number | null;
}

export async function startBrokerLogin(): Promise<CallePendingLogin> {
  const response = await fetch(`${BROKER_BASE_URL}/api/v1/openagent-auth/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      server_url: MCP_SERVER_URL,
      channel: 'openagent_oauth',
      scope: 'openid email profile',
      client_name: 'Alphonso'
    })
  });
  if (!response.ok) throw new Error(`CALL-E login session create failed: HTTP ${response.status}`);
  const payload = await response.json();
  return {
    sessionId: String(payload.session_id),
    sessionSecret: String(payload.session_secret),
    loginUrl: String(payload.login_url),
    status: 'PENDING',
    pollAfterMs: Number(payload.poll_after_ms || 2000) || 2000
  };
}

const SESSION_SECRET_HEADER = 'X-OpenAgent-Session-Secret'; // from @call-e/core/lib/constants.js

async function getBrokerSessionStatus(pending: CallePendingLogin): Promise<{ status: string; poll_after_ms?: number; error_message?: string }> {
  const response = await fetch(`${BROKER_BASE_URL}/api/v1/openagent-auth/sessions/${pending.sessionId}`, {
    headers: { [SESSION_SECRET_HEADER]: pending.sessionSecret }
  });
  if (!response.ok) throw new Error(`CALL-E login status check failed: HTTP ${response.status}`);
  return response.json();
}

async function exchangeBrokerSession(pending: CallePendingLogin): Promise<{ access_token: string; expires_at?: string }> {
  const response = await fetch(`${BROKER_BASE_URL}/api/v1/openagent-auth/sessions/${pending.sessionId}/exchange`, {
    method: 'POST',
    headers: { [SESSION_SECRET_HEADER]: pending.sessionSecret }
  });
  if (!response.ok) throw new Error(`CALL-E login exchange failed: HTTP ${response.status}`);
  const body = await response.json();
  return { access_token: String(body.access_token), expires_at: body.expires_at ? String(body.expires_at) : undefined };
}

// Called repeatedly (e.g. every 2-10s, capped) by the Settings UI while the
// login card is open, after the user has confirmed they completed the browser
// step. Returns 'pending' | 'authorized' | 'failed'.
export async function pollBrokerLogin(pending: CallePendingLogin): Promise<'pending' | 'authorized' | 'failed'> {
  const status = await getBrokerSessionStatus(pending);
  const normalized = String(status.status || '').toUpperCase();
  if (normalized === 'AUTHORIZED') {
    const exchanged = await exchangeBrokerSession(pending);
    await secureSet(TOKEN_STORAGE_KEY, JSON.stringify({
      accessToken: exchanged.access_token,
      expiresAt: exchanged.expires_at ?? null
    } satisfies CalleMcpTokenDocument));
    return 'authorized';
  }
  if (normalized === 'FAILED' || normalized === 'EXPIRED' || normalized === 'EXCHANGED') {
    return 'failed';
  }
  return 'pending';
}

export async function getCalleMcpToken(): Promise<string | null> {
  const raw = await secureGet(TOKEN_STORAGE_KEY);
  if (!raw) return null;
  try {
    const doc: CalleMcpTokenDocument = JSON.parse(raw);
    if (!doc.accessToken) return null;
    if (doc.expiresAt) {
      const expiresAt = new Date(doc.expiresAt).getTime();
      // Same 5-minute minimum-TTL margin @call-e/core's own client uses
      // (DEFAULT_MIN_TTL_SECONDS = 300) -- a token that's about to expire
      // mid-call is worse than treating it as already expired.
      if (Number.isFinite(expiresAt) && expiresAt - Date.now() <= 300_000) return null;
    }
    return doc.accessToken;
  } catch {
    return null;
  }
}

export async function isCalleMcpConfigured(): Promise<boolean> {
  return (await getCalleMcpToken()) !== null;
}

export async function disconnectCalleMcp(): Promise<void> {
  await secureDelete(TOKEN_STORAGE_KEY);
}
```

The header name and value above (`SESSION_SECRET_HEADER = 'X-OpenAgent-Session-Secret'`) come
directly from `@call-e/core/lib/constants.js`, read during this design pass rather than
guessed.

### 2. `src/services/connectors/calleMcpConnector.ts` (new)

Plain-fetch MCP JSON-RPC client, structurally mirroring `@call-e/core`'s `mcp-client.js`
(initialize handshake → capture `mcp-session-id` response header → `notifications/initialized`
→ `tools/call`), adapted to browser `fetch` (no Node-specific `AbortController` timeout
quirks needed — the browser's own fetch already supports `AbortSignal.timeout()`).

```ts
const MCP_SERVER_URL = 'https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth';
const MCP_PROTOCOL_VERSION = '2025-11-25'; // from @call-e/core/lib/constants.js

interface McpSession {
  headers: Record<string, string>;
}

async function requestJsonRpc(headers: Record<string, string>, payload: Record<string, unknown>): Promise<{ body: any; headers: Headers }> {
  const response = await fetch(MCP_SERVER_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000)
  });
  const text = await response.text();
  const body = text.trim() ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`CALL-E MCP HTTP ${response.status} for ${payload.method}`);
  if (body?.error) throw new Error(body.error.message || `CALL-E MCP error for ${payload.method}`);
  return { body, headers: response.headers };
}

async function openMcpSession(accessToken: string): Promise<McpSession> {
  const commonHeaders = {
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    'mcp-protocol-version': MCP_PROTOCOL_VERSION,
    Authorization: `Bearer ${accessToken}`
  };
  const initialize = await requestJsonRpc(commonHeaders, {
    jsonrpc: '2.0', id: 'alphonso-initialize', method: 'initialize',
    params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'alphonso', version: '1' } }
  });
  const sessionId = initialize.headers.get('mcp-session-id') || '';
  const rpcHeaders = sessionId ? { ...commonHeaders, 'mcp-session-id': sessionId } : commonHeaders;
  await requestJsonRpc(rpcHeaders, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  return { headers: rpcHeaders };
}

async function callTool(toolName: string, toolArguments: Record<string, unknown>): Promise<any> {
  const accessToken = await getCalleMcpToken();
  if (!accessToken) throw new Error('CALL-E MCP not connected. Connect via Settings first.');
  const { headers } = await openMcpSession(accessToken);
  const response = await requestJsonRpc(headers, {
    jsonrpc: '2.0', id: `alphonso-${toolName}`, method: 'tools/call',
    params: { name: toolName, arguments: toolArguments }
  });
  return response.body?.result ?? {};
}

export interface PlanCallResult {
  ready_to_run: boolean;
  plan_id?: string;
  confirm_token?: string;
  clarifying_questions?: string[];
  summary?: string;
  // Best-effort dedup key (see calleMcpOutreachService's isPhoneAlreadyInFlight).
  // Whether plan_call's real response actually exposes a resolved phone number
  // field, and under what name, is unverified -- same category of unknown as
  // conversation_history above. If it isn't present, dedup-by-phone silently
  // can't run for that record; this is a best-effort safeguard, not a
  // guaranteed one, and that's stated plainly rather than assumed solved.
  phone_number?: string;
}

export function planCall(goal: string, conversationHistory?: string[]): Promise<PlanCallResult> {
  return callTool('plan_call', { goal, ...(conversationHistory?.length ? { conversation_history: conversationHistory } : {}) });
}

export function runCall(planId: string, confirmToken: string): Promise<{ run_id: string; status: string }> {
  return callTool('run_call', { plan_id: planId, confirm_token: confirmToken });
}

export function getCallRun(runId: string): Promise<{ status: string; structuredContent?: unknown; activity?: unknown[] }> {
  return callTool('get_call_run', { run_id: runId });
}
```

`MCP_PROTOCOL_VERSION` above is confirmed from `@call-e/core/lib/constants.js`. `plan_call`'s
exact argument shape (`goal`/`conversation_history`/`phone_number` above) is CALL-E's own tool
schema, not something `@call-e/core` defines client-side — it still needs a one-time live
confirmation via a real `tools/list`/`plan_call` call (blocked on the user's CALL-E account
access issue, same blocker noted throughout this session) before implementation, since
guessing an MCP tool's argument names wrong fails loudly at the first real call rather than
silently.

An earlier draft of this section invented a client-side scheme for tracking clarifying-
question answers (positional `answer_0`/`answer_1` keys). That was worse than just admitting
the schema is unverified: it added a *second*, self-invented layer of guessing on top of the
first, with no way to know which question an answer referenced if the user answered out of
order or answered two questions in one message. Passing the raw conversation transcript
instead (`conversation_history: string[]`, each entry one user/assistant turn) makes no
assumption about CALL-E's internal Q&A bookkeeping — it hands over exactly what a human would
type, in order, and lets `plan_call`'s own reasoning (which is explicitly described as
interactive) parse it. This is a smaller, more honest guess: right in shape even if a field
name needs correcting at implementation time, versus the previous version's structurally
wrong request.

### 3. `src/services/calleMcpOutreachService.ts` (new)

The conversational state machine, keyed by `chatId` (`ChatView.tsx`'s real `activeChatId`
state — the earlier draft of this doc invented a nonexistent `conversationId` variable
without checking `ChatView.tsx` first; corrected after self-review, see the critique note at
the end of this document).

**Critical design correction from self-review:** the record is only ever consulted to decide
routing while its stage is `'clarifying'` or `'ready_to_confirm'` — i.e. while CALL-E is
actively waiting on the user's next word. The moment `run_call` succeeds and the stage moves
to `'in_progress'`, the record stops intercepting chat messages entirely. Without this, a
single placed call would hijack the *entire* chat thread for however long the call takes
(minutes), rejecting every unrelated message with "a call is already in progress" — a real bug
in the first draft, not a hypothetical. The terminal result (completed/failed) is delivered
via the existing global `alphonso:toast` `CustomEvent` (`window.dispatchEvent(new
CustomEvent('alphonso:toast', { detail: { type, title, message } }))`, already used by
`joseSchedulerService.ts`, `CoachContext.jsx`, and others, consumed by `ToastProvider.tsx`) for
an immediate notice, plus a `delivered: boolean` flag on the durable record so `ChatView`
posts the real result as an assistant message into that specific chat once the user is
actually looking at it — not by waiting for the user to say something first.

(An earlier version of this fix cited `toolNotificationDispatcher.ts` for this purpose. That
was wrong and caught before committing: that service dispatches orchestration *receipts* out
to external Slack/Discord tool connections — `dispatchReceiptNotifications(receipt)`, gated
on `IMPORTANT_EVENTS` and a connection's `platform` — it has nothing to do with posting a
message inside this app's own chat UI. Read the file before reusing it a second time; the
first guess here repeated exactly the mistake point 1 above was called out for.)

**Second correction:** approving the call is a real UI button click
(`confirmMcpOutreachCall(chatId)`/`cancelMcpOutreachCall(chatId)`), not a plain-text "confirm"
match. The first draft's bare string match was a strictly weaker safety bar than Phase 1's own
REST panel (a distinct button click before any real call), for the identical class of action
(placing a real outbound phone call) — flagged in self-review as a regression, not a stylistic
choice, and fixed by rendering the plan summary as a distinguishable assistant message that
carries `pendingConfirm` data, which `ChatView.tsx` renders with actual `Button` components
(reusing the `ui/` barrel, same as `CalleOutreachPanel.tsx`) instead of parsing free text.

```ts
import { invoke } from '@tauri-apps/api/core';

export type McpOutreachStage = 'clarifying' | 'ready_to_confirm' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export interface McpOutreachRecord {
  chatId: string; // ChatView.tsx's activeChatId; one live record per chat at a time
  stage: McpOutreachStage;
  goal: string;
  conversationHistory: string[]; // raw user turns so far, oldest first
  planId?: string;
  confirmToken?: string;
  runId?: string;
  phoneNumber?: string; // best-effort, see PlanCallResult.phone_number
  clarifyingQuestions?: string[];
  summary?: string;
  structuredResult?: unknown;
  error?: string;
  delivered?: boolean; // has the terminal result been posted into this chat yet?
}

const RECORD_KEY_PREFIX = 'calle_mcp_outreach:';
const INDEX_KEY = 'calle_mcp_outreach_index'; // JSON array of chatIds with a live record

// Durable via kv_store.rs's kv_set/kv_get/kv_delete -- NOT memory_store.rs's
// upsert_memory_records/list_memory_records, despite an earlier pass of this
// same section using exactly that. Reason (found on a second, harsher re-read,
// not assumed): list_memory_records's real SQL is
// `SELECT ... FROM memory_records ORDER BY timestamp_ms DESC LIMIT 1000`,
// with the category filter applied AFTER that global limit, in application
// code -- not in the WHERE clause. Since chatPersistenceService.ts dual-writes
// every single chat message through this same table, an active chat session
// can push 1000+ newer rows past an idle calle_mcp_outreach record within
// minutes, silently evicting it from every future list_memory_records call
// regardless of its category filter -- which would have quietly broken the
// exact crash-recovery guarantee the previous pass added this durable storage
// to provide, with no error surfaced anywhere.
//
// kv_store.rs has no such global-ordering behavior at all: kv_get is a plain
// `SELECT value FROM kv_store WHERE key = ?1 LIMIT 1` -- true exact-key
// lookup, immune to this class of bug. It also genuinely has kv_delete
// (`DELETE FROM kv_store WHERE key = ?1`) -- an earlier pass claimed "there
// is no delete command on either store," which was itself wrong; kv_delete
// exists and works. What kv_store.rs still doesn't have is a way to
// enumerate "every key matching a prefix," so a small explicit index record
// (this file's own INDEX_KEY, a JSON array of chatIds) does that job instead.
//
// Read-modify-write races on that shared index (two persistRecord/deleteRecord
// calls for two different chats, both racing to update the same INDEX_KEY) are
// serialized through indexWriteQueue below -- the same pattern
// chatPersistenceService.ts already uses (its own `writeQueue`) for the
// identical class of problem, not a new one invented here.
const records = new Map<string, McpOutreachRecord>();
let hydrated = false;
let indexWriteQueue: Promise<void> = Promise.resolve();

function recordKey(chatId: string): string {
  return `${RECORD_KEY_PREFIX}${chatId}`;
}

async function readIndex(): Promise<string[]> {
  const raw = await invoke<string | null>('kv_get', { key: INDEX_KEY }).catch(() => null);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// CORRECTION (post-PR-#230-review, 2026-09-06): the two functions below, as
// originally specified here, had two real bugs found by code review after
// implementation: (1) updateIndex chained directly off indexWriteQueue with
// no recovery, so one failed kv_set left it permanently rejected and every
// later call's callback silently never ran; (2) hydrateRecords set
// hydrated = true unconditionally, so a failed kv_get permanently skipped
// hydration for the session instead of retrying. Both are fixed in the real
// implementation (src/services/calleMcpOutreachService.ts) -- see that
// file's updateIndex/readIndexWithStatus/hydrateRecords for the corrected
// version. The sample below is left as originally written for historical
// record; do not copy it verbatim.
function updateIndex(mutate: (chatIds: string[]) => string[]): Promise<void> {
  indexWriteQueue = indexWriteQueue.then(async () => {
    const current = await readIndex();
    const next = mutate(current);
    await invoke('kv_set', { key: INDEX_KEY, value: JSON.stringify(next) });
  });
  return indexWriteQueue;
}

async function hydrateRecords(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  const chatIds = await readIndex();
  for (const chatId of chatIds) {
    const raw = await invoke<string | null>('kv_get', { key: recordKey(chatId) }).catch(() => null);
    if (!raw) continue;
    try {
      records.set(chatId, JSON.parse(raw));
    } catch {
      // Corrupt entry -- skip rather than crash hydration for every other record.
    }
  }
}

async function persistRecord(record: McpOutreachRecord): Promise<void> {
  records.set(record.chatId, record);
  await invoke('kv_set', { key: recordKey(record.chatId), value: JSON.stringify(record) });
  await updateIndex((chatIds) => (chatIds.includes(record.chatId) ? chatIds : [...chatIds, record.chatId]));
}

// kv_store.rs's real kv_delete makes an actual delete possible here (an
// earlier pass wrongly believed no delete primitive existed anywhere and
// worked around it with a persisted 'cancelled' stage instead -- that
// workaround is no longer needed, though 'cancelled' stays in
// McpOutreachStage in case a future pass wants an audit trail instead of a
// hard delete).
async function deleteRecord(chatId: string): Promise<void> {
  records.delete(chatId);
  await invoke('kv_delete', { key: recordKey(chatId) });
  await updateIndex((chatIds) => chatIds.filter((id) => id !== chatId));
}

export async function getMcpOutreachRecord(chatId: string): Promise<McpOutreachRecord | null> {
  await hydrateRecords();
  return records.get(chatId) ?? null;
}

// True only when the record is actively waiting on the user's next message.
// This -- not "record exists" -- is what ChatView checks before intercepting.
export function isAwaitingMcpOutreachInput(record: McpOutreachRecord | null): boolean {
  return record !== null && (record.stage === 'clarifying' || record.stage === 'ready_to_confirm');
}

function isPhoneAlreadyInFlight(phoneNumber: string | undefined): boolean {
  if (!phoneNumber) return false; // best-effort only, see PlanCallResult.phone_number
  for (const record of records.values()) {
    if (record.phoneNumber === phoneNumber && (record.stage === 'ready_to_confirm' || record.stage === 'in_progress')) {
      return true;
    }
  }
  return false;
}

// Called from ChatView when isAwaitingMcpOutreachInput(existingRecord) is true,
// or when shouldRouteThroughCalleMcp(text) matches with no existing record.
// Returns the assistant-facing reply text to show in chat.
export async function handleMcpOutreachMessage(chatId: string, text: string): Promise<string> {
  try {
    await hydrateRecords();
    const existing = records.get(chatId);
    const lower = text.trim().toLowerCase();

    // 'cancel' is an escape hatch at every stage that's still waiting on
    // input -- the first draft only allowed it once ready_to_confirm, so a
    // user mid-clarification who wanted out had no way to stop.
    if (existing && isAwaitingMcpOutreachInput(existing) && lower === 'cancel') {
      await deleteRecord(chatId);
      return 'Call plan dropped.';
    }

    if (!existing || existing.stage === 'completed' || existing.stage === 'failed' || existing.stage === 'cancelled') {
      appendAgentActivity({ agent: 'marcus', action: 'calle_mcp_plan_call', detail: text });
      const plan = await planCall(text);
      return await advancePlan(chatId, text, [text], plan);
    }

    if (existing.stage === 'clarifying') {
      const conversationHistory = [...existing.conversationHistory, text];
      appendAgentActivity({ agent: 'marcus', action: 'calle_mcp_plan_call', detail: text });
      const plan = await planCall(existing.goal, conversationHistory);
      return await advancePlan(chatId, existing.goal, conversationHistory, plan);
    }

    // stage === 'ready_to_confirm': no longer reachable via free text at all
    // (see confirmMcpOutreachCall/cancelMcpOutreachCall below) -- any message
    // here is the user typing something instead of clicking a button.
    if (existing.stage === 'ready_to_confirm') {
      return 'Use the Approve or Cancel button above to continue with this call plan.';
    }

    // stage === 'in_progress': reachable, not just defensive. isAwaitingMcpOutreachInput()
    // is false while a call runs, so ChatView falls through to shouldRouteThroughCalleMcp's
    // fresh-intent check (§5) -- if the user types another call-like message in the SAME chat
    // while one is already running, it lands here. (An earlier pass of this comment claimed
    // this branch was unreachable; that was wrong -- found on a third, harder re-read, not
    // assumed correct just because it was already fixed twice.) The design intentionally
    // supports only one live outreach flow per chat at a time; a second call-like message
    // while one is in_progress is told to wait rather than starting a second flow.
    return 'This call is already running; I will post the result when it finishes.';
  } catch (error) {
    return `CALL-E error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function advancePlan(chatId: string, goal: string, conversationHistory: string[], plan: PlanCallResult): Promise<string> {
  if (!plan.ready_to_run) {
    await persistRecord({
      chatId, stage: 'clarifying', goal, conversationHistory,
      clarifyingQuestions: plan.clarifying_questions ?? []
    });
    return (plan.clarifying_questions ?? []).join('\n');
  }
  if (isPhoneAlreadyInFlight(plan.phone_number)) {
    return `A call to ${plan.phone_number} is already pending or in progress in another chat. Wait for it to finish before starting another.`;
  }
  await persistRecord({
    chatId, stage: 'ready_to_confirm', goal, conversationHistory,
    planId: plan.plan_id, confirmToken: plan.confirm_token, phoneNumber: plan.phone_number,
    summary: plan.summary
  });
  // ChatView renders this as a card with real Approve/Cancel buttons, not
  // free text the user has to type a magic word back into.
  return plan.summary ?? 'Ready to place this call.';
}

// A double-click (or any rapid re-invocation) between reading
// existing.stage === 'ready_to_confirm' and the persistRecord call that
// moves it to 'in_progress' could otherwise call runCall twice for the same
// plan -- and run_call has NO idempotency mechanism (stated throughout this
// doc), so that specific race is a direct path to placing two real phone
// calls from one click. This guard closes exactly that window; it does not
// try to solve double-submission in general (a second click after the
// stage has already moved to 'in_progress' is already rejected by the
// existing.stage check below, same as before).
const confirmInFlight = new Set<string>();

// Called by ChatView's rendered "Approve & Place Call" button -- the actual
// approval action, matching Phase 1's REST panel's own button-click bar
// rather than a plain-text "confirm" match.
export async function confirmMcpOutreachCall(chatId: string): Promise<string> {
  if (confirmInFlight.has(chatId)) {
    return 'Already placing this call -- please wait.';
  }
  confirmInFlight.add(chatId);
  try {
    await hydrateRecords();
    const existing = records.get(chatId);
    if (!existing || existing.stage !== 'ready_to_confirm') {
      return 'No pending call plan to confirm.';
    }
    const gate = evaluatePolicyGate({ connectorId: 'calle', actionType: 'external_call', approved: true });
    if (!gate.ok) {
      return `Blocked: ${gate.reason}`;
    }
    appendAgentActivity({ agent: 'marcus', action: 'calle_mcp_run_call', detail: existing.summary ?? '' });
    const { run_id } = await runCall(existing.planId!, existing.confirmToken!);
    await persistRecord({ ...existing, stage: 'in_progress', runId: run_id });
    pollMcpCallUntilTerminal(chatId, run_id).catch((error) => {
      persistRecord({ ...existing, stage: 'in_progress', runId: run_id, error: error instanceof Error ? error.message : String(error) });
    });
    return 'Call started. I will notify you when it finishes.';
  } catch (error) {
    return `CALL-E error: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    confirmInFlight.delete(chatId);
  }
}

export async function cancelMcpOutreachCall(chatId: string): Promise<string> {
  await deleteRecord(chatId);
  return 'Call plan dropped.';
}

// Called by ChatView's delivery effect once it has posted the terminal
// result into the chat, so a later poll doesn't post it a second time.
export async function markMcpOutreachDelivered(chatId: string): Promise<void> {
  const record = records.get(chatId);
  if (record) await persistRecord({ ...record, delivered: true });
}

// A stuck run_id (a bug on CALL-E's side, or a run that never reaches a
// terminal status for any reason) would otherwise poll forever -- a network
// request every 10 seconds for the lifetime of the app session, with no
// ceiling at all. This codebase already has a precedent for exactly this
// class of problem: joseExecutionEngineService.ts's PIPELINE_MAX_DURATION_MS
// caps a different kind of runaway loop. 60 minutes is a generous multiple
// of a normal call's expected duration (minutes, not hours) while still
// bounding the worst case.
// Caveat, stated plainly rather than hidden: the deadline is computed fresh
// each time pollMcpCallUntilTerminal starts (including from
// recoverInterruptedMcpOutreachCalls after a restart), not stored on the
// record itself -- so a call stuck across several full app restarts could in
// theory poll for longer than 60 minutes of *wall-clock* time in total, even
// though any single continuous polling run is bounded. Storing an absolute
// deadline on McpOutreachRecord would close that too, but is left out here as
// unnecessary complexity for what both is an already-rare edge case (a stuck
// run_id AND the user restarting the app multiple times within that window)
// and still can't loop forever within any one running session, which was the
// actual problem being fixed.
const MAX_POLL_DURATION_MS = 60 * 60 * 1000;

async function pollMcpCallUntilTerminal(chatId: string, runId: string): Promise<void> {
  const TERMINAL = new Set(['COMPLETED', 'FAILED', 'NO_ANSWER', 'DECLINED', 'CANCELED', 'CANCELLED', 'VOICEMAIL', 'BUSY', 'EXPIRED']);
  const deadline = Date.now() + MAX_POLL_DURATION_MS;
  for (;;) {
    if (Date.now() > deadline) {
      const record = records.get(chatId);
      if (record) {
        await persistRecord({ ...record, stage: 'failed', error: 'Timed out waiting for CALL-E to report a final status.', delivered: false });
        window.dispatchEvent(new CustomEvent('alphonso:toast', {
          detail: { type: 'warning', title: 'CALL-E call timed out', message: 'No final status after 60 minutes of polling.' }
        }));
      }
      return;
    }
    await new Promise((r) => setTimeout(r, 10_000));
    let result;
    try {
      result = await getCallRun(runId);
    } catch (error) {
      // Transient network error: keep polling rather than giving up on the
      // first blip. The first draft had no try/catch here at all, which
      // meant a single failed fetch threw an unhandled rejection out of a
      // fire-and-forget call and left the record stuck at 'in_progress'
      // forever with the user never told.
      continue;
    }
    const status = String(result.status || '').toUpperCase();
    if (TERMINAL.has(status)) {
      const record = records.get(chatId);
      if (record) {
        const updated: McpOutreachRecord = {
          ...record,
          stage: status === 'COMPLETED' ? 'completed' : 'failed',
          structuredResult: result.structuredContent,
          summary: typeof (result as any).summary === 'string' ? (result as any).summary : record.summary,
          delivered: false
        };
        await persistRecord(updated);
        window.dispatchEvent(new CustomEvent('alphonso:toast', {
          detail: {
            type: status === 'COMPLETED' ? 'success' : 'warning',
            title: status === 'COMPLETED' ? 'CALL-E call completed' : `CALL-E call ${status.toLowerCase()}`,
            message: updated.summary ?? ''
          }
        }));
      }
      return;
    }
  }
}

// Boot-time recovery: any record left 'in_progress' from a prior session
// (its poll loop died when the app closed) gets its poll loop restarted,
// which itself calls get_call_run only -- run_call is NEVER retried here.
// CALL-E's own docs say not to retry run_call on disconnect, and unlike the
// REST path there is no idempotency key that would make a retry safe.
// Because records are now durable (kv_set/kv_get plus the index, not an
// in-memory-only Map), this actually has something to recover across a full
// app restart, unlike the first draft -- and unlike the memory_store.rs
// approach an earlier pass used instead, whose global-limit query could
// silently miss an idle record (see the self-critique's second pass).
export async function recoverInterruptedMcpOutreachCalls(): Promise<void> {
  await hydrateRecords();
  for (const record of records.values()) {
    if (record.stage === 'in_progress' && record.runId) {
      pollMcpCallUntilTerminal(record.chatId, record.runId).catch((error) => {
        persistRecord({ ...record, error: error instanceof Error ? error.message : String(error) });
      });
    }
  }
}
```

### 4. `src/lib/chatUtils.js` (modified)

```js
export function shouldRouteThroughCalleMcp(text) {
  const lower = String(text || '').toLowerCase().trim();
  if (!lower) return false;
  return [
    'call ', 'phone ', 'ring ', 'dial '
  ].some((term) => lower.startsWith(term) || lower.includes(` ${term}`))
    && /call|phone|ring|dial/.test(lower)
    && !lower.startsWith('/jose');
}
```

A follow-up clarification answer is routed by `ChatView.tsx` checking
`isAwaitingMcpOutreachInput()` on the existing record for `activeChatId` *before* falling back
to this fresh-intent matcher — an actively-awaiting record always wins, regardless of what the
new message's text looks like. Once the record moves past that (to `'in_progress'`,
`'completed'`, or `'failed'`), this matcher is consulted like any other fresh message, and
normal chat resumes uninterrupted — this is the fix for the chat-thread-monopolization bug
found in self-review (see the note at the top of §3).

### 5. `ChatView.tsx` (modified)

Before the existing `shouldRouteThroughJose` check, add (using the real `activeChatId` state,
not the nonexistent `conversationId` the first draft invented):

```ts
const existingMcpOutreach = await getMcpOutreachRecord(activeChatId);
if (isAwaitingMcpOutreachInput(existingMcpOutreach)) {
  const reply = await handleMcpOutreachMessage(activeChatId, text);
  // post `reply` as an assistant message; if existingMcpOutreach.stage is now
  // 'ready_to_confirm', render it as a card with real Approve/Cancel buttons
  // (onClick -> confirmMcpOutreachCall(activeChatId) / cancelMcpOutreachCall(activeChatId))
  // instead of plain text asking the user to type a word back.
  return;
} else if (shouldRouteThroughCalleMcp(text)) {
  const reply = await handleMcpOutreachMessage(activeChatId, text);
  // same rendering as above
  return;
}
```

A separate small `useEffect` (mounted once, checked on an interval similar to
`CalleOutreachPanel.tsx`'s existing 5s poll) checks `getMcpOutreachRecord(activeChatId)`; if it
finds a `stage` of `'completed'`/`'failed'` with `delivered !== true`, it posts the record's
`summary` as a plain assistant message into that chat and calls the new exported
`markMcpOutreachDelivered(chatId)` so the message is posted exactly once, whether
the user was already looking at the chat when the call finished or opens it later. The
immediate `alphonso:toast` notification (§3) covers the "user isn't looking at this chat right
now" case; this covers "the actual result, once they are."

### 6. `ConnectorSetupPanel.tsx` (modified)

The existing CALL-E `CredentialSection` (added in Phase 1) gains a second sub-block below the
REST API key field:

```
MCP Connection: [● Connected | ○ Not connected]
[Connect via Browser Login]  (hidden once connected; shows [Disconnect] instead)
```

Clicking "Connect via Browser Login" calls `startBrokerLogin()`, opens `pending.loginUrl` via
`invoke('open_url', ...)` (the existing native-open convention, not a bare `<a target="_blank">`),
and starts a bounded local poll (`pollBrokerLogin`, every `pending.pollAfterMs`, capped at
~2 minutes) that flips the status dot to Connected once authorized. This is a UI-level poll
loop local to the component (not the app-wide fire-and-forget pattern used for calls) since
it only needs to run while the Settings panel is open.

## Data flow (happy path)

1. User types "call Joe's Pizza and ask if they'd like an updated website" in chat.
2. `shouldRouteThroughCalleMcp` matches → `handleMcpOutreachMessage` → `planCall(text)`.
3. CALL-E MCP returns `ready_to_run: false`, `clarifying_questions: ["What phone number should I call?"]`.
4. Assistant reply shows that question; record stored `stage: 'clarifying'` (durable).
5. User replies with the phone number. `isAwaitingMcpOutreachInput()` is true for this chat, so
   this message routes to `handleMcpOutreachMessage` regardless of what it looks like.
6. `planCall(goal, [originalText, phoneNumberReply])` → now `ready_to_run: true` with a
   `plan_id`/`confirm_token`/`summary` (and, best-effort, `phone_number`).
7. Assistant message renders the plan summary as a card with real **Approve & Place Call** /
   **Cancel** buttons — not a request to type a word back.
8. User clicks Approve → `confirmMcpOutreachCall` → policy gate checked (paid + high-risk,
   same as Phase 1) → `runCall(plan_id, confirm_token)` → `run_id` stored, `stage:
   'in_progress'`. From this point, `isAwaitingMcpOutreachInput()` is false for this chat —
   normal conversation resumes immediately, uninterrupted.
9. Background poll (`pollMcpCallUntilTerminal`) checks `get_call_run` every 10s until terminal,
   updates the durable record, and fires an `alphonso:toast` notice. A `ChatView` delivery
   effect then posts the record's summary as a plain assistant message the next time the user
   is looking at that chat, calling `markMcpOutreachDelivered` so it's posted exactly once —
   delivered whenever the call actually finishes, not gated on the user saying something first.

## Error handling

- Every branch of `handleMcpOutreachMessage`/`confirmMcpOutreachCall` is wrapped in a single
  top-level try/catch that returns a plain "CALL-E error: ..." string rather than throwing —
  the first draft had no try/catch anywhere in this function despite this same "Error
  handling" section already claiming failures surface as a message; that gap is closed here,
  not just documented differently.
- No partial `McpOutreachRecord` is left in an ambiguous stage: a thrown error occurs before
  `persistRecord(...)` runs for that branch, so the prior stage is untouched and the user can
  retry their last message.
- Expired token (`isCalleMcpConfigured()` false) at any point returns "CALL-E MCP not
  connected. Connect via Settings first." rather than attempting a browser-login flow from
  inside a chat reply (login requires opening a browser, which belongs in Settings, not an
  autonomous action mid-conversation).
- `run_call`'s lack of idempotency is handled two ways: (1) once `runCall` returns a `run_id`
  and the record moves to `in_progress`, no code path calls `runCall` again for that record —
  recovery only ever polls `getCallRun`; (2) `confirmInFlight` (a module-level `Set<string>`)
  rejects a second concurrent `confirmMcpOutreachCall` for the same `chatId` outright, closing
  the specific race a double-click could otherwise exploit between the stage check and the
  stage transition — found on the second self-critique pass, not the first.
- `pollMcpCallUntilTerminal`'s loop now catches a failed `getCallRun` and keeps polling
  (transient network blips shouldn't abandon a call that's actually still running), and the
  fire-and-forget call sites (`confirmMcpOutreachCall`, `recoverInterruptedMcpOutreachCalls`)
  attach a real `.catch()` that records the error on the durable record instead of producing
  an unhandled rejection the user never sees. The first draft had neither.
- Best-effort duplicate-call protection: `isPhoneAlreadyInFlight()` blocks starting a second
  `ready_to_confirm`/`in_progress` plan to a phone number that already has one, mirroring
  Phase 1's `hasNonTerminalForPhone` check in `CalleOutreachPanel.tsx` — with the caveat noted
  on `PlanCallResult.phone_number` that this depends on a field whose presence in CALL-E's
  real `plan_call` response isn't yet confirmed.

## Testing

- `calleMcpAuthService.test.ts`: broker session create/poll/exchange (mocked `fetch`), token
  TTL boundary (expiring within 5 minutes reads as unusable), `secureSet`/`secureGet` mock
  round-trip.
- `calleMcpConnector.test.ts`: initialize handshake captures `mcp-session-id` and reuses it on
  the follow-up call; `planCall`/`runCall`/`getCallRun` argument shapes; HTTP-error and
  MCP-`error`-field propagation; "not connected" error when no token.
- `chatUtils.test.js`: `shouldRouteThroughCalleMcp` — positive/negative cases, `/jose` prefix
  never matches.
- `calleMcpOutreachService.test.ts`: full state machine — clarifying → ready_to_confirm →
  confirm (button action, not text) → in_progress → terminal; `isAwaitingMcpOutreachInput()`
  is false once `in_progress` (regression test for the chat-monopolization bug); `cancel`
  actually deletes the record (verify a subsequent `getMcpOutreachRecord` returns `null`, and
  that the shared index no longer lists that `chatId`) from every awaiting stage, not just
  `ready_to_confirm`; **two concurrent `confirmMcpOutreachCall` calls for the same `chatId`
  result in exactly one `runCall` invocation**, not two (direct regression test for the
  double-submission finding below); policy-gate block path; `isPhoneAlreadyInFlight` blocks a
  second plan to the same number; a failed `getCallRun` inside the poll loop doesn't abandon
  the record; `recoverInterruptedMcpOutreachCalls` only calls `getCallRun`, never `runCall`,
  for an `in_progress` record, and actually has something to recover after a simulated restart
  (records hydrated from a mocked `kv_get`/index, not an empty in-memory `Map`, and not
  vulnerable to the `list_memory_records` global-limit issue below since it no longer uses
  that API at all); a run that never reaches a terminal status stops polling and moves to
  `'failed'` once `MAX_POLL_DURATION_MS` elapses, instead of polling forever (use a fake timer
  / injectable clock rather than a real 60-minute wait); a fresh call-like message routed to a
  chat whose record is already `in_progress` gets the "already running" reply, confirming the
  branch is actually reachable, not the dead code an earlier pass's comment claimed.
- `ChatView` integration test: while `isAwaitingMcpOutreachInput()` is true for `activeChatId`,
  the next message routes through `handleMcpOutreachMessage` regardless of its text (e.g. a
  bare phone number); once the record moves to `in_progress`, the *next* unrelated message
  is answered normally, not intercepted (this is the direct regression test for the
  self-review finding in §3).

## What this does not fix / build

- No UI surface yet shows a completed `McpOutreachRecord`'s final summary/transcript beyond
  the plain assistant chat message the delivery effect posts — no history list like Phase 1's
  panel. Deferred, same reasoning as Phase 1's own deferred final-UI-placement decision
  (pending the in-progress UI redesign).
- `plan_call`'s exact argument schema (`goal`/`conversation_history`/`phone_number` above)
  still needs a one-time live confirmation via `tools/list`/`plan_call` once the user's
  CALL-E account access issue is resolved — flagged explicitly above, not silently guessed as
  final. `MCP_PROTOCOL_VERSION` and the broker's session-secret header are already confirmed
  from `@call-e/core`'s source. Duplicate-call protection is correspondingly best-effort until
  `phone_number`'s real field name (or absence) is confirmed.
- No changes to the Phase 1 REST connector, panel, or its policy/registry wiring — this is
  additive only.
- Whether `plan_call` itself needs a policy/Zero-Cost-Mode gate is an open question, not a
  decision made here — see point 12 of the second self-critique pass below. Needs CALL-E's
  actual billing model confirmed (does a `plan_call` invocation that never places a call cost
  anything?) before deciding whether it needs its own, lighter-weight gate distinct from
  `confirmMcpOutreachCall`'s approval-click bar.

## Self-critique (applied)

A harsh review pass after the first draft found nine real issues, all fixed in this version
rather than left as caveats:

1. The integration code referenced a `conversationId` variable that doesn't exist in
   `ChatView.tsx` — the real state is `activeChatId`. Written without checking the file first.
2. An active record (in *any* non-terminal stage, including `in_progress`) intercepted every
   subsequent chat message regardless of topic — a real, minutes-long chat-thread hijack for
   the duration of any placed call. Fixed by narrowing interception to
   `isAwaitingMcpOutreachInput()` (only `clarifying`/`ready_to_confirm`) and delivering the
   terminal result via the existing `alphonso:toast` event plus a `delivered`-flag chat post
   instead — not `toolNotificationDispatcher.ts`, an earlier fix's own wrong guess (that
   service pushes orchestration receipts to external Slack/Discord connections; it has no
   path into this app's own chat UI at all — caught on a second read before committing, same
   category of mistake as point 1).
3. The clarifying-answer aggregation scheme (`answer_0`/`answer_1` positional keys) was
   invented with no basis in CALL-E's actual `plan_call` schema, and broke on out-of-order or
   multi-question answers. Replaced with a raw `conversation_history: string[]` transcript —
   still an unverified field name, but a structurally sound guess instead of a self-invented
   bookkeeping scheme layered on top of an already-unverified one.
4. `cancel` only worked once `ready_to_confirm`; a user mid-clarification had no escape hatch.
   Fixed — `cancel` now works at any stage `isAwaitingMcpOutreachInput()` is true.
5. The approval gate was a bare "confirm" string match in chat — strictly weaker than Phase
   1's own button-click bar for the identical class of action (placing a real call). Fixed
   with real `confirmMcpOutreachCall`/`cancelMcpOutreachCall` button actions.
6. No protection against two chats independently calling the same number at once (Phase 1's
   panel already has this via `hasNonTerminalForPhone`). Fixed with best-effort
   `isPhoneAlreadyInFlight`, caveated on the same unverified-field-name basis as point 3.
7. The doc's own "Error handling" section claimed failures surface as a message, but the code
   had no try/catch anywhere. Fixed with a real top-level try/catch in both entry points.
8. `pollMcpCallUntilTerminal` had no error handling and was invoked with no `.catch()`, so a
   single network blip produced an unhandled rejection and silently stuck the record at
   `in_progress` forever. Fixed with an in-loop catch (keep polling) and `.catch()` at every
   call site (persist the error on the record).
9. `records` was an in-memory-only `Map`, making the documented boot-time recovery function
   recover nothing after a real app restart — functionally equivalent to no crash recovery,
   understated in the first draft as a "one-line decision to make later." Fixed by making
   `records` durable via `memory_store.rs`'s `upsert_memory_records`/`list_memory_records`
   from the start — the same real primitive `chatPersistenceService.ts` already uses, and the
   one this codebase actually has a category-filtered listing capability on (a further,
   separate correction: `kv_store.rs`'s `kv_set`/`kv_get`/`kv_delete`, cited in an earlier pass
   of this same fix, only support exact-key lookup with no listing capability at all, and
   there is no delete command on either store — "cancel" was redesigned around an upserted
   terminal `'cancelled'` stage instead of a delete call that doesn't exist). A call genuinely
   in flight (and costing real money, per Phase 1's `ESTIMATED_COST_USD` convention) is a
   correctness issue, not a nice-to-have — worth getting the actual storage primitive right,
   not just picking one that sounded plausible.

   **This fix was itself found flawed on the second self-critique pass below (point 10) and
   has been replaced** — `memory_store.rs`'s `list_memory_records` turned out to have its own
   reliability problem for this specific use case. The corrected version now uses
   `kv_store.rs` after all, but not the same way an earlier guess assumed: with a small
   explicit index record to solve the enumeration gap, and with real `kv_delete` (which does
   exist — the claim above that "there is no delete command on either store" was also wrong).

## Second self-critique pass

A further harsh review of the version above (after applying all nine fixes) found three more
real issues:

10. **Point 9's own fix was unreliable.** `memory_store.rs`'s `list_memory_records` runs
    `SELECT ... FROM memory_records ORDER BY timestamp_ms DESC LIMIT 1000` and applies the
    category filter *after* that global limit, in application code — not in the SQL `WHERE`
    clause. `chatPersistenceService.ts` dual-writes every chat message through this exact
    table, so a single active chat session can push 1000+ newer rows past an idle
    `calle_mcp_outreach` record within minutes, silently evicting it from every future
    `list_memory_records` call regardless of category — which would have quietly defeated the
    very crash-recovery guarantee point 9 was fixing, with no error anywhere. Replaced with
    `kv_store.rs` (true exact-key lookup, no global ordering at all) plus a small explicit
    index record for enumeration, with index read-modify-write races serialized through a
    queue mirroring `chatPersistenceService.ts`'s own `writeQueue` pattern. This also corrected
    a second, compounding error from the same earlier pass: `kv_store.rs` genuinely has
    `kv_delete` (`DELETE FROM kv_store WHERE key = ?1`) — the claim that neither store supports
    delete was itself wrong, not just the choice of which store to use.
11. **No guard against a double-click placing two real calls.** Between reading
    `existing.stage === 'ready_to_confirm'` and the `persistRecord` call that moves it to
    `'in_progress'`, a rapid second invocation of `confirmMcpOutreachCall` (double-click, or
    any other re-entrant call) could call `runCall` twice for the same plan — and `run_call`
    has no idempotency mechanism, a constraint this document repeats throughout. This is more
    severe than any single issue found in the first pass: it is a direct path to placing two
    real phone calls from what looks like one user action. Fixed with a `confirmInFlight` guard
    that rejects a second concurrent call outright, checked before any `await` in the function.
12. **Whether `plan_call` itself needs a policy gate is an open question, not a decision.**
    Phase 1 never makes a network call before its approval gate — `createOutreachDraft` is
    pure local state, with all network activity deferred to the gated `runOutreachCall` step.
    Phase 2 structurally can't do that: the `plan_call` round-trip to CALL-E's paid API *is*
    the clarifying-question mechanism, so it necessarily happens before any gate exists. Left
    unresolved here rather than guessed: whether CALL-E's billing model charges per `plan_call`
    invocation (which places no real call) or only per placed call. If the former, Zero-Cost
    Mode currently does nothing to stop repeated `plan_call` usage from within a chat
    conversation — that would need its own, probably lighter-weight, gate distinct from the
    `run_call` approval gate (blocking every `plan_call` behind the same approval-click bar as
    placing a call would defeat the point of a lightweight clarifying-question flow). This
    needs CALL-E's actual billing documentation, not an assumption, before implementation.

## Third self-critique pass

A third, harder look at the version above (after ten of twelve prior fixes had already
survived two review passes) found two more real issues, plus one thing explicitly checked
and confirmed *not* to be a problem:

13. **`pollMcpCallUntilTerminal` had no maximum duration at all.** A stuck `run_id` (a bug on
    CALL-E's side, or any run that never reaches a terminal status) would poll forever — a
    network request every 10 seconds for the lifetime of the app session, completely unbounded.
    This codebase already has a precedent for exactly this class of problem
    (`joseExecutionEngineService.ts`'s `PIPELINE_MAX_DURATION_MS` caps a different runaway
    loop), which this design had no equivalent of. Fixed with a `MAX_POLL_DURATION_MS` (60
    minutes) ceiling that moves the record to `'failed'` with a timeout error and fires a toast
    instead of polling indefinitely — with an explicit caveat (see the code comment) that the
    deadline resets per polling run rather than being stored on the record, so it bounds any
    one continuous session but not, in the rare case of repeated restarts against the same
    stuck run, cumulative wall-clock time across all of them.
14. **A code comment asserted a reachable branch was unreachable.** `handleMcpOutreachMessage`'s
    `'in_progress'` fallback carried a comment claiming it was "unreachable in practice, since
    ChatView only calls this function while `isAwaitingMcpOutreachInput()` is true." That's
    false: `ChatView`'s integration (§5) *also* calls this function whenever
    `shouldRouteThroughCalleMcp(text)` matches a fresh message, independent of any existing
    record's stage — so a second call-like message typed into a chat that already has an
    `in_progress` call reaches exactly this branch. The actual behavior (telling the user to
    wait) was already correct; only the comment was wrong, but an incorrect claim about what
    code does is the same category of defect this document has been hunting throughout, not a
    lesser one just because the runtime behavior happened to be fine. Fixed by correcting the
    comment to state the real, intentional constraint: only one live outreach flow is
    supported per chat at a time.
15. **Checked, not fixed, because it isn't a bug:** every `callTool` invocation re-establishes
    a fresh MCP session (`initialize` + `notifications/initialized`) before the actual
    `tools/call`, including every 10-second status poll — three network round-trips instead of
    one, repeated indefinitely for a long-running call. This looked like a real inefficiency
    worth flagging, but re-reading `@call-e/core`'s own `mcp-client.js` (the reference
    implementation this whole design is modeled on) shows it does exactly the same thing —
    `listMcpTools` and `callMcpTool` both call `openMcpSession` fresh, every time, with no
    session reuse across calls. Since the authoritative CLI itself behaves this way, this is
    consistent with verified real-world behavior against CALL-E's actual server, not a design
    flaw introduced here — flagged and then explicitly ruled out, rather than either silently
    fixed on a guess or silently left unexamined.
