// Outside tools (2026-10-30): the app's calls to the backend MCP client. The window never
// handles a key; outside the desktop app nothing is sent.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock('../../../lib/durableStore', () => ({
  durableGet: (k: string) => localStorage.getItem(k),
  durableSet: (k: string, v: string) => localStorage.setItem(k, v),
}));

const { addServer, getServer, setToolMark } = await import('../../../services/mcp/mcpServers');
const conn = await import('../../../services/mcp/mcpConnection');
const { refreshTools, callTool, searchRegistry, signIn, saveServerHeader, NOT_DESKTOP } = conn;

const listed = (tools: unknown[], extra: Record<string, unknown> = {}) => ({
  ok: true, tools, truncated: false, version: '2026-07-28', needsSignIn: false, rejected: [], ...extra,
});

describe('MCP connection', () => {
  beforeEach(() => {
    localStorage.clear();
    invoke.mockReset();
    (window as any).__TAURI_INTERNALS__ = {};
  });
  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('refreshing keeps marks, saves the version and caches for the ttl', async () => {
    const s = addServer({ name: 'Shop', url: 'https://shop.example/mcp' });
    invoke.mockResolvedValueOnce(listed([{ name: 'list_products', inputSchema: {}, readOnlyHint: true }], { ttlMs: 60_000 }));
    expect(await refreshTools(s.id)).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith('mcp_list_tools', { serverId: 'shop', url: 'https://shop.example/mcp', version: null });
    setToolMark(s.id, 'list_products', 'reading_only');
    // Within the ttl nothing is asked again.
    expect(await refreshTools(s.id)).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledTimes(1);
    invoke.mockResolvedValueOnce(listed([{ name: 'list_products', inputSchema: {} }], { version: '2025-11-25' }));
    await refreshTools(s.id, { force: true });
    expect(invoke).toHaveBeenLastCalledWith('mcp_list_tools', { serverId: 'shop', url: 'https://shop.example/mcp', version: '2026-07-28' });
    const saved = getServer(s.id)!;
    expect(saved.tools[0].mark).toBe('reading_only');
    expect(saved.version).toBe('2025-11-25');
  });

  it('a server that asks for a sign-in is marked so', async () => {
    const s = addServer({ name: 'Shop', url: 'https://shop.example/mcp' });
    invoke.mockResolvedValueOnce({ ok: false, tools: [], needsSignIn: true, reason: 'Sign in to this server again in Settings → Connectors.', version: '2026-07-28', rejected: [] });
    const r = await refreshTools(s.id);
    expect(r.ok).toBe(false);
    expect(getServer(s.id)!.needsSignIn).toBe(true);
  });

  it('a call sends the tool schema so its header fields are mirrored', async () => {
    const s = addServer({ name: 'Shop', url: 'https://shop.example/mcp' });
    invoke.mockResolvedValueOnce(listed([{ name: 'update_price', inputSchema: { type: 'object', properties: { id: { type: 'string' } } } }]));
    await refreshTools(s.id);
    invoke.mockResolvedValueOnce({ ok: true, text: 'Done.', isError: false, version: '2026-07-28', needsSignIn: false });
    expect(await callTool(s.id, 'update_price', { id: 'p1' })).toEqual({ ok: true, text: 'Done.' });
    expect(invoke).toHaveBeenLastCalledWith('mcp_call_tool', {
      serverId: 'shop', url: 'https://shop.example/mcp', version: '2026-07-28', tool: 'update_price',
      arguments: { id: 'p1' }, inputSchema: { type: 'object', properties: { id: { type: 'string' } } },
    });
  });

  it('a tool that failed says so with the server’s text', async () => {
    const s = addServer({ name: 'Shop', url: 'https://shop.example/mcp' });
    invoke.mockResolvedValueOnce({ ok: false, text: 'No such product', isError: true, version: '2026-07-28', needsSignIn: false });
    expect(await callTool(s.id, 'update_price', {})).toEqual({ ok: false, text: 'No such product', reason: 'Shop said: No such product' });
  });

  it('an unknown server or tool is refused before anything is sent', async () => {
    expect((await callTool('nope', 'x', {})).ok).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('search, sign-in and headers go to the backend', async () => {
    invoke.mockResolvedValueOnce([{ name: 'com.a/shop', title: 'Shop', description: '', websiteUrl: '', remotes: [] }]);
    expect((await searchRegistry('shop'))[0].title).toBe('Shop');
    expect(invoke).toHaveBeenLastCalledWith('mcp_registry_search', { text: 'shop' });
    const s = addServer({ name: 'Shop', url: 'https://shop.example/mcp' });
    invoke.mockResolvedValueOnce({ ok: true, clientKind: 'registered', notNeeded: false });
    invoke.mockResolvedValueOnce(listed([]));
    expect((await signIn(s.id)).ok).toBe(true);
    expect(invoke).toHaveBeenCalledWith('mcp_sign_in', { serverId: 'shop', url: 'https://shop.example/mcp', pastedClientId: null });
    expect(getServer(s.id)!.signIn).toBe('browser');
    invoke.mockResolvedValueOnce(undefined);
    await saveServerHeader(s.id, 'X-Api-Key', 'k-123');
    expect(invoke).toHaveBeenLastCalledWith('mcp_save_header', { serverId: 'shop', name: 'X-Api-Key', value: 'k-123' });
    expect(JSON.stringify(localStorage)).not.toContain('k-123');
  });

  it('outside the desktop app nothing is sent', async () => {
    delete (window as any).__TAURI_INTERNALS__;
    const s = addServer({ name: 'Shop', url: 'https://shop.example/mcp' });
    expect(await refreshTools(s.id)).toEqual({ ok: false, reason: NOT_DESKTOP });
    expect(invoke).not.toHaveBeenCalled();
  });
});

// Outside tools (2026-10-30): the Health Monitor asks each switched-on server for its tool list.
describe('outside tools health check', () => {
  it('says what to add when there is nothing, and which server failed', async () => {
    localStorage.clear();
    const { checkOutsideToolsConnection } = await import('../../../services/connectorHealthCheckService');
    expect((await checkOutsideToolsConnection()).message).toBe('No outside tools added. Add an MCP server in Settings → Connectors → Outside tools (MCP).');
    const { addServer } = await import('../../../services/mcp/mcpServers');
    addServer({ name: 'Shop', url: 'https://shop.example/mcp' });
    (window as any).__TAURI_INTERNALS__ = {};
    invoke.mockReset();
    invoke.mockRejectedValueOnce(new Error('The server did not answer.'));
    const r = await checkOutsideToolsConnection();
    delete (window as any).__TAURI_INTERNALS__;
    expect(r.ok).toBe(false);
    expect(r.message).toContain('Shop:');
  });
});
