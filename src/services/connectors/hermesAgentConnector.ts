import { invoke } from '@tauri-apps/api/core';
import { getConnectorCredential, saveConnectorCredential } from './connectorAuth';
import { evaluatePolicyGate } from '../policyEnforcementService';
import { appendConnectorAudit } from '../connectorRegistryService';
import * as rateLimiter from '../connectorRateLimiterService';
import * as circuitBreaker from '../connectorCircuitBreakerService';

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__);
}

interface HermesHttpResponse {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  // Mirrors native Response.json()'s own (unvalidated, caller-narrowed) return type.
  json: () => Promise<any>;
}

/**
 * Issues one HTTP request to a Hermes Agent profile.
 *
 * Inside Tauri (every real install), this goes through the native
 * `connector_hermes_agent_request` Rust command instead of the webview's
 * own `fetch()`. Hermes Agent is a third-party process the user runs on
 * their own arbitrary local port and was never built with this integration
 * in mind, so it has no reason to send CORS headers — a browser `fetch()`
 * from the Tauri webview (a different origin, e.g. `http://tauri.localhost`)
 * to that port is cross-origin, and without an `Access-Control-Allow-Origin`
 * response header the browser silently blocks it. Every call then surfaces
 * as the exact same uninformative `TypeError: Failed to fetch` regardless
 * of whether the real cause was CORS, a wrong port, or the profile being
 * genuinely offline — this was reported live as "Hermes ain't running and
 * usable" even with a real profile running and reachable by curl. A native
 * request has no browser and is not subject to CORS at all.
 *
 * Outside Tauri (browser dev mode, and this file's unit tests, which mock
 * `fetch` directly) falls back to a plain `fetch()` — unchanged behavior.
 */
async function hermesHttpRequest(
  url: string,
  method: 'GET' | 'POST',
  headers: Record<string, string>,
  body: string | undefined,
  timeoutMs: number
): Promise<HermesHttpResponse> {
  if (isTauriRuntime()) {
    const proof = await invoke<{ ok: boolean; httpStatus: number | null; body: string | null; error: string | null }>(
      'connector_hermes_agent_request',
      { url, method, headers, body: body ?? null, timeoutMs }
    );
    if (proof.httpStatus === null) {
      throw new Error(proof.error || 'Hermes request failed');
    }
    const bodyText = proof.body ?? '';
    return {
      ok: proof.ok,
      status: proof.httpStatus,
      text: async () => bodyText,
      json: async () => JSON.parse(bodyText)
    };
  }
  const init: RequestInit = { method, signal: AbortSignal.timeout(timeoutMs) };
  if (Object.keys(headers).length > 0) init.headers = headers;
  if (body !== undefined) init.body = body;
  return fetch(url, init);
}

const CONNECTOR_ID = 'hermes_agents';

// Tuned for a localhost profile, not a remote API: a multi-step Jose
// orchestration can legitimately need several calls in seconds, and a dead
// localhost process is usually noticed and restarted by the user quickly —
// so a higher throughput allowance and a shorter cooldown than the generic
// remote-API defaults (60 tokens/min, 5-failure/60s cooldown) both fit real
// local traffic without giving up the protection entirely.
// See docs/HERMES_AGENT_DELEGATION_PLAN.md §1b.1.
rateLimiter.configure(CONNECTOR_ID, { maxTokens: 300, refillRate: 300 });
circuitBreaker.configure(CONNECTOR_ID, { failureThreshold: 8, cooldownMs: 15_000 });

// Callers pass a "logical unit of work" id (a Boardroom threadId, a Jose
// packetId) as `sessionId` — those ids are generated with Math.random()
// elsewhere in the codebase (fine for their original purpose: a UI/storage
// key with no security implications). Sending that guessable value directly
// as X-Hermes-Session-Id would let anything that can guess/collide it read
// or inject into another unit of work's Hermes-side persistent memory
// grouping — a real CodeQL js/insecure-randomness finding, not a false
// positive. Instead, map each raw caller-supplied id to a fresh
// cryptographically-random UUID the first time it's seen, and reuse that
// mapping on subsequent calls for the same logical unit — this preserves
// "one thread/packet = one Hermes session" without the header value ever
// deriving from a weak PRNG.
const secureSessionIds = new Map<string, string>();

/**
 * Exported so callers can (and should) resolve a caller-side weak id — a
 * Boardroom threadId, a Jose packetId — to a secure value *before* it's ever
 * assigned into a `sessionId`-shaped parameter, not just inside this module.
 * CodeQL's taint tracker flags the raw Math.random()-derived value the
 * moment it's passed into a security-context parameter, regardless of a
 * transform happening further down the call chain — resolving at the
 * call site breaks that taint at its origin instead of relying on this
 * module's own internal (still-applied, defense-in-depth) call to the same
 * function inside `sendHermesAgentMessage`.
 */
export function resolveSecureSessionId(rawId: string): string {
  let secure = secureSessionIds.get(rawId);
  if (!secure) {
    secure = crypto.randomUUID();
    secureSessionIds.set(rawId, secure);
  }
  return secure;
}

// Hermes Agent (Nous Research, MIT) — a standalone agent framework the user
// runs separately from this app. A "profile" is a live, standing Hermes
// instance that mirrors one of AlphonsoEcosystem's own 9 agents (same soul,
// role, responsibility — see the profiles' own persona docs) and exposes an
// OpenAI-compatible REST API on its own local port.
//
// Credentials are stored per agent under the single `hermes_agents` connector
// id, keyed `<AGENTID>_URL` / `<AGENTID>_KEY` (uppercased agent id) — this
// reuses the existing flat connectorAuth key/value store exactly as every
// other connector does, rather than inventing a bespoke JSON blob.
//
// Design doc: docs/HERMES_AGENT_DELEGATION_PLAN.md §1.2 (gitignored, local to
// the machine this was authored on).

export interface HermesMessage {
  role: string;
  content: string;
}

export type HermesSessionMode = 'persistent' | 'stateless';

export interface HermesChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Pass through from the policy gate — see evaluatePolicyGate's `approved`. */
  approved?: boolean;
  /**
   * A stable id for the logical unit of work this call belongs to (one
   * orchestration receipt, one boardroom thread, etc.) — sent as
   * `X-Hermes-Session-Id` so the profile's own persistent memory can group
   * turns instead of seeing every call as an unrelated stranger. Only used
   * when `getHermesSessionMode(agentId)` is 'persistent' (the default).
   * See docs/HERMES_AGENT_DELEGATION_PLAN.md §1b.3.
   */
  sessionId?: string;
}

export interface HermesChatSuccess {
  ok: true;
  content: string;
  model: string;
  usage: unknown;
  provider: 'hermes';
}

export interface HermesRateLimited {
  ok: false;
  rateLimited: true;
  status: number;
  message: string;
  provider: 'hermes';
}

/** Policy gate blocked the call (Approval Mode, Zero-Cost Mode, license, etc.) — mirrors every other connector's blocked-result shape instead of throwing. */
export interface HermesBlocked {
  ok: false;
  blocked: true;
  message: string;
  provider: 'hermes';
}

/** Circuit breaker is open for this connector — profile likely down; fails fast instead of waiting out another timeout. */
export interface HermesCircuitOpen {
  ok: false;
  circuitOpen: true;
  message: string;
  provider: 'hermes';
}

export type HermesSendResult = HermesChatSuccess | HermesRateLimited | HermesBlocked | HermesCircuitOpen;

export interface HermesAgentEndpoint {
  url: string;
  key: string;
}

function urlKey(agentId: string): string {
  return `${agentId.toUpperCase()}_URL`;
}

function apiKeyKey(agentId: string): string {
  return `${agentId.toUpperCase()}_KEY`;
}

/** Reads a saved Hermes endpoint for one agent. Empty strings when unset. */
export function getHermesAgentEndpoint(agentId: string): HermesAgentEndpoint {
  return {
    url: getConnectorCredential('hermes_agents', urlKey(agentId)),
    key: getConnectorCredential('hermes_agents', apiKeyKey(agentId))
  };
}

export function saveHermesAgentEndpoint(agentId: string, url: string, key: string): void {
  saveConnectorCredential('hermes_agents', urlKey(agentId), url);
  saveConnectorCredential('hermes_agents', apiKeyKey(agentId), key);
}

/** True only if both a base URL and an API key are saved for this agent. */
export function isHermesAgentConfigured(agentId: string): boolean {
  const { url, key } = getHermesAgentEndpoint(agentId);
  return Boolean(url && key);
}

function sessionModeKey(agentId: string): string {
  return `${agentId.toUpperCase()}_SESSION_MODE`;
}

/**
 * 'persistent' (default) sends `X-Hermes-Session-Id` so the profile's own
 * memory groups turns by logical unit of work instead of treating every call
 * as a stateless stranger. 'stateless' opts a specific agent out (isolated
 * testing, or a profile the user doesn't want accumulating app state).
 * See docs/HERMES_AGENT_DELEGATION_PLAN.md §1b.3.
 */
export function getHermesSessionMode(agentId: string): HermesSessionMode {
  const saved = getConnectorCredential('hermes_agents', sessionModeKey(agentId));
  return saved === 'stateless' ? 'stateless' : 'persistent';
}

export function setHermesSessionMode(agentId: string, mode: HermesSessionMode): void {
  saveConnectorCredential('hermes_agents', sessionModeKey(agentId), mode);
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Reachability probe via the profile's `GET /health` route — confirmed
 * unauthenticated in `gateway/platforms/api_server.py`'s own route-list
 * docstring, so this never needs the saved API key. Used by the credential
 * UI to show connected/unreachable on save, not by the per-call dispatcher
 * (which resolves fresh per call rather than trusting a cached probe result
 * — see `generateAgentLlmResponse` in `src/lib/ollama.ts`).
 */
export async function getHermesAgentHealth(agentId: string): Promise<{ ok: boolean; error?: string }> {
  const { url } = getHermesAgentEndpoint(agentId);
  if (!url) return { ok: false, error: 'No endpoint configured' };
  try {
    const r = await hermesHttpRequest(`${normalizeBaseUrl(url)}/health`, 'GET', {}, undefined, 5000);
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Live model list from the profile's own `/v1/models` — never typed/guessed. */
export async function listHermesAgentModels(agentId: string): Promise<string[]> {
  const { url, key } = getHermesAgentEndpoint(agentId);
  if (!url || !key) throw new Error(`Hermes endpoint not configured for agent "${agentId}"`);

  const r = await hermesHttpRequest(`${normalizeBaseUrl(url)}/v1/models`, 'GET', { Authorization: `Bearer ${key}` }, undefined, 10000);
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Hermes API error ${r.status}: ${err}`);
  }
  const data = await r.json();
  return (data.data || []).map((m: { id: string }) => m.id);
}

export async function sendHermesAgentMessage(
  agentId: string,
  messages: HermesMessage[],
  { model = 'hermes-agent', maxTokens = 2048, temperature = 0.7, approved = false, sessionId }: HermesChatOptions = {}
): Promise<HermesSendResult> {
  const { url, key } = getHermesAgentEndpoint(agentId);
  if (!url || !key) throw new Error(`Hermes endpoint not configured for agent "${agentId}"`);

  if (circuitBreaker.isOpen(CONNECTOR_ID)) {
    appendConnectorAudit(CONNECTOR_ID, 'send_blocked_circuit_open', { agentId });
    return { ok: false, circuitOpen: true, message: `Hermes connector circuit is open (agent "${agentId}") — too many recent failures, cooling down.`, provider: 'hermes' };
  }

  const gate = evaluatePolicyGate({
    connectorId: CONNECTOR_ID,
    actionType: 'hermesAgentDelegation',
    commandPreview: JSON.stringify({ agentId, model, messages, maxTokens, temperature }),
    approved,
    auth: { enabled: false, isAuthorized: false }
  });
  if (!gate.ok) {
    appendConnectorAudit(CONNECTOR_ID, 'send_blocked_policy_gate', { agentId, reason: gate.reason });
    return { ok: false, blocked: true, message: gate.reason || 'Policy gate blocked', provider: 'hermes' };
  }

  if (!rateLimiter.checkLimit(CONNECTOR_ID).allowed) {
    appendConnectorAudit(CONNECTOR_ID, 'send_blocked_rate_limited', { agentId });
    return { ok: false, rateLimited: true, status: 429, message: 'Hermes connector rate limit exceeded (local throttle).', provider: 'hermes' };
  }
  rateLimiter.consume(CONNECTOR_ID);

  const sessionMode = getHermesSessionMode(agentId);
  const sessionHeader: Record<string, string> =
    sessionMode === 'persistent' && sessionId ? { 'X-Hermes-Session-Id': resolveSecureSessionId(sessionId) } : {};

  let r: HermesHttpResponse;
  try {
    r = await hermesHttpRequest(
      `${normalizeBaseUrl(url)}/v1/chat/completions`,
      'POST',
      {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...sessionHeader
      },
      JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: false
      }),
      120000
    );
  } catch (error) {
    circuitBreaker.recordFailure(CONNECTOR_ID);
    const message = error instanceof Error ? error.message : String(error);
    appendConnectorAudit(CONNECTOR_ID, 'send_failed_network', { agentId, error: message });
    throw new Error(`Hermes profile unreachable for agent "${agentId}": ${message}`);
  }

  if (r.status === 429) {
    const err = await r.text();
    appendConnectorAudit(CONNECTOR_ID, 'send_rate_limited_by_profile', { agentId, httpStatus: 429 });
    return { ok: false, rateLimited: true, status: 429, message: err || 'Hermes profile rate limit exceeded', provider: 'hermes' };
  }

  if (!r.ok) {
    circuitBreaker.recordFailure(CONNECTOR_ID);
    const err = await r.text();
    appendConnectorAudit(CONNECTOR_ID, 'send_failed', { agentId, httpStatus: r.status, error: err });
    throw new Error(`Hermes API error ${r.status}: ${err}`);
  }

  circuitBreaker.recordSuccess(CONNECTOR_ID);
  const data = await r.json();
  const resolvedModel = data.model || model;
  appendConnectorAudit(CONNECTOR_ID, 'send_success', { agentId, model: resolvedModel, sessionId: sessionId || null });
  return {
    ok: true,
    content: data.choices?.[0]?.message?.content || '',
    model: resolvedModel,
    usage: data.usage || null,
    provider: 'hermes'
  };
}
