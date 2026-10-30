// Outside tools (2026-10-30): reading tools reach every agent's step. A model that calls tools
// itself always sees them; a small model is asked once which to read only when the step names
// a connected server.
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

const { addServer, updateServer, mergeTools, setToolMark } = await import('../../../services/mcp/mcpServers');
const { gatherForSkill } = await import('../../../services/skills/skillGather');

const skill = { name: 'Answer a question', agent: 'alphonso', tools: ['read_memory'], steps: [], instructions: 'Answer.', taskTypes: ['assistant_answer'], output: 'text' } as any;
const ctx = (request: string) => ({ agent: 'alphonso', commandId: 'c1', stepInput: { request, instruction: request, needs: [], others: [], memory: '' } } as any);

describe('outside reading tools during a step', () => {
  beforeEach(() => {
    localStorage.clear();
    generate.mockReset();
    callTool.mockReset();
    const s = addServer({ name: 'Shop', url: 'https://shop.example/mcp', cost: 'free' });
    updateServer(s.id, { tools: mergeTools([], [{ name: 'list_orders', inputSchema: { type: 'object', properties: { since: { type: 'string' } } } }]) });
    setToolMark(s.id, 'list_orders', 'reading_only');
  });

  it('a small model reads from a server the request names', async () => {
    generate.mockResolvedValueOnce({ response: '{"tool": "shop/list_orders", "args": {"since": "monday"}}' });
    callTool.mockResolvedValueOnce({ ok: true, text: '12 orders' });
    const { results } = await gatherForSkill(skill, ctx('How many orders came in to my Shop this week?'), { ownCalls: false });
    expect(String(generate.mock.calls[0][1].prompt)).toContain('- shop/list_orders: list_orders (fields: since)');
    expect(callTool).toHaveBeenCalledWith('shop', 'list_orders', { since: 'monday' });
    expect(results).toHaveLength(1);
    expect(results[0].tool).toBe('outside_read');
    expect(results[0].text).toContain('12 orders');
  });

  it('a small model is not asked when no server is named', async () => {
    const { results } = await gatherForSkill(skill, ctx('Write a haiku about autumn'), { ownCalls: false });
    expect(generate).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });

  it('a model calling tools itself is offered the reading tools', async () => {
    generate.mockResolvedValueOnce({ response: '{"done": true}' });
    await gatherForSkill(skill, ctx('Anything'), { ownCalls: true });
    const prompt = String(generate.mock.calls[0][1].prompt);
    expect(prompt).toContain('- outside_read: Read from an outside tool (MCP)');
    expect(prompt).toContain('- shop/list_orders');
  });
});
