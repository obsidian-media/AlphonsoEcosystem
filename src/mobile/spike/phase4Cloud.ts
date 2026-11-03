// Phone phase 4 test round (throwaway, spike/phone-phase4): free cloud models called from the
// phone itself, with a free key kept in the phone's keychain (owner: free models only). The way
// requests are sent (the web view's fetch, or Capacitor's native HTTP) is passed in, so the test
// screen can compare both and these functions stay testable.
// Design: docs/superpowers/specs/2026-11-02-alphonso-mobile-phase4-design.md
import { OPENROUTER_CHOOSE_FREE } from '../../services/connectors/openRouterConnector';
import { redactKeys, type SpikeAnswer } from './phase4Score';

export type CloudProvider = 'openrouter' | 'nvidia' | 'gemini';

export type HttpCall = (req: { url: string; method: 'GET' | 'POST'; headers: Record<string, string>; body?: unknown }) => Promise<{ status: number; data: unknown }>;

// The same addresses the desktop's connectors use (openRouterConnector.ts, nvidiaNimConnector.ts, geminiConnector.ts).
const BASE: Record<CloudProvider, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  nvidia: 'https://integrate.api.nvidia.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
};

/** How many of NVIDIA's listed models are tried before giving up (NVIDIA lists models it no longer serves). */
const NVIDIA_TRIES = 3;

function headers(provider: CloudProvider, key: string): Record<string, string> {
  return provider === 'gemini'
    ? { 'Content-Type': 'application/json', 'x-goog-api-key': key }
    : { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
}

function chatRequest(provider: CloudProvider, key: string, model: string, system: string, prompt: string): Parameters<HttpCall>[0] {
  if (provider === 'gemini') {
    const name = model.replace(/^models\//, '');
    return {
      url: `${BASE.gemini}/models/${name}:generateContent`,
      method: 'POST',
      headers: headers('gemini', key),
      body: { ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), contents: [{ role: 'user', parts: [{ text: prompt }] }] },
    };
  }
  return {
    url: `${BASE[provider]}/chat/completions`,
    method: 'POST',
    headers: headers(provider, key),
    body: { model, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }] },
  };
}

function textOf(provider: CloudProvider, data: unknown): string {
  const d = data as { choices?: { message?: { content?: string } }[]; candidates?: { content?: { parts?: { text?: string }[] } }[] };
  if (provider === 'gemini') return (d?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  return String(d?.choices?.[0]?.message?.content ?? '');
}

function errorOf(status: number, data: unknown): string {
  const d = data as { error?: { message?: string } | string } | null;
  const message = typeof d?.error === 'string' ? d.error : d?.error?.message || JSON.stringify(data ?? '').slice(0, 200);
  return `HTTP ${status}: ${message}`;
}

/** One answer from a free cloud model; a failure is recorded once, never retried. */
export async function askCloud(provider: CloudProvider, http: HttpCall, key: string, model: string, system: string, prompt: string): Promise<SpikeAnswer> {
  const started = Date.now();
  const base = { questionId: '', engine: `cloud:${provider}`, model };
  try {
    const res = await http(chatRequest(provider, key, model, system, prompt));
    const ms = Date.now() - started;
    if (res.status < 200 || res.status >= 300) return { ...base, text: null, ms, error: redactKeys(errorOf(res.status, res.data)) };
    const text = textOf(provider, res.data);
    return { ...base, text: redactKeys(text), ms, error: text.trim() ? null : 'empty answer' };
  } catch (e) {
    return { ...base, text: null, ms: Date.now() - started, error: redactKeys(String((e as Error)?.message || e)) };
  }
}

/** A free model from the provider's own live list; no model id is written here besides OpenRouter's free router. */
export async function pickFreeModel(provider: CloudProvider, http: HttpCall, key: string): Promise<{ model: string } | { error: string }> {
  if (provider === 'openrouter') return { model: OPENROUTER_CHOOSE_FREE };
  try {
    const listUrl = provider === 'gemini' ? `${BASE.gemini}/models` : `${BASE.nvidia}/models`;
    const list = await http({ url: listUrl, method: 'GET', headers: headers(provider, key) });
    if (list.status !== 200) return { error: redactKeys(errorOf(list.status, list.data)) };
    if (provider === 'gemini') {
      const models = (list.data as { models?: { name: string; supportedGenerationMethods?: string[] }[] })?.models || [];
      const pick = models.find((m) => /flash/i.test(m.name) && (m.supportedGenerationMethods || []).includes('generateContent'));
      return pick ? { model: pick.name } : { error: 'No flash model that can answer in the list.' };
    }
    const ids = ((list.data as { data?: { id: string }[] })?.data || []).map((m) => m.id);
    for (const id of ids.slice(0, NVIDIA_TRIES)) {
      const a = await askCloud('nvidia', http, key, id, '', 'Answer with one word: ready?');
      if (!a.error) return { model: id };
    }
    return { error: `None of the first ${NVIDIA_TRIES} listed models answered.` };
  } catch (e) {
    return { error: redactKeys(String((e as Error)?.message || e)) };
  }
}

/** The same small request through the web view's fetch and through native HTTP. */
export async function probeTransport(provider: CloudProvider, key: string, transports: { fetch: HttpCall; native: HttpCall }): Promise<{ fetch: string; native: string }> {
  const req = { url: provider === 'openrouter' ? `${BASE.openrouter}/models` : provider === 'gemini' ? `${BASE.gemini}/models` : `${BASE.nvidia}/models`, method: 'GET' as const, headers: headers(provider, key) };
  const one = async (call: HttpCall) => {
    try {
      const res = await call(req);
      return res.status >= 200 && res.status < 300 ? 'ok' : redactKeys(`HTTP ${res.status}`);
    } catch (e) {
      return redactKeys(`blocked: ${String((e as Error)?.message || e)}`);
    }
  };
  return { fetch: await one(transports.fetch), native: await one(transports.native) };
}
