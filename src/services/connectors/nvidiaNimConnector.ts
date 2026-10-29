import { invoke } from '@tauri-apps/api/core';
import { getConnectorCredential } from './connectorAuth';
import { evaluatePolicyGate } from '../policyEnforcementService';

const NVIDIA_API_BASE = 'https://integrate.api.nvidia.com/v1';

type NvidiaPath = 'models' | 'chat/completions';

interface NvidiaResponse {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<any>;
}

/**
 * One call to NVIDIA NIM. NVIDIA sends no Access-Control-Allow-Origin, so a fetch from the
 * desktop window always failed with "Failed to fetch" (QA batch 1). Inside the app the call
 * goes through the backend's connector_nvidia_request (NVIDIA's two addresses only); a plain
 * fetch is kept for the browser dev build.
 */
async function nvidiaRequest(path: NvidiaPath, apiKey: string, body?: string): Promise<NvidiaResponse> {
  if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__) {
    const proof = await invoke<{ ok: boolean; httpStatus: number | null; body: string | null; error: string | null }>(
      'connector_nvidia_request',
      { path, body: body ?? null, apiKey }
    );
    if (proof.httpStatus === null) {
      throw new Error(`Couldn't reach NVIDIA NIM: ${proof.error || 'no answer'}`);
    }
    const text = proof.body ?? '';
    return { ok: proof.ok, status: proof.httpStatus, text: async () => text, json: async () => JSON.parse(text) };
  }
  return fetch(`${NVIDIA_API_BASE}/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body }),
  });
}
// meta/llama-3.1-8b-instruct is one of NVIDIA NIM's widely-available free-tier
// chat models as of 2026-07-23. Reconfirm against build.nvidia.com's current
// catalog before assuming this stays free/available long-term — see
// docs/superpowers/plans/2026-07-23-free-tier-cloud-providers.md §2.1.
export const DEFAULT_MODEL = 'meta/llama-3.1-8b-instruct';

export interface NvidiaMessage {
  role: string;
  content: string;
}

export interface NvidiaChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface NvidiaChatSuccess {
  ok: true;
  content: string;
  model: string;
  usage: any;
  provider: 'nvidia_nim';
}

export interface NvidiaRateLimited {
  ok: false;
  rateLimited: true;
  status: number;
  message: string;
  provider: 'nvidia_nim';
}

export type NvidiaSendResult = NvidiaChatSuccess | NvidiaRateLimited;

export function isNvidiaConfigured(): boolean {
  return Boolean(getConnectorCredential('nvidia_nim', 'NVIDIA_API_KEY'));
}

export async function sendNvidiaMessage(
  messages: NvidiaMessage[],
  { model = DEFAULT_MODEL, maxTokens = 2048, temperature = 0.7 }: NvidiaChatOptions = {}
): Promise<NvidiaSendResult> {
  const apiKey = getConnectorCredential('nvidia_nim', 'NVIDIA_API_KEY');
  if (!apiKey) throw new Error('NVIDIA API key not configured');

  const gate = evaluatePolicyGate({
    connectorId: 'nvidia_nim',
    actionType: 'chat',
    commandPreview: JSON.stringify({ model, messages, maxTokens, temperature }),
    approved: false,
    auth: { enabled: false, isAuthorized: false }
  });
  if (!gate.ok) {
    throw new Error(gate.reason || 'Policy gate blocked');
  }

  const r = await nvidiaRequest('chat/completions', apiKey, JSON.stringify({
    model,
    messages,
    max_tokens: maxTokens,
    temperature
  }));

  if (r.status === 429) {
    const err = await r.text();
    return { ok: false, rateLimited: true, status: 429, message: err || 'NVIDIA NIM rate limit exceeded', provider: 'nvidia_nim' };
  }

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`NVIDIA NIM API error ${r.status}: ${err}`);
  }

  const data = await r.json();
  return {
    ok: true,
    content: data.choices?.[0]?.message?.content || '',
    model: data.model || model,
    usage: data.usage || null,
    provider: 'nvidia_nim'
  };
}

export async function listNvidiaModels(): Promise<string[]> {
  const apiKey = getConnectorCredential('nvidia_nim', 'NVIDIA_API_KEY');
  if (!apiKey) throw new Error('NVIDIA API key not configured');

  const gate = evaluatePolicyGate({
    connectorId: 'nvidia_nim',
    actionType: 'list_models',
    commandPreview: 'list_models',
    approved: false,
    auth: { enabled: false, isAuthorized: false }
  });
  if (!gate.ok) {
    throw new Error(gate.reason || 'Policy gate blocked');
  }

  const r = await nvidiaRequest('models', apiKey);
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`NVIDIA NIM API error ${r.status}: ${err}`);
  }
  const data = await r.json();
  return (data.data || []).map((m: { id: string }) => m.id);
}
