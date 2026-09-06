import { describe, it, expect, vi, beforeEach } from 'vitest';

const kvStore: Record<string, string> = {};
const mockInvoke = vi.fn((cmd: string, args: any) => {
  if (cmd === 'kv_set') { kvStore[args.key] = args.value; return Promise.resolve(); }
  if (cmd === 'kv_get') return Promise.resolve(kvStore[args.key] ?? null);
  if (cmd === 'kv_delete') { delete kvStore[args.key]; return Promise.resolve(); }
  return Promise.resolve(null);
});
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => (mockInvoke as any)(...args) }));

const mockAppendAgentActivity = vi.fn();
vi.mock('../../services/agentActivityService', () => ({
  appendAgentActivity: (...args: unknown[]) => mockAppendAgentActivity(...args)
}));

const mockPlanCall = vi.fn();
const mockRunCall = vi.fn();
const mockGetCallRun = vi.fn();
vi.mock('../../services/connectors/calleMcpConnector', () => ({
  planCall: (...args: unknown[]) => mockPlanCall(...args),
  runCall: (...args: unknown[]) => mockRunCall(...args),
  getCallRun: (...args: unknown[]) => mockGetCallRun(...args)
}));

const mockEvaluatePolicyGate = vi.fn(() => ({ ok: true }));
vi.mock('../../services/policyEnforcementService', () => ({
  evaluatePolicyGate: (...args: unknown[]) => mockEvaluatePolicyGate(...args)
}));

vi.stubGlobal('dispatchEvent', vi.fn());

import { getMcpOutreachRecord, handleMcpOutreachMessage } from '../../services/calleMcpOutreachService';

beforeEach(() => {
  for (const key of Object.keys(kvStore)) delete kvStore[key];
  mockInvoke.mockClear();
  mockAppendAgentActivity.mockClear();
  mockPlanCall.mockReset();
  mockRunCall.mockReset();
  mockGetCallRun.mockReset();
  mockEvaluatePolicyGate.mockClear();
});

describe('storage layer', () => {
  it('getMcpOutreachRecord returns null when nothing has ever been persisted for this chatId', async () => {
    expect(await getMcpOutreachRecord('chat-1')).toBeNull();
  });

  it('persisting a record via handleMcpOutreachMessage makes it retrievable, keyed correctly, and updates the shared index', async () => {
    mockPlanCall.mockResolvedValueOnce({ ready_to_run: false, clarifying_questions: ['What phone number?'] });
    await handleMcpOutreachMessage('chat-1', 'call Joe\'s Pizza');

    const record = await getMcpOutreachRecord('chat-1');
    expect(record?.stage).toBe('clarifying');
    expect(record?.chatId).toBe('chat-1');

    const index = JSON.parse(kvStore['calle_mcp_outreach_index']);
    expect(index).toEqual(['chat-1']);
  });

  it('a second chat gets its own independent record without disturbing the first', async () => {
    mockPlanCall.mockResolvedValue({ ready_to_run: false, clarifying_questions: ['q'] });
    await handleMcpOutreachMessage('chat-1', 'call A');
    await handleMcpOutreachMessage('chat-2', 'call B');

    expect((await getMcpOutreachRecord('chat-1'))?.goal).toBe('call A');
    expect((await getMcpOutreachRecord('chat-2'))?.goal).toBe('call B');
    const index = JSON.parse(kvStore['calle_mcp_outreach_index']);
    expect(index.slice().sort()).toEqual(['chat-1', 'chat-2']);
  });
});
