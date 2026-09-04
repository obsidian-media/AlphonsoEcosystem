import { getConnectorCredential } from './connectorAuth';
import { evaluatePolicyGate } from '../policyEnforcementService';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
// gemini-3.5-flash-lite, confirmed live against the real API on 2026-09-04
// with a real key -- gemini-2.5-flash-lite (the previous default) and
// gemini-2.5-flash both now 404 with "no longer available to new users",
// pointing callers to gemini-3.5-flash-lite / gemini-3.6-flash respectively.
// Reconfirm at ai.google.dev/gemini-api/docs before assuming this stays
// current -- Google has now retired this connector's default model twice
// in under two months. See docs/superpowers/plans/2026-07-23-free-tier-cloud-providers.md §2.2.
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

export interface GeminiMessage {
  role: string;
  content: string;
}

export interface GeminiChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface GeminiChatSuccess {
  ok: true;
  content: string;
  model: string;
  usage: any;
  provider: 'gemini';
}

export interface GeminiRateLimited {
  ok: false;
  rateLimited: true;
  status: number;
  message: string;
  provider: 'gemini';
}

export type GeminiSendResult = GeminiChatSuccess | GeminiRateLimited;

export function isGeminiConfigured(): boolean {
  return Boolean(getConnectorCredential('gemini', 'GEMINI_API_KEY'));
}

function toGeminiRole(role: string): string {
  return role === 'assistant' ? 'model' : 'user';
}

export async function sendGeminiMessage(
  messages: GeminiMessage[],
  { model = DEFAULT_MODEL, maxTokens = 2048, temperature = 0.7 }: GeminiChatOptions = {}
): Promise<GeminiSendResult> {
  const apiKey = getConnectorCredential('gemini', 'GEMINI_API_KEY');
  if (!apiKey) throw new Error('Gemini API key not configured');

  const gate = evaluatePolicyGate({
    connectorId: 'gemini',
    actionType: 'chat',
    commandPreview: JSON.stringify({ model, messages, maxTokens, temperature }),
    approved: false,
    auth: { enabled: false, isAuthorized: false }
  });
  if (!gate.ok) {
    throw new Error(gate.reason || 'Policy gate blocked');
  }

  const systemMessages = messages.filter((m) => m.role === 'system');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: toGeminiRole(m.role), parts: [{ text: m.content }] }));
  const systemInstruction = systemMessages.length > 0
    ? { parts: [{ text: systemMessages.map((m) => m.content).join('\n\n') }] }
    : undefined;

  const r = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(systemInstruction ? { systemInstruction } : {}),
      contents,
      generationConfig: { maxOutputTokens: maxTokens, temperature }
    })
  });

  if (r.status === 429) {
    const err = await r.text();
    return { ok: false, rateLimited: true, status: 429, message: err || 'Gemini rate limit exceeded', provider: 'gemini' };
  }

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Gemini API error ${r.status}: ${err}`);
  }

  const data = await r.json();
  return {
    ok: true,
    content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
    model,
    usage: data.usageMetadata || null,
    provider: 'gemini'
  };
}
