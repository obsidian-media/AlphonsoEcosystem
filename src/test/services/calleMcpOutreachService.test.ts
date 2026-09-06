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

import { getMcpOutreachRecord, handleMcpOutreachMessage, __resetMcpOutreachStateForTests } from '../../services/calleMcpOutreachService';

beforeEach(() => {
  for (const key of Object.keys(kvStore)) delete kvStore[key];
  __resetMcpOutreachStateForTests();
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

describe('clarifying-question state machine', () => {
  it('stays in clarifying and accumulates conversation_history across multiple rounds', async () => {
    mockPlanCall
      .mockResolvedValueOnce({ ready_to_run: false, clarifying_questions: ['What phone number?'] })
      .mockResolvedValueOnce({ ready_to_run: false, clarifying_questions: ['What should I ask them?'] });

    await handleMcpOutreachMessage('chat-1', 'call Joe\'s Pizza');
    await handleMcpOutreachMessage('chat-1', '+15550123456');

    expect(mockPlanCall).toHaveBeenNthCalledWith(2, 'call Joe\'s Pizza', ['call Joe\'s Pizza', '+15550123456']);
    expect((await getMcpOutreachRecord('chat-1'))?.stage).toBe('clarifying');
  });

  it('moves to ready_to_confirm once plan_call reports ready_to_run', async () => {
    mockPlanCall.mockResolvedValueOnce({ ready_to_run: true, plan_id: 'p1', confirm_token: 't1', summary: 'Call Joe\'s Pizza at +15550123456' });
    const reply = await handleMcpOutreachMessage('chat-1', 'call Joe\'s Pizza at +15550123456 and ask about a new website');
    expect(reply).toContain('Joe\'s Pizza');
    const record = await getMcpOutreachRecord('chat-1');
    expect(record?.stage).toBe('ready_to_confirm');
    expect(record?.planId).toBe('p1');
    expect(record?.confirmToken).toBe('t1');
  });

  it('"cancel" during clarifying deletes the record entirely', async () => {
    mockPlanCall.mockResolvedValueOnce({ ready_to_run: false, clarifying_questions: ['q'] });
    await handleMcpOutreachMessage('chat-1', 'call Joe\'s Pizza');
    const reply = await handleMcpOutreachMessage('chat-1', 'cancel');
    expect(reply).toBe('Call plan dropped.');
    expect(await getMcpOutreachRecord('chat-1')).toBeNull();
  });

  it('blocks a second plan to a phone number already ready_to_confirm elsewhere', async () => {
    mockPlanCall
      .mockResolvedValueOnce({ ready_to_run: true, plan_id: 'p1', confirm_token: 't1', phone_number: '+15550123456', summary: 's1' })
      .mockResolvedValueOnce({ ready_to_run: true, plan_id: 'p2', confirm_token: 't2', phone_number: '+15550123456', summary: 's2' });

    await handleMcpOutreachMessage('chat-1', 'call +15550123456');
    const reply = await handleMcpOutreachMessage('chat-2', 'call +15550123456');
    expect(reply).toContain('already pending or in progress');
    expect(await getMcpOutreachRecord('chat-2')).toBeNull();
  });

  it('re-sending a call-like message while ready_to_confirm tells the user to use the buttons, not free text', async () => {
    mockPlanCall.mockResolvedValueOnce({ ready_to_run: true, plan_id: 'p1', confirm_token: 't1', summary: 's1' });
    await handleMcpOutreachMessage('chat-1', 'call Joe\'s Pizza');
    const reply = await handleMcpOutreachMessage('chat-1', 'call them again');
    expect(reply).toContain('Approve or Cancel button');
  });

  it('a network/API error returns a plain error string instead of throwing, with no partial record persisted', async () => {
    mockPlanCall.mockRejectedValueOnce(new Error('network down'));
    const reply = await handleMcpOutreachMessage('chat-1', 'call Joe\'s Pizza');
    expect(reply).toBe('CALL-E error: network down');
    expect(await getMcpOutreachRecord('chat-1')).toBeNull();
  });
});
