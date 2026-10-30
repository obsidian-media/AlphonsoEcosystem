// NVIDIA NIM sends no Access-Control-Allow-Origin, so a fetch from the desktop window always
// failed with "Failed to fetch" (QA batch 1, live check). Inside the app every call goes
// through the backend's connector_nvidia_request instead; the window never calls NVIDIA.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../services/connectors/connectorAuth.js', () => ({
  getConnectorCredential: vi.fn((connectorId, key) => (connectorId === 'nvidia_nim' && key === 'NVIDIA_API_KEY' ? 'nvapi-test-key' : ''))
}));
vi.mock('../services/policyEnforcementService.js', () => ({
  evaluatePolicyGate: vi.fn(() => ({ ok: true, blocked: false }))
}));
const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args) => invoke(...args) }));

const { sendNvidiaMessage, listNvidiaModels } = await import('../services/connectors/nvidiaNimConnector.js');

describe('NVIDIA NIM inside the desktop app', () => {
  beforeEach(() => {
    invoke.mockReset();
    vi.stubGlobal('fetch', vi.fn());
    window.__TAURI_INTERNALS__ = {};
  });
  afterEach(() => {
    delete window.__TAURI_INTERNALS__;
  });

  it('sends a chat message through the backend, never from the window', async () => {
    invoke.mockResolvedValueOnce({
      ok: true, httpStatus: 200, error: null,
      body: JSON.stringify({ choices: [{ message: { content: 'Paris' } }], model: 'meta/llama-3.1-8b-instruct' }),
    });
    const result = await sendNvidiaMessage([{ role: 'user', content: 'Capital of France?' }]);
    expect(result).toMatchObject({ ok: true, content: 'Paris', provider: 'nvidia_nim' });
    expect(fetch).not.toHaveBeenCalled();
    const [command, args] = invoke.mock.calls[0];
    expect(command).toBe('connector_nvidia_request');
    expect(args.path).toBe('chat/completions');
    expect(args.apiKey).toBe('nvapi-test-key');
    expect(JSON.parse(args.body)).toMatchObject({ messages: [{ role: 'user', content: 'Capital of France?' }] });
  });

  it('lists the models through the backend', async () => {
    invoke.mockResolvedValueOnce({ ok: true, httpStatus: 200, error: null, body: JSON.stringify({ data: [{ id: 'a/b' }, { id: 'c/d' }] }) });
    expect(await listNvidiaModels()).toEqual(['a/b', 'c/d']);
    expect(invoke.mock.calls[0][0]).toBe('connector_nvidia_request');
    expect(invoke.mock.calls[0][1].path).toBe('models');
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports NVIDIA's own refusal, and a rate limit as rate limited", async () => {
    invoke.mockResolvedValueOnce({ ok: false, httpStatus: 401, error: null, body: '{"detail":"Unauthorized"}' });
    await expect(sendNvidiaMessage([{ role: 'user', content: 'x' }])).rejects.toThrow(/401/);
    invoke.mockResolvedValueOnce({ ok: false, httpStatus: 429, error: null, body: 'slow down' });
    expect(await sendNvidiaMessage([{ role: 'user', content: 'x' }])).toMatchObject({ ok: false, rateLimited: true, status: 429 });
  });

  it('says plainly when NVIDIA could not be reached', async () => {
    invoke.mockResolvedValueOnce({ ok: false, httpStatus: null, body: null, error: 'connection timed out' });
    await expect(listNvidiaModels()).rejects.toThrow(/couldn't reach NVIDIA NIM: connection timed out/i);
  });
});
