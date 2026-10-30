// Outside tools (2026-10-30): the saved list of MCP servers. No secrets here (they stay in the
// keychain); a new server counts as Paid until marked Free; every new tool asks first; a
// refresh keeps the marks of tools still listed.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock('../../../lib/durableStore', () => ({
  durableGet: (k: string) => localStorage.getItem(k),
  durableSet: (k: string, v: string) => localStorage.setItem(k, v),
}));

const store = await import('../../../services/mcp/mcpServers');
const { listServers, getServer, addServer, updateServer, removeServer, setToolMark, setToolOff, mergeTools, MCP_SERVERS_KEY } = store;
const { isSecretStorageKey, stripSecretFields } = await import('../../../services/workspaceExportService');

describe('saved MCP servers', () => {
  beforeEach(() => {
    localStorage.clear();
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
    (window as any).__TAURI_INTERNALS__ = {};
  });

  it('a new server counts as paid unless marked free, with a unique id', () => {
    const a = addServer({ name: 'My Shop', url: 'https://shop.example/api/mcp' });
    const b = addServer({ name: 'My Shop', url: 'https://other.example/mcp', cost: 'free' });
    expect(a.id).toBe('my-shop');
    expect(b.id).toBe('my-shop-2');
    expect(a.cost).toBe('paid');
    expect(b.cost).toBe('free');
    expect(a.enabled).toBe(true);
    expect(listServers().map((s) => s.id)).toEqual(['my-shop', 'my-shop-2']);
  });

  it('an odd name still gets a safe id', () => {
    expect(addServer({ name: '  ¡!  ', url: 'https://x.example/mcp' }).id).toBe('server');
    expect(addServer({ name: 'GitHub: Issues/PRs', url: 'https://g.example/mcp' }).id).toBe('github-issues-prs');
  });

  it('a refresh keeps the marks of tools still listed and new tools ask first', () => {
    const old = [
      { name: 'list_products', inputSchema: {}, mark: 'reading_only' as const },
      { name: 'gone', inputSchema: {}, mark: 'deletes' as const },
      { name: 'update_price', inputSchema: {}, mark: 'ask' as const, off: true },
    ];
    const merged = mergeTools(old, [
      { name: 'list_products', inputSchema: { type: 'object' }, readOnlyHint: true },
      { name: 'update_price', inputSchema: {} },
      { name: 'delete_product', inputSchema: {}, destructiveHint: true },
    ]);
    expect(merged.map((t) => [t.name, t.mark, !!t.off])).toEqual([
      ['list_products', 'reading_only', false],
      ['update_price', 'ask', true],
      ['delete_product', 'ask', false],
    ]);
    expect(merged[0].hintReadOnly).toBe(true);
    expect(merged[2].hintDestructive).toBe(true);
  });

  it('marks and switches are saved per tool', () => {
    const s = addServer({ name: 'Shop', url: 'https://shop.example/mcp' });
    updateServer(s.id, { tools: mergeTools([], [{ name: 'list_products', inputSchema: {} }]) });
    setToolMark(s.id, 'list_products', 'reading_only');
    setToolOff(s.id, 'list_products', true);
    const t = getServer(s.id)!.tools[0];
    expect(t.mark).toBe('reading_only');
    expect(t.off).toBe(true);
  });

  it('removing a server forgets its keychain entries', async () => {
    const s = addServer({ name: 'Shop', url: 'https://shop.example/mcp' });
    await removeServer(s.id);
    expect(getServer(s.id)).toBeUndefined();
    expect(invoke).toHaveBeenCalledWith('mcp_forget_server', { serverId: 'shop' });
  });

  it('holds nothing an export would have to hide', () => {
    addServer({ name: 'Shop', url: 'https://shop.example/mcp', pricePerCallUsd: 0.01 });
    const raw = JSON.parse(localStorage.getItem(MCP_SERVERS_KEY)!);
    expect(isSecretStorageKey(MCP_SERVERS_KEY)).toBe(false);
    expect(stripSecretFields(raw)).toEqual(raw);
  });
});
