import { getCalleMcpToken } from '../calleMcpAuthService';

const MCP_SERVER_URL = 'https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth';
const MCP_PROTOCOL_VERSION = '2025-11-25'; // @call-e/core/lib/constants.js

interface McpSession {
  headers: Record<string, string>;
}

async function requestJsonRpc(headers: Record<string, string>, payload: Record<string, unknown>): Promise<{ body: any; headers: Headers }> {
  const response = await fetch(MCP_SERVER_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000)
  });
  const text = await response.text();
  const body = text.trim() ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`CALL-E MCP HTTP ${response.status} for ${payload.method}`);
  if (body?.error) throw new Error(body.error.message || `CALL-E MCP error for ${payload.method}`);
  return { body, headers: response.headers };
}

async function openMcpSession(accessToken: string): Promise<McpSession> {
  const commonHeaders: Record<string, string> = {
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    'mcp-protocol-version': MCP_PROTOCOL_VERSION,
    Authorization: `Bearer ${accessToken}`
  };
  const initialize = await requestJsonRpc(commonHeaders, {
    jsonrpc: '2.0', id: 'alphonso-initialize', method: 'initialize',
    params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'alphonso', version: '1' } }
  });
  const sessionId = initialize.headers.get('mcp-session-id') || '';
  const rpcHeaders = sessionId ? { ...commonHeaders, 'mcp-session-id': sessionId } : commonHeaders;
  await requestJsonRpc(rpcHeaders, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  return { headers: rpcHeaders };
}

async function callTool(toolName: string, toolArguments: Record<string, unknown>): Promise<any> {
  const accessToken = await getCalleMcpToken();
  if (!accessToken) throw new Error('CALL-E MCP not connected. Connect via Settings first.');
  const { headers } = await openMcpSession(accessToken);
  const response = await requestJsonRpc(headers, {
    jsonrpc: '2.0', id: `alphonso-${toolName}`, method: 'tools/call',
    params: { name: toolName, arguments: toolArguments }
  });
  return response.body?.result ?? {};
}

export interface PlanCallResult {
  ready_to_run: boolean;
  plan_id?: string;
  confirm_token?: string;
  clarifying_questions?: string[];
  summary?: string;
  phone_number?: string; // best-effort; unverified against a real response
}

export function planCall(goal: string, conversationHistory?: string[]): Promise<PlanCallResult> {
  return callTool('plan_call', { goal, ...(conversationHistory?.length ? { conversation_history: conversationHistory } : {}) });
}

export function runCall(planId: string, confirmToken: string): Promise<{ run_id: string; status: string }> {
  return callTool('run_call', { plan_id: planId, confirm_token: confirmToken });
}

export function getCallRun(runId: string): Promise<{ status: string; structuredContent?: unknown; activity?: unknown[] }> {
  return callTool('get_call_run', { run_id: runId });
}
