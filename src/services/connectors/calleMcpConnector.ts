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

function unwrapToolResult(result: any): any {
  if (!result) return {};
  if (result.structuredContent) return result.structuredContent;
  const textContent = Array.isArray(result.content)
    ? result.content.find((entry: any) => entry?.type === 'text' && typeof entry.text === 'string')
    : null;
  if (textContent) {
    try {
      return JSON.parse(textContent.text);
    } catch {
      return {};
    }
  }
  return {};
}

async function callTool(toolName: string, toolArguments: Record<string, unknown>): Promise<any> {
  const accessToken = await getCalleMcpToken();
  if (!accessToken) throw new Error('CALL-E MCP not connected. Connect via Settings first.');
  const { headers } = await openMcpSession(accessToken);
  const response = await requestJsonRpc(headers, {
    jsonrpc: '2.0', id: `alphonso-${toolName}`, method: 'tools/call',
    params: { name: toolName, arguments: toolArguments }
  });
  return unwrapToolResult(response.body?.result);
}

// Field shapes below are verified against a live `tools/list` call and a
// real (planning-only, no call placed) `plan_call` round trip on 2026-09-07,
// not guessed from docs prose. Two real mismatches this caught vs. the
// original design: (1) plan_call has NO `conversation_history` param -- it
// takes an opaque `plan_id` (returned by the previous call) plus the raw
// `user_input` text; the server tracks conversation state itself. (2) the
// response never echoes back a phone number -- there is no `phone_number`
// field at all, so a phone-based cross-chat duplicate-call guard cannot be
// built from this response (see calleMcpOutreachService.ts's removal note).

export interface PlanCallQuestion {
  key: string;
  question: string;
  options?: Array<{ label: string; value: string }> | null;
}

export interface PlanCallArgs {
  /** Opaque continuation id from a previous plan_call response. Omit on the first call. */
  planId?: string;
  /** E.164 numbers. Only pass when the user gave an unambiguous number -- never guess/reformat. */
  toPhones?: string[];
  region?: string;
  language?: string;
  goal?: string;
  scheduledAt?: string;
  /** The user's latest message, verbatim. Always pass this even when other fields are also set. */
  userInput?: string;
  ttlSeconds?: number;
}

export interface PlanCallResult {
  plan_id: string;
  ready_to_run: boolean;
  next_step: string;
  clarifying_questions?: string[];
  display_goal?: string | null;
  questions?: PlanCallQuestion[] | null;
  confirm_summary: string;
  confirm_token?: string | null;
  confirm_expires_at?: string | null;
  expires_at?: string | null;
}

export function planCall(args: PlanCallArgs): Promise<PlanCallResult> {
  return callTool('plan_call', {
    ...(args.planId ? { plan_id: args.planId } : {}),
    ...(args.toPhones?.length ? { to_phones: args.toPhones } : {}),
    ...(args.region ? { region: args.region } : {}),
    ...(args.language ? { language: args.language } : {}),
    ...(args.goal ? { goal: args.goal } : {}),
    ...(args.scheduledAt ? { scheduled_at: args.scheduledAt } : {}),
    ...(args.userInput ? { user_input: args.userInput } : {}),
    ...(args.ttlSeconds != null ? { ttl_seconds: args.ttlSeconds } : {})
  });
}

export interface CallRunOutcome {
  task_completed: boolean;
  completion_confidence: { score: number; label: string };
  evidence?: string[];
}

export interface CallRunResultPayload {
  summary?: string | null;
  post_summary?: string | null;
  outcome?: CallRunOutcome | null;
  extracted?: Record<string, unknown>;
  transcript?: string | null;
  call_id?: string | null;
  call_ids?: string[];
}

export interface CallRunActivityEntry {
  run_id: string;
  ts: string;
  level: 'info' | 'warning' | 'error';
  kind: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface CallRunResult {
  run_id: string;
  status: string;
  message?: string | null;
  display_goal?: string | null;
  result?: CallRunResultPayload;
  activity?: CallRunActivityEntry[];
  next_cursor?: string | null;
}

export function runCall(planId: string, confirmToken: string): Promise<CallRunResult> {
  return callTool('run_call', { plan_id: planId, confirm_token: confirmToken });
}

export function getCallRun(runId: string, options: { cursor?: string; limit?: number } = {}): Promise<CallRunResult> {
  return callTool('get_call_run', {
    run_id: runId,
    ...(options.cursor ? { cursor: options.cursor } : {}),
    ...(options.limit != null ? { limit: options.limit } : {})
  });
}
