// Phone phase 4: OpenRouter's free models from the phone, with the key typed on the phone.
import { describe, expect, it } from 'vitest';
import { openRouterAsk, PHONE_OPENROUTER_KEY, type PhoneHttp } from '../../../services/phone/phoneOpenRouter';
import { OPENROUTER_CHOOSE_FREE } from '../../../services/connectors/openRouterConnector';

const KEY = 'sk-or-v1-abcdef1234567890abcdef1234567890';

function http(reply: { status: number; data: unknown } | Error) {
  const calls: Parameters<PhoneHttp>[0][] = [];
  const fn: PhoneHttp = async (req) => { calls.push(req); if (reply instanceof Error) throw reply; return reply; };
  return { fn, calls };
}

describe('openRouterAsk', () => {
  it("asks OpenRouter's free router with the key and returns the answer", async () => {
    const h = http({ status: 200, data: { choices: [{ message: { content: 'Hello.' } }] } });
    expect(await openRouterAsk(h.fn, KEY)('sys', 'hi')).toBe('Hello.');
    expect(h.calls[0].url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(h.calls[0].method).toBe('POST');
    expect(h.calls[0].headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(h.calls[0].body).toMatchObject({ model: OPENROUTER_CHOOSE_FREE, messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }] });
  });

  it('leaves out an empty system prompt', async () => {
    const h = http({ status: 200, data: { choices: [{ message: { content: 'x' } }] } });
    await openRouterAsk(h.fn, KEY)('', 'hi');
    expect((h.calls[0].body as { messages: unknown[] }).messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it.each([
    [{ status: 429, data: { error: { message: `limit for ${KEY}` } } }, "OpenRouter's free limit is used up for now. Try again later, or wait for your computer."],
    [{ status: 401, data: { error: { message: `bad key ${KEY}` } } }, 'OpenRouter refused the key. Check it in More → On this phone.'],
    [new TypeError(`Load failed ${KEY}`), "OpenRouter couldn't be reached."],
    [{ status: 500, data: { error: { message: `oops ${KEY}` } } }, 'OpenRouter answered with an error (500).'],
  ])('says plainly why it failed, never with the key', async (reply, message) => {
    const err = await openRouterAsk(http(reply as never).fn, KEY)('', 'hi').catch((e: Error) => e);
    expect((err as Error).message).toBe(message);
    expect(String((err as Error).message)).not.toContain('abcdef1234567890');
  });

  it('keeps the key under its own name in the keychain', () => {
    expect(PHONE_OPENROUTER_KEY).toBe('phone_openrouter_key');
  });
});
