// OpenRouter (2026-10-30): one key that reaches OpenRouter's free models, its paid models,
// and models served by the user's own provider keys added in OpenRouter. Inside the desktop
// app every call goes through the backend's connector_openrouter_request (three OpenRouter
// addresses only), like NVIDIA; a plain fetch is kept for the browser dev build.
// No model id is written here: every list comes from OpenRouter itself.
import { invoke } from '@tauri-apps/api/core';
import { getConnectorCredential } from './connectorAuth';
import { evaluatePolicyGate } from '../policyEnforcementService';

const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
const MODELS_KEEP_MS = 10 * 60 * 1000;
const KEY_INFO_KEEP_MS = 60 * 1000;

export const OPENROUTER_KEY_REFUSED = 'OpenRouter refused the key. Check it in Settings → Connectors.';
export const OPENROUTER_NO_TEXT = "OpenRouter's model returned no text.";
export const OPENROUTER_NO_KEY = 'No OpenRouter key saved. Add it in Settings → Connectors.';
/** The router that picks one of OpenRouter's free models itself. */
export const OPENROUTER_CHOOSE_FREE = 'openrouter/free';

type OpenRouterPath = 'models' | 'key' | 'chat/completions';

interface RawAnswer {
  httpStatus: number | null;
  body: string;
  error: string | null;
  retryAfterSecs: number | null;
  resetMs: number | null;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  contextLength: number;
  /** USD per token; null when OpenRouter lists no usable price (missing, negative or not a number). */
  promptUsdPerToken: number | null;
  completionUsdPerToken: number | null;
  free: boolean;
  expiresAtMs: number | null;
}

export interface OpenRouterKeyInfo {
  freeUsed: number;
  freeLimit: number;
  freeRemaining: number;
  isFreeTier: boolean;
}

export interface OpenRouterMessage {
  role: string;
  content: string;
}

export type OpenRouterSendResult =
  | { ok: true; content: string; model: string; costUsd: number; usage: { promptTokens: number; completionTokens: number } }
  | {
      ok: false;
      kind: 'rate_limited' | 'key_refused' | 'not_served' | 'no_text' | 'failed';
      message: string;
      providerLimited?: boolean;
      retryAfterSecs?: number;
      resetMs?: number;
    };

let modelsCache: { atMs: number; models: OpenRouterModel[] } | null = null;
let keyInfoCache: { atMs: number; info: OpenRouterKeyInfo | null } | null = null;

export function resetOpenRouterCacheForTests(): void {
  modelsCache = null;
  keyInfoCache = null;
}

function savedKey(): string {
  return getConnectorCredential('openrouter', 'OPENROUTER_API_KEY') || '';
}

export function isOpenRouterConfigured(): boolean {
  return Boolean(savedKey());
}

const inDesktopApp = () => typeof window !== 'undefined' && Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__);

async function openRouterRequest(path: OpenRouterPath, body?: string, timeoutSecs?: number): Promise<RawAnswer> {
  const apiKey = savedKey();
  if (inDesktopApp()) {
    const proof = await invoke<{ ok: boolean; httpStatus: number | null; body: string | null; error: string | null; retryAfterSecs: number | null; resetMs: number | null }>(
      'connector_openrouter_request',
      { path, body: body ?? null, apiKey: apiKey || null, timeoutSecs: timeoutSecs ?? null }
    );
    return {
      httpStatus: proof.httpStatus,
      body: proof.body ?? '',
      error: proof.error,
      retryAfterSecs: proof.retryAfterSecs ?? null,
      resetMs: proof.resetMs ?? null,
    };
  }
  try {
    const response = await fetch(`${OPENROUTER_API_BASE}/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(path === 'models' || !apiKey ? {} : { Authorization: `Bearer ${apiKey}` }),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body }),
      ...(timeoutSecs ? { signal: AbortSignal.timeout(timeoutSecs * 1000) } : {}),
    });
    const number = (name: string) => {
      const value = Number(response.headers.get(name));
      return Number.isFinite(value) && value > 0 ? value : null;
    };
    return { httpStatus: response.status, body: await response.text(), error: null, retryAfterSecs: number('Retry-After'), resetMs: number('X-RateLimit-Reset') };
  } catch (error) {
    return { httpStatus: null, body: '', error: error instanceof Error ? error.message : String(error), retryAfterSecs: null, resetMs: null };
  }
}

function parse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function price(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** OpenRouter's models, free and paid, kept for ten minutes. Empty when the list can't be read. */
export async function listOpenRouterModels(): Promise<OpenRouterModel[]> {
  if (modelsCache && Date.now() - modelsCache.atMs < MODELS_KEEP_MS) return modelsCache.models;
  const answer = await openRouterRequest('models');
  const rows = answer.httpStatus === 200 ? parse(answer.body)?.data : null;
  if (!Array.isArray(rows)) return [];
  const models = rows
    .filter((row: any) => row && typeof row.id === 'string')
    .map((row: any): OpenRouterModel => {
      const expires = row.expiration_date ? Date.parse(row.expiration_date) : NaN;
      return {
        id: row.id,
        name: typeof row.name === 'string' && row.name ? row.name : row.id,
        contextLength: Number(row.context_length) || 0,
        promptUsdPerToken: price(row.pricing?.prompt),
        completionUsdPerToken: price(row.pricing?.completion),
        free: row.id.endsWith(':free') || row.id === OPENROUTER_CHOOSE_FREE,
        expiresAtMs: Number.isFinite(expires) ? expires : null,
      };
    });
  modelsCache = { atMs: Date.now(), models };
  return models;
}

/** The free requests left today for the saved key, kept for a minute. Null when it can't be read. */
export async function getOpenRouterKeyInfo(): Promise<OpenRouterKeyInfo | null> {
  if (keyInfoCache && Date.now() - keyInfoCache.atMs < KEY_INFO_KEEP_MS) return keyInfoCache.info;
  if (!savedKey()) return null;
  const answer = await openRouterRequest('key');
  const data = answer.httpStatus === 200 ? parse(answer.body)?.data : null;
  const daily = data?.free_model_daily_requests;
  const info: OpenRouterKeyInfo | null = daily && typeof daily === 'object'
    ? {
        freeUsed: Number(daily.used) || 0,
        freeLimit: Number(daily.limit) || 0,
        freeRemaining: Number(daily.remaining) || 0,
        isFreeTier: data.is_free_tier === true,
      }
    : null;
  keyInfoCache = { atMs: Date.now(), info };
  return info;
}

/** Forget the cached key info, so the next read asks OpenRouter (after a rate limit). */
export function forgetOpenRouterKeyInfo(): void {
  keyInfoCache = null;
}

export async function sendOpenRouterMessage(
  messages: OpenRouterMessage[],
  options: { model: string; maxTokens?: number; timeoutSecs?: number }
): Promise<OpenRouterSendResult> {
  if (!savedKey()) return { ok: false, kind: 'failed', message: OPENROUTER_NO_KEY };
  const gate = evaluatePolicyGate({
    connectorId: 'openrouter',
    actionType: 'chat',
    commandPreview: JSON.stringify({ model: options.model, messages }),
    approved: false,
    auth: { enabled: false, isAuthorized: false },
  });
  if (!gate.ok) return { ok: false, kind: 'failed', message: gate.reason || 'Blocked by policy.' };

  const answer = await openRouterRequest('chat/completions', JSON.stringify({
    model: options.model,
    messages,
    ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
  }), options.timeoutSecs);
  if (answer.httpStatus === null) return { ok: false, kind: 'failed', message: `Couldn't reach OpenRouter: ${answer.error || 'no answer'}` };

  const data = parse(answer.body);
  const error = data?.error;
  const errorMessage = typeof error?.message === 'string' ? error.message : '';
  if (answer.httpStatus === 401 || answer.httpStatus === 403) return { ok: false, kind: 'key_refused', message: OPENROUTER_KEY_REFUSED };
  if (answer.httpStatus === 429) {
    return {
      ok: false,
      kind: 'rate_limited',
      message: errorMessage || 'OpenRouter rate limit exceeded.',
      providerLimited: Boolean(error?.metadata?.provider_code),
      ...(answer.retryAfterSecs ? { retryAfterSecs: answer.retryAfterSecs } : {}),
      ...(answer.resetMs ? { resetMs: answer.resetMs } : {}),
    };
  }
  if (answer.httpStatus === 404 || /^no endpoints found/i.test(errorMessage)) {
    return { ok: false, kind: 'not_served', message: `OpenRouter no longer serves ${options.model}.` };
  }
  if (answer.httpStatus < 200 || answer.httpStatus >= 300 || error) {
    return { ok: false, kind: 'failed', message: `OpenRouter error ${answer.httpStatus}: ${errorMessage || 'no details'}` };
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) return { ok: false, kind: 'no_text', message: OPENROUTER_NO_TEXT };
  const usage = data?.usage || {};
  const charged = Number(usage.cost) || 0;
  const ownKey = usage.is_byok === true ? Number(usage.cost_details?.upstream_inference_cost) || 0 : 0;
  return {
    ok: true,
    content,
    model: typeof data.model === 'string' ? data.model : options.model,
    costUsd: charged + ownKey,
    usage: { promptTokens: Number(usage.prompt_tokens) || 0, completionTokens: Number(usage.completion_tokens) || 0 },
  };
}
