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
}

export function planCall(goal: string, priorAnswers?: Record<string, string>): Promise<PlanCallResult> {
  return callTool('plan_call', { goal, ...(priorAnswers ? { answers: priorAnswers } : {}) });
}

export function runCall(planId: string, confirmToken: string): Promise<{ run_id: string; status: string }> {
  return callTool('run_call', { plan_id: planId, confirm_token: confirmToken });
}

export function getCallRun(runId: string): Promise<{ status: string; structuredContent?: unknown; activity?: unknown[] }> {
  return callTool('get_call_run', { run_id: runId });
}
```

`MCP_PROTOCOL_VERSION` above is confirmed from `@call-e/core/lib/constants.js`. `plan_call`'s
exact argument shape (`goal`/`answers` above) is CALL-E's own tool schema, not something
`@call-e/core` defines client-side — it still needs a one-time live confirmation via a real
`tools/list`/`plan_call` call (blocked on the user's CALL-E account access issue, same
blocker noted throughout this session) before implementation, since guessing an MCP tool's
argument names wrong fails loudly at the first real call rather than silently.

### 3. `src/services/calleMcpOutreachService.ts` (new)

The conversational state machine, keyed per chat conversation (so two different chats can
each have their own in-flight plan without colliding).

```ts
export type McpOutreachStage = 'clarifying' | 'ready_to_confirm' | 'in_progress' | 'completed' | 'failed';

export interface McpOutreachRecord {
  id: string; // conversationId, one live record per conversation at a time
  stage: McpOutreachStage;
  goal: string;
  answers: Record<string, string>;
  planId?: string;
  confirmToken?: string;
  runId?: string;
  clarifyingQuestions?: string[];
  summary?: string;
  structuredResult?: unknown;
  error?: string;
}

// In-memory + durable via kv_set/kv_get (mirrors chatPersistenceService.ts's
// dual-write pattern) so a mid-flight conversational plan survives a reload,
// though the actual live plan_id/confirm_token are short-lived by CALL-E's
// own design and are not expected to be reusable across app restarts.
const records = new Map<string, McpOutreachRecord>();

export function getMcpOutreachRecord(conversationId: string): McpOutreachRecord | null {
  return records.get(conversationId) ?? null;
}

// Called from ChatView when shouldRouteThroughCalleMcp(text) matches.
// Returns the assistant-facing reply text to show in chat.
export async function handleMcpOutreachMessage(conversationId: string, text: string): Promise<string> {
  const existing = records.get(conversationId);

  if (!existing || existing.stage === 'completed' || existing.stage === 'failed') {
    // Fresh request.
    appendAgentActivity({ agent: 'marcus', action: 'calle_mcp_plan_call', detail: text });
    const plan = await planCall(text);
    if (!plan.ready_to_run) {
      records.set(conversationId, {
        id: conversationId, stage: 'clarifying', goal: text, answers: {},
        clarifyingQuestions: plan.clarifying_questions ?? []
      });
      return (plan.clarifying_questions ?? []).join('\n');
    }
    records.set(conversationId, {
      id: conversationId, stage: 'ready_to_confirm', goal: text, answers: {},
      planId: plan.plan_id, confirmToken: plan.confirm_token, summary: plan.summary
    });
    return `Ready to place this call: ${plan.summary}\nReply "confirm" to place it, or "cancel" to drop this plan.`;
  }

  if (existing.stage === 'clarifying') {
    const answers = { ...existing.answers, [`answer_${Object.keys(existing.answers).length}`]: text };
    appendAgentActivity({ agent: 'marcus', action: 'calle_mcp_plan_call', detail: text });
    const plan = await planCall(existing.goal, answers);
    if (!plan.ready_to_run) {
      records.set(conversationId, { ...existing, answers, clarifyingQuestions: plan.clarifying_questions ?? [] });
      return (plan.clarifying_questions ?? []).join('\n');
    }
    records.set(conversationId, {
      ...existing, answers, stage: 'ready_to_confirm',
      planId: plan.plan_id, confirmToken: plan.confirm_token, summary: plan.summary
    });
    return `Ready to place this call: ${plan.summary}\nReply "confirm" to place it, or "cancel" to drop this plan.`;
  }

  if (existing.stage === 'ready_to_confirm') {
    const lower = text.trim().toLowerCase();
    if (lower === 'cancel') {
      records.delete(conversationId);
      return 'Call plan dropped.';
    }
    if (lower !== 'confirm') {
      return 'Reply "confirm" to place the call, or "cancel" to drop this plan.';
    }
    const gate = evaluatePolicyGate({ connectorId: 'calle', actionType: 'external_call', approved: true });
    if (!gate.ok) {
      return `Blocked: ${gate.reason}`;
    }
    appendAgentActivity({ agent: 'marcus', action: 'calle_mcp_run_call', detail: existing.summary ?? '' });
    const { run_id } = await runCall(existing.planId!, existing.confirmToken!);
    records.set(conversationId, { ...existing, stage: 'in_progress', runId: run_id });
    pollMcpCallUntilTerminal(conversationId, run_id); // fire-and-forget, same as Phase 1
    return 'Call started. I will let you know when it finishes.';
  }

  return 'A call is already in progress for this conversation.';
}

async function pollMcpCallUntilTerminal(conversationId: string, runId: string): Promise<void> {
  const TERMINAL = new Set(['COMPLETED', 'FAILED', 'NO_ANSWER', 'DECLINED', 'CANCELED', 'CANCELLED', 'VOICEMAIL', 'BUSY', 'EXPIRED']);
  for (;;) {
    await new Promise((r) => setTimeout(r, 10_000));
    const result = await getCallRun(runId);
    const status = String(result.status || '').toUpperCase();
    if (TERMINAL.has(status)) {
      const record = records.get(conversationId);
      if (record) {
        records.set(conversationId, {
          ...record,
          stage: status === 'COMPLETED' ? 'completed' : 'failed',
          structuredResult: result.structuredContent,
          summary: typeof (result as any).summary === 'string' ? (result as any).summary : record.summary
        });
      }
      return;
    }
  }
}

// Boot-time recovery, same principle as Phase 1's recoverInterruptedOutreachCalls:
// a run left 'in_progress' from a prior session gets exactly one get_call_run
// check. run_call is NEVER retried here -- CALL-E's own docs say not to, and
// unlike the REST path there is no idempotency key to make a retry safe.
export async function recoverInterruptedMcpOutreachCalls(): Promise<void> {
  for (const [conversationId, record] of records) {
    if (record.stage === 'in_progress' && record.runId) {
      pollMcpCallUntilTerminal(conversationId, record.runId);
    }
  }
}
```

Note: because `records` is an in-memory `Map`, `recoverInterruptedMcpOutreachCalls()` as
written above only has something to recover within the same app session (e.g. after a
transient network blip), not across a full app restart — an in-memory map is empty on a
fresh boot. If recovering across a full restart is wanted, `records` needs the same
`kv_set`/`kv_get` persistence `chatPersistenceService.ts` already uses; this is called out
explicitly here rather than silently assumed, and is a one-line decision to make in the
implementation plan (persist now vs. defer, matching Phase 1's own explicit deferral of a
similar boot-recovery-wiring decision).

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

This is intentionally broad (a follow-up "confirm"/"cancel" reply, and any mid-clarification
answer, are routed by `ChatView.tsx` checking `getMcpOutreachRecord(conversationId)` for an
active record *before* falling back to this fresh-intent matcher — an active record always
wins, regardless of what the new message's text looks like).

### 5. `ChatView.tsx` (modified)

Before the existing `shouldRouteThroughJose` check, add:

```ts
const activeMcpOutreach = getMcpOutreachRecord(conversationId);
if (activeMcpOutreach && activeMcpOutreach.stage !== 'completed' && activeMcpOutreach.stage !== 'failed') {
  const reply = await handleMcpOutreachMessage(conversationId, text);
  // post `reply` as an assistant message, return
} else if (shouldRouteThroughCalleMcp(text)) {
  const reply = await handleMcpOutreachMessage(conversationId, text);
  // post `reply` as an assistant message, return
}
```

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
4. Assistant reply shows that question; record stored `stage: 'clarifying'`.
5. User replies with the phone number.
6. Active record found → `planCall(goal, {answer_0: phoneNumber})` → now `ready_to_run: true` with a `plan_id`/`confirm_token`/`summary`.
7. Assistant reply shows the plan summary, asks for "confirm".
8. User replies "confirm" → policy gate checked (paid + high-risk, same as Phase 1) → `runCall(plan_id, confirm_token)` → `run_id` stored, `stage: 'in_progress'`.
9. Background poll (`pollMcpCallUntilTerminal`) checks `get_call_run` every 10s until terminal, then updates the record with `structuredContent`/summary.
10. (Not yet wired to a UI surface for the terminal result — see "What this does not build" below.)

## Error handling

- Network/HTTP failure at any `planCall`/`runCall`/`getCallRun` step surfaces as a plain
  assistant error message; no partial `McpOutreachRecord` is left in an ambiguous stage (a
  thrown error before `records.set(...)` runs leaves the prior stage untouched, so the user
  can retry their last message).
- Expired token (`isCalleMcpConfigured()` false) at any point returns "CALL-E MCP not
  connected. Connect via Settings first." rather than attempting a browser-login flow from
  inside a chat reply (login requires opening a browser, which belongs in Settings, not an
  autonomous action mid-conversation).
- `run_call`'s lack of idempotency is handled by never calling it more than once per
  `plan_id`/`confirm_token` pair — once `runCall` returns a `run_id` and the record moves to
  `in_progress`, no code path calls `runCall` again for that record. Recovery only ever polls
  `getCallRun`.

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
  confirm → in_progress → terminal; "cancel" drops the record; policy-gate block path;
  `recoverInterruptedMcpOutreachCalls` only calls `getCallRun`, never `runCall`, for an
  `in_progress` record.
- `ChatView` integration test: an active `McpOutreachRecord` for a conversation routes the
  next message through `handleMcpOutreachMessage` even when that message's text alone
  wouldn't match `shouldRouteThroughCalleMcp` (e.g. a bare phone number, or "confirm").

## What this does not fix / build

- No UI surface yet shows a completed `McpOutreachRecord`'s final summary/transcript beyond
  a plain assistant chat message — no history list like Phase 1's panel. Deferred, same
  reasoning as Phase 1's own deferred final-UI-placement decision (pending the in-progress UI
  redesign).
- `records` (the conversational state map) is in-memory only in this design; cross-restart
  recovery is a named, explicit follow-up decision, not a silent gap (see the note under
  §3 above).
- `plan_call`'s exact argument schema (`goal`/`answers` above) still needs a one-time live
  confirmation via `tools/list`/`plan_call` once the user's CALL-E account access issue is
  resolved — flagged explicitly above, not silently guessed as final. `MCP_PROTOCOL_VERSION`
  and the broker's session-secret header are already confirmed from `@call-e/core`'s source.
- No changes to the Phase 1 REST connector, panel, or its policy/registry wiring — this is
  additive only.
