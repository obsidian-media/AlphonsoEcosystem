// OpenRouter's free models, called from the phone (phone phase 4, owner 2026-11-02): only the free
// router, with a free key the user typed on the phone and kept in its keychain. The phone's native
// HTTP does the call (the test round used it). No error ever carries the key.
import { OPENROUTER_CHOOSE_FREE } from '../connectors/openRouterConnector';
import type { Ask } from './phoneAnswer';

export const PHONE_OPENROUTER_KEY = 'phone_openrouter_key';
const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

export type PhoneHttp = (req: { url: string; method: 'POST'; headers: Record<string, string>; body: unknown }) => Promise<{ status: number; data: unknown }>;

export function openRouterAsk(http: PhoneHttp, key: string): Ask {
  return async (system, prompt) => {
    const messages = [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }];
    let res: { status: number; data: unknown };
    try {
      res = await http({
        url: CHAT_URL,
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: { model: OPENROUTER_CHOOSE_FREE, messages },
      });
    } catch {
      throw new Error("OpenRouter couldn't be reached.");
    }
    if (res.status === 429) throw new Error("OpenRouter's free limit is used up for now. Try again later, or wait for your computer.");
    if (res.status === 401 || res.status === 403) throw new Error('OpenRouter refused the key. Check it in Settings → On this phone.');
    if (res.status < 200 || res.status >= 300) throw new Error(`OpenRouter answered with an error (${res.status}).`);
    const data = (typeof res.data === 'string' ? safeJson(res.data) : res.data) as { choices?: Array<{ message?: { content?: unknown } }> } | null;
    return String(data?.choices?.[0]?.message?.content ?? '');
  };
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}
