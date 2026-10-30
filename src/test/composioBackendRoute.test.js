// Composio answers a plain request from the desktop window, but its browser pre-check (sent first
// because of the x-api-key header) leaves out Access-Control-Allow-Origin for the app's origin
// http://tauri.localhost, so every Composio call from the window failed (QA batch 1, live check:
// "Available Toolkits (0)" with a working key). Inside the app every call goes through the
// backend's connector_composio_request; the window never calls Composio.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../services/policyEnforcementService', () => ({
  evaluatePolicyGate: vi.fn(() => ({ ok: true, blocked: false }))
}));
vi.mock('../services/secureStorageService', () => ({
  secureGet: vi.fn(async () => null),
  secureSet: vi.fn(async () => {})
}));
const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args) => invoke(...args) }));

const {
  setComposioConfig, fetchComposioToolkits, listToolkitTools, executeComposioTool, checkComposioHealth,
  __resetComposioApiKeyCacheForTests,
} = await import('../services/composioService');

const ok = (body) => ({ ok: true, httpStatus: 200, error: null, body: JSON.stringify(body) });

describe('Composio inside the desktop app', () => {
  beforeEach(async () => {
    invoke.mockReset();
    localStorage.clear();
    __resetComposioApiKeyCacheForTests();
    vi.stubGlobal('fetch', vi.fn());
    window.__TAURI_INTERNALS__ = {};
    await setComposioConfig({ enabled: true, apiKey: 'ak_test_composio_key', userId: 'me' });
  });
  afterEach(() => {
    delete window.__TAURI_INTERNALS__;
  });

  it('lists the toolkits through the backend, never from the window', async () => {
    invoke.mockResolvedValueOnce(ok({ items: [{ name: 'Gmail', slug: 'gmail', meta: { description: 'Mail' } }] }));
    const { toolkits, error } = await fetchComposioToolkits();
    expect(error).toBeNull();
    expect(toolkits.map((t) => t.key)).toEqual(['gmail']);
    expect(fetch).not.toHaveBeenCalled();
    const [command, args] = invoke.mock.calls[0];
    expect(command).toBe('connector_composio_request');
    expect(args).toMatchObject({ call: 'toolkits', apiKey: 'ak_test_composio_key' });
  });

  it("lists a toolkit's tools and checks health through the backend", async () => {
    invoke.mockResolvedValueOnce(ok({ items: [{ slug: 'GMAIL_FETCH_EMAILS', description: 'Fetch' }] }));
    expect((await listToolkitTools('gmail')).tools.map((t) => t.name)).toEqual(['GMAIL_FETCH_EMAILS']);
    expect(invoke.mock.calls[0][1]).toMatchObject({ call: 'tools', toolkit: 'gmail' });
    invoke.mockResolvedValueOnce(ok({ items: [] }));
    expect((await checkComposioHealth()).status).toBe('healthy');
    expect(invoke.mock.calls[1][1]).toMatchObject({ call: 'toolkits', limit: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('runs a switched-on tool through the backend with its arguments', async () => {
    localStorage.setItem('alphonso_composio_toolkits_enabled_v1', JSON.stringify(['gmail']));
    invoke.mockResolvedValueOnce(ok({ successful: true, data: { sent: 1 } }));
    const result = await executeComposioTool('GMAIL_FETCH_EMAILS', { max: 1 }, { approved: true });
    expect(result).toEqual({ success: true, data: { sent: 1 }, error: null });
    const args = invoke.mock.calls[0][1];
    expect(args).toMatchObject({ call: 'execute', tool: 'GMAIL_FETCH_EMAILS' });
    expect(JSON.parse(args.body)).toEqual({ arguments: { max: 1 }, user_id: 'me' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports Composio's refusal and a backend that couldn't reach it", async () => {
    invoke.mockResolvedValueOnce({ ok: false, httpStatus: 401, error: null, body: '{"message":"bad key"}' });
    expect((await fetchComposioToolkits()).error).toMatch(/401/);
    invoke.mockResolvedValueOnce({ ok: false, httpStatus: null, body: null, error: 'connection timed out' });
    expect((await checkComposioHealth()).message).toMatch(/couldn't reach Composio: connection timed out/i);
  });
});
