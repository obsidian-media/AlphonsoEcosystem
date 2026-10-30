// Outside tools (2026-10-30, owner): every outside change is Marcus's step. He fills in the
// call from the tool's own fields, it is checked against them, the approval shows the exact
// call, and it runs once.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../../../lib/durableStore', () => ({
  durableGet: (k: string) => localStorage.getItem(k),
  durableSet: (k: string, v: string) => localStorage.setItem(k, v),
}));
const generate = vi.fn();
vi.mock('../../../lib/ollama', () => ({ generateAgentLlmResponse: (...a: unknown[]) => generate(...a) }));
const callTool = vi.fn();
vi.mock('../../../services/mcp/mcpConnection', () => ({ callTool: (...a: unknown[]) => callTool(...a) }));
const policy = { zeroCostMode: false };
vi.mock('../../../services/policyEnforcementService', () => ({ getRuntimePolicySettings: () => policy }));
const recordSpendUsd = vi.fn();
vi.mock('../../../services/jose/joseSpend', () => ({ canSpend: () => ({ ok: true }), recordSpendUsd: (...a: unknown[]) => recordSpendUsd(...a) }));
const steps: Record<string, any> = {};
vi.mock('../../../services/jose/joseRequestStore', () => ({
  requestForCommand: () => ({ id: 'req-1', text: 'Set the blue mug to $18', steps: Object.values(steps) }),
  updateJoseStep: (_r: string, stepId: string, patch: any) => { steps[stepId] = { ...(steps[stepId] || { stepId }), ...patch }; },
}));
vi.mock('../../../services/jose/stepInput', () => ({
  buildStepInput: () => ({ request: 'Set the blue mug to $18', instruction: 'Change the price', needs: [], others: [], memory: '' }),
  stepInputText: () => 'The request: Set the blue mug to $18',
}));

const { addServer, updateServer, mergeTools } = await import('../../../services/mcp/mcpServers');
const { prepareOutsideCall, describeOutsideCall, runOutsideCall, isOutsideCallStep } = await import('../../../services/marcus/outsideCall');

const priceSchema = { type: 'object', properties: { product: { type: 'string' }, price: { type: 'number' } }, required: ['product', 'price'] };
const step = (payload: Record<string, unknown> = {}) => ({ agent: 'marcus', actionType: 'distribution_outside_tool', stepId: 'marcus', effects: ['publish_or_send'], needs: [], payload } as any);

function shop(cost: 'free' | 'paid' = 'free', price?: number) {
  const s = addServer({ name: 'Shop', url: 'https://shop.example/mcp', cost, pricePerCallUsd: price });
  updateServer(s.id, { tools: mergeTools([], [{ name: 'update_price', title: 'Update price', inputSchema: priceSchema }, { name: 'delete_product', inputSchema: {}, destructiveHint: true }]) });
}

describe('Marcus’s outside-tool step', () => {
  beforeEach(() => {
    localStorage.clear();
    for (const k of Object.keys(steps)) delete steps[k];
    generate.mockReset();
    callTool.mockReset();
    recordSpendUsd.mockReset();
    policy.zeroCostMode = false;
  });

  it('is its own kind of Marcus step', () => {
    expect(isOutsideCallStep(step())).toBe(true);
    expect(isOutsideCallStep({ ...step(), actionType: 'distribution_execution' })).toBe(false);
  });

  it('fills arguments from the schema and checks required fields', async () => {
    shop();
    generate.mockResolvedValueOnce({ response: '{"tool": "shop/update_price", "arguments": {"product": "Blue mug", "price": 18}}' });
    const r = await prepareOutsideCall('c1', step(), { text: 'Set the blue mug to $18' });
    expect(r.ok).toBe(true);
    const preview = (r as any).preview;
    expect(preview).toMatchObject({ serverId: 'shop', tool: 'update_price', arguments: { product: 'Blue mug', price: 18 }, effects: ['publish_or_send'] });
    expect(String(generate.mock.calls[0][1].prompt)).toContain('"required":["product","price"]');
  });

  it('offers only the tools of the server the request names', async () => {
    shop();
    const t = addServer({ name: 'Tracker', url: 'https://tracker.example/mcp', cost: 'free' });
    updateServer(t.id, { tools: mergeTools([], [{ name: 'open_issue', inputSchema: {} }]) });
    generate.mockResolvedValueOnce({ response: '{"tool": "shop/update_price", "arguments": {"product": "Blue mug", "price": 18}}' });
    await prepareOutsideCall('c1', step(), { text: 'Through Shop, set the blue mug to $18' });
    const prompt = String(generate.mock.calls[0][1].prompt);
    expect(prompt).toContain('shop/update_price');
    expect(prompt).not.toContain('open_issue');
  });

  it('with many tools, picks one from short lines first, then fills only its fields', async () => {
    // Found live: GitHub lists 46 tools; every schema in one prompt overflowed a local model.
    const s = addServer({ name: 'Hub', url: 'https://hub.example/mcp', cost: 'free' });
    const big = { type: 'object', properties: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`field_${i}`, { type: 'string', description: 'x'.repeat(40) }])) };
    const tools = Array.from({ length: 40 }, (_, i) => ({ name: `tool_${i}`, description: `Does thing ${i}`, inputSchema: big }));
    tools.push({ name: 'issue_write', description: 'Create or update an issue', inputSchema: { type: 'object', properties: { method: { type: 'string' }, title: { type: 'string' } }, required: ['method', 'title'] } } as never);
    updateServer(s.id, { tools: mergeTools([], tools) });
    generate
      .mockResolvedValueOnce({ response: '{"tool": "hub/issue_write"}' })
      .mockResolvedValueOnce({ response: '{"tool": "hub/issue_write", "arguments": {"method": "create", "title": "Hi"}}' });
    const r: any = await prepareOutsideCall('c1', step(), { text: 'Through Hub, open an issue titled Hi' });
    expect(r.ok).toBe(true);
    expect(r.preview).toMatchObject({ tool: 'issue_write', arguments: { method: 'create', title: 'Hi' } });
    const first = String(generate.mock.calls[0][1].prompt);
    expect(first).toContain('hub/tool_39');
    expect(first).not.toContain('field_0');
    const second = String(generate.mock.calls[1][1].prompt);
    expect(second).toContain('"required":["method","title"]');
    expect(second).not.toContain('hub/tool_0');
  });

  it('a missing required field goes back once, then fails with the field named', async () => {
    shop();
    generate
      .mockResolvedValueOnce({ response: '{"tool": "shop/update_price", "arguments": {"product": "Blue mug"}}' })
      .mockResolvedValueOnce({ response: '{"tool": "shop/update_price", "arguments": {"product": "Blue mug", "price": "eighteen"}}' });
    const r = await prepareOutsideCall('c1', step(), { text: 'x' });
    expect(String(generate.mock.calls[1][1].prompt)).toContain('price is missing');
    expect(r).toEqual({ ok: false, outcome: 'failed', reason: 'Marcus couldn’t fill in Shop’s update_price: price should be a number.' });
  });

  it('a call given in the step needs no model', async () => {
    shop();
    const r = await prepareOutsideCall('c1', step({ tool: 'shop/update_price', arguments: { product: 'Blue mug', price: 18 } }), { text: 'x' });
    expect(r.ok).toBe(true);
    expect(generate).not.toHaveBeenCalled();
  });

  it('the approval line shows the exact call', async () => {
    shop();
    const r: any = await prepareOutsideCall('c1', step({ tool: 'shop/update_price', arguments: { product: 'Blue mug', price: 18 } }), { text: 'x' });
    expect(describeOutsideCall(r.preview)).toBe('Shop: Update price (product: Blue mug, price: 18)');
  });

  it('a delete and a paid server are in the effects and the line', async () => {
    shop('paid');
    const r: any = await prepareOutsideCall('c1', step({ tool: 'shop/delete_product', arguments: {} }), { text: 'x' });
    expect(r.preview.effects).toEqual(['publish_or_send', 'delete', 'spend']);
    expect(describeOutsideCall(r.preview)).toBe('Shop: delete_product (cost not known)');
    localStorage.clear();
    shop('paid', 0.05);
    const priced: any = await prepareOutsideCall('c1', step({ tool: 'shop/update_price', arguments: { product: 'Mug', price: 1 } }), { text: 'x' });
    expect(describeOutsideCall(priced.preview)).toBe('Shop: Update price (product: Mug, price: 1) (about $0.05)');
  });

  it('a paid server under Zero-Cost Mode needs setting up, not a guess', async () => {
    shop('paid');
    policy.zeroCostMode = true;
    expect(await prepareOutsideCall('c1', step({ tool: 'shop/update_price', arguments: { product: 'Mug', price: 1 } }), { text: 'x' }))
      .toEqual({ ok: false, outcome: 'setup', reason: 'Shop is a paid server and Zero-Cost Mode is on.' });
  });

  it('no outside tool at all says where to add one', async () => {
    expect(await prepareOutsideCall('c1', step(), { text: 'x' })).toEqual({ ok: false, outcome: 'setup', reason: 'No outside tool can do this. Add one in Settings → Connectors → Outside tools (MCP).' });
  });

  it('runs once', async () => {
    shop('paid', 0.05);
    callTool.mockResolvedValue({ ok: true, text: 'Price updated.' });
    const preview = { serverId: 'shop', serverName: 'Shop', tool: 'update_price', arguments: { product: 'Mug', price: 1 }, effects: ['publish_or_send', 'spend'], costUsd: 0.05 } as any;
    const first = await runOutsideCall('c1', 'marcus', preview);
    expect(first).toMatchObject({ ok: true });
    expect(first.text).toContain('Price updated.');
    expect(recordSpendUsd).toHaveBeenCalledWith(0.05);
    expect(await runOutsideCall('c1', 'marcus', preview)).toEqual({ ok: false, text: '', reason: 'Already done.' });
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it('an expired sign-in waits with Carry on', async () => {
    shop();
    callTool.mockResolvedValue({ ok: false, text: '', reason: 'Sign in to this server again in Settings → Connectors.', needsSignIn: true });
    const r = await runOutsideCall('c1', 'marcus', { serverId: 'shop', serverName: 'Shop', tool: 'update_price', arguments: {}, effects: ['publish_or_send'] } as any);
    expect(r).toEqual({ ok: false, text: '', reason: 'Sign in to Shop again in Settings → Connectors → Outside tools (MCP), then Carry on.', setup: true });
    // A refused call may be tried again after the sign-in.
    expect(steps.marcus.ranAtMs).toBeUndefined();
  });
});
