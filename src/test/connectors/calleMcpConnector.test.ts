import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockGetCalleMcpToken = vi.fn();
vi.mock('../../services/calleMcpAuthService', () => ({
  getCalleMcpToken: (...args: unknown[]) => mockGetCalleMcpToken(...args)
}));

import { planCall, runCall, getCallRun } from '../../services/connectors/calleMcpConnector';

function rpcResponse(result: unknown, headers: Record<string, string> = {}) {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify({ jsonrpc: '2.0', result })),
    headers: new Headers(headers)
  };
}

// Wraps a tool's structured payload in the real MCP CallToolResult envelope
// (content + structuredContent) — matches what tools/call actually returns.
function toolResult(structuredContent: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
}

beforeEach(() => {
  mockFetch.mockReset();
  mockGetCalleMcpToken.mockReset();
  mockGetCalleMcpToken.mockResolvedValue('tok123');
});

describe('planCall / runCall / getCallRun', () => {
  it('throws "not connected" when there is no token', async () => {
    mockGetCalleMcpToken.mockResolvedValueOnce(null);
    await expect(planCall('call Joe\'s Pizza')).rejects.toThrow('not connected');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('performs the initialize handshake, captures mcp-session-id, and reuses it on the tool call', async () => {
    mockFetch
      .mockResolvedValueOnce(rpcResponse({}, { 'mcp-session-id': 'sess-abc' })) // initialize
      .mockResolvedValueOnce(rpcResponse({})) // notifications/initialized
      .mockResolvedValueOnce(rpcResponse(toolResult({ ready_to_run: false, clarifying_questions: ['What phone number?'] }))); // tools/call

    await planCall('call Joe\'s Pizza');

    const toolCallArgs = mockFetch.mock.calls[2];
    const headers = toolCallArgs[1].headers;
    expect(headers['mcp-session-id']).toBe('sess-abc');
    const body = JSON.parse(toolCallArgs[1].body);
    expect(body.method).toBe('tools/call');
    expect(body.params.name).toBe('plan_call');
    expect(body.params.arguments.goal).toBe('call Joe\'s Pizza');
  });

  it('planCall omits conversation_history when none is passed, includes it when passed', async () => {
    mockFetch
      .mockResolvedValueOnce(rpcResponse({}))
      .mockResolvedValueOnce(rpcResponse({}))
      .mockResolvedValueOnce(rpcResponse(toolResult({ ready_to_run: false })));
    await planCall('goal only');
    let body = JSON.parse(mockFetch.mock.calls[2][1].body);
    expect(body.params.arguments.conversation_history).toBeUndefined();

    mockFetch.mockReset();
    mockFetch
      .mockResolvedValueOnce(rpcResponse({}))
      .mockResolvedValueOnce(rpcResponse({}))
      .mockResolvedValueOnce(rpcResponse(toolResult({ ready_to_run: false })));
    await planCall('goal', ['turn 1', 'turn 2']);
    body = JSON.parse(mockFetch.mock.calls[2][1].body);
    expect(body.params.arguments.conversation_history).toEqual(['turn 1', 'turn 2']);
  });

  it('runCall sends plan_id and confirm_token', async () => {
    mockFetch
      .mockResolvedValueOnce(rpcResponse({}))
      .mockResolvedValueOnce(rpcResponse({}))
      .mockResolvedValueOnce(rpcResponse(toolResult({ run_id: 'r1', status: 'QUEUED' })));
    const result = await runCall('plan1', 'token1');
    expect(result.run_id).toBe('r1');
    const body = JSON.parse(mockFetch.mock.calls[2][1].body);
    expect(body.params.arguments).toEqual({ plan_id: 'plan1', confirm_token: 'token1' });
  });

  it('getCallRun sends run_id', async () => {
    mockFetch
      .mockResolvedValueOnce(rpcResponse({}))
      .mockResolvedValueOnce(rpcResponse({}))
      .mockResolvedValueOnce(rpcResponse(toolResult({ status: 'COMPLETED' })));
    const result = await getCallRun('r1');
    expect(result.status).toBe('COMPLETED');
    const body = JSON.parse(mockFetch.mock.calls[2][1].body);
    expect(body.params.arguments).toEqual({ run_id: 'r1' });
  });

  it('throws on a non-ok HTTP response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve(''), headers: new Headers() });
    await expect(planCall('x')).rejects.toThrow('HTTP 500');
  });

  it('throws on a JSON-RPC error field', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      text: () => Promise.resolve(JSON.stringify({ jsonrpc: '2.0', error: { message: 'bad request' } })),
      headers: new Headers()
    });
    await expect(planCall('x')).rejects.toThrow('bad request');
  });
});
