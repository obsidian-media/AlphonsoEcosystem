// Outside tools (final review, 2026-10-30): when a request names a connected outside server and
// asks for a change, the one Marcus send in the plan uses that server's tool. Found live: the
// planner gave "open an issue through my GitHub MCP tool" to the built-in GitHub connector.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../../../lib/durableStore', () => ({
  durableGet: (k: string) => localStorage.getItem(k),
  durableSet: (k: string, v: string) => localStorage.setItem(k, v),
}));

const { addServer, updateServer, mergeTools, setToolMark } = await import('../../../services/mcp/mcpServers');
const { toOutsideTool } = await import('../../../services/mcp/toOutsideTool');

function server(name: string, enabled = true) {
  const s = addServer({ name, url: `https://${name.toLowerCase().replace(/\s+/g, '')}.example/mcp`, cost: 'free' });
  updateServer(s.id, {
    enabled,
    tools: mergeTools([], [
      { name: 'list_issues', inputSchema: {}, readOnlyHint: true },
      { name: 'issue_write', inputSchema: {} },
    ]),
  });
  return s.id;
}

const marcusSend = { stepId: 'marcus', agent: 'marcus', actionType: 'distribution_issue', effects: ['publish_or_send'], needs: ['alphonso'] };
const writer = { stepId: 'alphonso', agent: 'alphonso', actionType: 'assistant_write', effects: ['write_own_work'], needs: [] };

describe('toOutsideTool', () => {
  beforeEach(() => localStorage.clear());

  it('gives the one send to the outside tool the request names', () => {
    server('GitHub MCP');
    const out = toOutsideTool([writer, marcusSend] as never, 'Through my GitHub MCP tool, open an issue in a/b.');
    expect(out.find((s) => s.stepId === 'marcus')?.actionType).toBe('distribution_outside_tool');
    expect(out.find((s) => s.stepId === 'marcus')?.effects).toContain('publish_or_send');
    expect(out.find((s) => s.stepId === 'alphonso')).toEqual(writer);
  });

  it('leaves the plan alone when no connected server is named', () => {
    server('GitHub MCP');
    expect(toOutsideTool([writer, marcusSend] as never, 'Open an issue in a/b.')).toEqual([writer, marcusSend]);
  });

  it('leaves it alone when the named server is switched off or can only read', () => {
    server('Off Tool', false);
    expect(toOutsideTool([marcusSend] as never, 'Use Off Tool to open an issue.')).toEqual([marcusSend]);
    const id = server('Reader');
    setToolMark(id, 'issue_write', 'reading_only');
    setToolMark(id, 'list_issues', 'reading_only'); // a read-only hint alone still asks
    expect(toOutsideTool([marcusSend] as never, 'Use Reader to open an issue.')).toEqual([marcusSend]);
  });

  it('leaves it alone with two sends, or an outside step already there', () => {
    server('GitHub MCP');
    const slack = { ...marcusSend, stepId: 'marcus-2', actionType: 'distribution_slack' };
    expect(toOutsideTool([marcusSend, slack] as never, 'Through GitHub MCP open an issue, then post to Slack.')).toEqual([marcusSend, slack]);
    const outside = { ...marcusSend, stepId: 'marcus-2', actionType: 'distribution_outside_tool' };
    expect(toOutsideTool([marcusSend, outside] as never, 'Through GitHub MCP open an issue.')).toEqual([marcusSend, outside]);
  });

  it('never touches a readiness check or a content step', () => {
    server('GitHub MCP');
    const readiness = { ...marcusSend, actionType: 'distribution_readiness', effects: ['read'] };
    const content = { ...marcusSend, actionType: 'distribution_schedule_posts', contentStep: 'publish' };
    expect(toOutsideTool([readiness] as never, 'Through GitHub MCP check it.')).toEqual([readiness]);
    expect(toOutsideTool([content] as never, 'Through GitHub MCP post it.')).toEqual([content]);
  });
});
