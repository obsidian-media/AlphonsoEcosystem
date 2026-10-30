// Outside tools (2026-10-30): Settings → Connectors → Outside tools (MCP). Add a server by its
// address or from the MCP Registry, sign in or save its key, mark each tool.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../../lib/durableStore', () => ({
  durableGet: (k: string) => localStorage.getItem(k),
  durableSet: (k: string, v: string) => localStorage.setItem(k, v),
}));
const refreshTools = vi.fn();
const searchRegistry = vi.fn();
const signIn = vi.fn();
const saveServerHeader = vi.fn();
const savedParts = vi.fn();
const finishPastedSignIn = vi.fn();
vi.mock('../../services/mcp/mcpConnection', () => ({
  refreshTools: (...a: unknown[]) => refreshTools(...a),
  searchRegistry: (...a: unknown[]) => searchRegistry(...a),
  signIn: (...a: unknown[]) => signIn(...a),
  saveServerHeader: (...a: unknown[]) => saveServerHeader(...a),
  savedParts: (...a: unknown[]) => savedParts(...a),
  finishPastedSignIn: (...a: unknown[]) => finishPastedSignIn(...a),
}));

const store = await import('../../services/mcp/mcpServers');
const { OutsideToolsSection } = await import('../../components/OutsideToolsSection');

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  localStorage.clear();
  for (const f of [refreshTools, searchRegistry, signIn, saveServerHeader, savedParts, finishPastedSignIn]) f.mockReset();
  savedParts.mockResolvedValue({ headers: [], signedIn: false });
  refreshTools.mockImplementation(async (id: string) => {
    store.updateServer(id, { tools: store.mergeTools(store.getServer(id)!.tools, [
      { name: 'list_products', title: 'List products', inputSchema: {}, readOnlyHint: true },
      { name: 'delete_product', inputSchema: {}, destructiveHint: true },
    ]) });
    return { ok: true };
  });
});

describe('OutsideToolsSection', () => {
  it('adds a server by its address, Paid unless marked Free, and lists its tools', async () => {
    render(<OutsideToolsSection />);
    type('Name', 'My Shop');
    type('Server address', 'https://shop.example/api/mcp');
    expect((screen.getByLabelText('Paid') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByTestId('mcp-add'));
    await waitFor(() => expect(screen.getByTestId('mcp-server-my-shop')).toBeTruthy());
    expect(store.getServer('my-shop')).toMatchObject({ url: 'https://shop.example/api/mcp', cost: 'paid' });
    expect(refreshTools).toHaveBeenCalledWith('my-shop', { force: true });
    fireEvent.click(await screen.findByText('Show tools (2)'));
    expect(await screen.findByTestId('mcp-tool-my-shop-list_products')).toBeTruthy();
  });

  it('refuses an address that is not https before saving anything', () => {
    render(<OutsideToolsSection />);
    type('Name', 'Shop');
    type('Server address', 'http://shop.example/mcp');
    fireEvent.click(screen.getByTestId('mcp-add'));
    expect(screen.getByText('Outside tools need an https address.')).toBeTruthy();
    expect(store.listServers()).toEqual([]);
  });

  it('each tool asks first, with the server’s own label beside it as a suggestion', async () => {
    store.addServer({ name: 'Shop', url: 'https://shop.example/mcp', cost: 'free' });
    await refreshTools('shop');
    render(<OutsideToolsSection />);
    fireEvent.click(screen.getByText('Show tools (2)'));
    const row = screen.getByTestId('mcp-tool-shop-list_products');
    expect(row.textContent).toContain('The server says: reads only');
    const select = screen.getByLabelText('What list_products may do') as HTMLSelectElement;
    expect(select.value).toBe('ask');
    fireEvent.change(select, { target: { value: 'reading_only' } });
    expect(store.getServer('shop')!.tools[0].mark).toBe('reading_only');
    expect(screen.getByTestId('mcp-tool-shop-delete_product').textContent).toContain('The server says: may delete');
  });

  it('finds a server in the MCP Registry and saves the key it needs', async () => {
    searchRegistry.mockResolvedValue([{ name: 'com.a/shop', title: 'Shop Admin', description: 'Products and orders', websiteUrl: '', remotes: [{ type: 'streamable-http', url: 'https://a.example/mcp', headers: [{ name: 'X-Api-Key', description: 'Your key', isSecret: true, isRequired: true }] }] }]);
    render(<OutsideToolsSection />);
    type('Search the MCP Registry', 'shop');
    fireEvent.click(screen.getByTestId('mcp-search'));
    fireEvent.click(await screen.findByText('Use this server'));
    expect((screen.getByLabelText('Server address') as HTMLInputElement).value).toBe('https://a.example/mcp');
    const key = screen.getByLabelText('X-Api-Key') as HTMLInputElement;
    expect(key.type).toBe('password');
    type('X-Api-Key', 'k-123');
    fireEvent.click(screen.getByTestId('mcp-add'));
    await waitFor(() => expect(saveServerHeader).toHaveBeenCalledWith('shop-admin', 'X-Api-Key', 'k-123'));
    expect(JSON.stringify(localStorage)).not.toContain('k-123');
  });

  it('a server needing a client ID gets a box for it', async () => {
    store.addServer({ name: 'Shop', url: 'https://shop.example/mcp' });
    signIn.mockResolvedValueOnce({ ok: false, reason: 'This server needs a client ID. Paste the one the service gave you.' });
    signIn.mockResolvedValueOnce({ ok: true });
    render(<OutsideToolsSection />);
    fireEvent.click(screen.getByTestId('mcp-signin-shop'));
    expect(await screen.findByText('This server needs a client ID. Paste the one the service gave you.')).toBeTruthy();
    type('Client ID', 'cid-9');
    fireEvent.click(screen.getByTestId('mcp-signin-shop'));
    await waitFor(() => expect(signIn).toHaveBeenLastCalledWith('shop', 'cid-9'));
  });

  it('remove asks first, then forgets the server', async () => {
    store.addServer({ name: 'Shop', url: 'https://shop.example/mcp' });
    render(<OutsideToolsSection />);
    fireEvent.click(screen.getByTestId('mcp-remove-shop'));
    expect(store.getServer('shop')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByText('Remove Shop for good')); });
    expect(store.getServer('shop')).toBeUndefined();
  });

  it('says when only the first 200 tools were kept, and which tools were left out', () => {
    const s = store.addServer({ name: 'Big', url: 'https://big.example/mcp' });
    store.updateServer(s.id, { truncated: true, rejected: ['bad_tool'] });
    render(<OutsideToolsSection />);
    expect(screen.getByText('Only the first 200 tools are kept.')).toBeTruthy();
    expect(screen.getByText('Left out: bad_tool (it breaks the MCP rules for header fields).')).toBeTruthy();
  });
});
