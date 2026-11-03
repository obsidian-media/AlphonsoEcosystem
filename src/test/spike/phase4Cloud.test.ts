// Phone phase 4 test round (throwaway, spike/phone-phase4): free cloud models from the phone.
import { describe, expect, it } from 'vitest';
import { askCloud, pickFreeModel, probeTransport, type HttpCall } from '../../mobile/spike/phase4Cloud';
import { OPENROUTER_CHOOSE_FREE } from '../../services/connectors/openRouterConnector';

const KEY = 'sk-or-v1-abcdef1234567890abcdef1234567890';

function fakeHttp(reply: (req: Parameters<HttpCall>[0]) => { status: number; data: unknown }) {
  const calls: Parameters<HttpCall>[0][] = [];
  const http: HttpCall = async (req) => { calls.push(req); return reply(req); };
  return { http, calls };
}

describe('askCloud', () => {
  it('a 429 is recorded once with the reason and not retried', async () => {
    const { http, calls } = fakeHttp(() => ({ status: 429, data: { error: { message: 'Rate limit exceeded: free-models-per-day' } } }));
    const a = await askCloud('openrouter', http, KEY, OPENROUTER_CHOOSE_FREE, 'sys', 'hi');
    expect(calls).toHaveLength(1);
    expect(a.text).toBeNull();
    expect(a.error).toMatch(/429.*Rate limit/);
    expect(a.engine).toBe('cloud:openrouter');
  });

  it('a refused key is recorded and the key is not in the answer', async () => {
    const { http } = fakeHttp(() => ({ status: 401, data: { error: { message: `Invalid key ${KEY}` } } }));
    const a = await askCloud('openrouter', http, KEY, OPENROUTER_CHOOSE_FREE, 'sys', 'hi');
    expect(a.error).toMatch(/401/);
    expect(JSON.stringify(a)).not.toContain('abcdef1234567890abcdef');
  });

  it('reads an OpenAI-style answer from OpenRouter and NVIDIA', async () => {
    const { http, calls } = fakeHttp(() => ({ status: 200, data: { choices: [{ message: { content: 'Hello.' } }] } }));
    const a = await askCloud('nvidia', http, 'nvapi-x', 'some/model', 'sys', 'hi');
    expect(a.text).toBe('Hello.');
    expect(calls[0].url).toMatch(/^https:\/\/integrate\.api\.nvidia\.com\/v1\/chat\/completions$/);
    expect(calls[0].headers.Authorization).toBe('Bearer nvapi-x');
    expect((calls[0].body as { messages: unknown[] }).messages).toEqual([{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }]);
  });

  it('Gemini sends the system prompt as systemInstruction and the key in a header', async () => {
    const { http, calls } = fakeHttp(() => ({ status: 200, data: { candidates: [{ content: { parts: [{ text: 'Hi' }, { text: ' there' }] } }] } }));
    const a = await askCloud('gemini', http, 'AIza-x', 'models/gemini-x-flash', 'sys', 'hi');
    expect(a.text).toBe('Hi there');
    expect(calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-x-flash:generateContent');
    expect(calls[0].url).not.toContain('AIza');
    expect(calls[0].headers['x-goog-api-key']).toBe('AIza-x');
    expect(calls[0].body).toMatchObject({ systemInstruction: { parts: [{ text: 'sys' }] }, contents: [{ role: 'user', parts: [{ text: 'hi' }] }] });
  });
});

describe('pickFreeModel', () => {
  it('OpenRouter uses the free router without asking', async () => {
    const { http, calls } = fakeHttp(() => ({ status: 500, data: null }));
    expect(await pickFreeModel('openrouter', http, KEY)).toEqual({ model: OPENROUTER_CHOOSE_FREE });
    expect(calls).toHaveLength(0);
  });

  it('NVIDIA picks the first listed model that answers, trying at most 3', async () => {
    const { http, calls } = fakeHttp((req) => {
      if (req.method === 'GET') return { status: 200, data: { data: [{ id: 'a/one' }, { id: 'b/two' }, { id: 'c/three' }, { id: 'd/four' }] } };
      const model = (req.body as { model: string }).model;
      return model === 'c/three' ? { status: 200, data: { choices: [{ message: { content: 'ok' } }] } } : { status: 404, data: {} };
    });
    expect(await pickFreeModel('nvidia', http, 'nvapi-x')).toEqual({ model: 'c/three' });
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(3);
    const none = fakeHttp((req) => (req.method === 'GET' ? { status: 200, data: { data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] } } : { status: 404, data: {} }));
    expect(await pickFreeModel('nvidia', none.http, 'nvapi-x')).toHaveProperty('error');
    expect(none.calls.filter((c) => c.method === 'POST')).toHaveLength(3);
  });

  it('Gemini picks a flash model that can generate content from the live list', async () => {
    const { http } = fakeHttp(() => ({ status: 200, data: { models: [
      { name: 'models/text-embedding-x', supportedGenerationMethods: ['embedContent'] },
      { name: 'models/gemini-x-pro', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-x-flash', supportedGenerationMethods: ['generateContent'] },
    ] } }));
    expect(await pickFreeModel('gemini', http, 'AIza-x')).toEqual({ model: 'models/gemini-x-flash' });
  });
});

describe('probeTransport', () => {
  it('reports each way of calling separately, with the reason when one fails', async () => {
    const ok: HttpCall = async () => ({ status: 200, data: { data: [] } });
    const blocked: HttpCall = async () => { throw new TypeError('Load failed'); };
    expect(await probeTransport('nvidia', 'nvapi-x', { fetch: blocked, native: ok })).toEqual({ fetch: 'blocked: Load failed', native: 'ok' });
  });
});
