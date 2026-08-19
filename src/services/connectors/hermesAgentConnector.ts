import { getConnectorCredential, saveConnectorCredential } from './connectorAuth';
import { evaluatePolicyGate } from '../policyEnforcementService';

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

export interface HermesChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
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

export type HermesSendResult = HermesChatSuccess | HermesRateLimited;

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
    const r = await fetch(`${normalizeBaseUrl(url)}/health`, { signal: AbortSignal.timeout(5000) });
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

  const r = await fetch(`${normalizeBaseUrl(url)}/v1/models`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10000)
  });
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
  { model = 'hermes-agent', maxTokens = 2048, temperature = 0.7 }: HermesChatOptions = {}
): Promise<HermesSendResult> {
  const { url, key } = getHermesAgentEndpoint(agentId);
  if (!url || !key) throw new Error(`Hermes endpoint not configured for agent "${agentId}"`);

  const gate = evaluatePolicyGate({
    connectorId: 'hermes_agents',
    actionType: 'chat',
    commandPreview: JSON.stringify({ agentId, model, messages, maxTokens, temperature }),
    approved: false,
    auth: { enabled: false, isAuthorized: false }
  });
  if (!gate.ok) {
    throw new Error(gate.reason || 'Policy gate blocked');
  }

  const r = await fetch(`${normalizeBaseUrl(url)}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: false
    }),
    signal: AbortSignal.timeout(120000)
  });

  if (r.status === 429) {
    const err = await r.text();
    return { ok: false, rateLimited: true, status: 429, message: err || 'Hermes profile rate limit exceeded', provider: 'hermes' };
  }

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Hermes API error ${r.status}: ${err}`);
  }

  const data = await r.json();
  return {
    ok: true,
    content: data.choices?.[0]?.message?.content || '',
    model: data.model || model,
    usage: data.usage || null,
    provider: 'hermes'
  };
}
