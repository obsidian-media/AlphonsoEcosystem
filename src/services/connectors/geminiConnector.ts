import { getConnectorCredential } from './connectorAuth';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
// gemini-1.5-flash is a Google AI Studio free-tier-eligible model as of
// 2026-07-23. Google's free-tier model list is narrower than its full
// catalog and does shift — reconfirm at aistudio.google.com before assuming
// this (or any Gemini model) stays free-tier-eligible. See
// docs/superpowers/plans/2026-07-23-free-tier-cloud-providers.md §2.2.
const DEFAULT_MODEL = 'gemini-1.5-flash';

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

  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: toGeminiRole(m.role), parts: [{ text: m.content }] }));

  const r = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
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
