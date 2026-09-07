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

const mockEvaluatePolicyGate = vi.fn((..._args: unknown[]): { ok: boolean; reason?: string } => ({ ok: true }));
vi.mock('../../services/policyEnforcementService', () => ({
  evaluatePolicyGate: (...args: unknown[]) => mockEvaluatePolicyGate(...args)
}));

vi.stubGlobal('dispatchEvent', vi.fn());

import {
  getMcpOutreachRecord,
  handleMcpOutreachMessage,
  confirmMcpOutreachCall,
  cancelMcpOutreachCall,
  markMcpOutreachDelivered,
  recoverInterruptedMcpOutreachCalls,
  __resetMcpOutreachStateForTests
} from '../../services/calleMcpOutreachService';

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

describe('confirmMcpOutreachCall', () => {
  async function getToReadyToConfirm(chatId: string) {
    mockPlanCall.mockResolvedValueOnce({ ready_to_run: true, plan_id: 'p1', confirm_token: 't1', summary: 'Call Joe' });
    await handleMcpOutreachMessage(chatId, 'call Joe\'s Pizza');
  }

  it('returns "No pending call plan" when there is nothing ready_to_confirm', async () => {
    expect(await confirmMcpOutreachCall('chat-x')).toBe('No pending call plan to confirm.');
  });

  it('checks the policy gate and blocks when it says no', async () => {
    await getToReadyToConfirm('chat-1');
    mockEvaluatePolicyGate.mockReturnValueOnce({ ok: false, reason: 'Zero-Cost Mode is on' });
    const reply = await confirmMcpOutreachCall('chat-1');
    expect(reply).toContain('Blocked');
    expect(mockRunCall).not.toHaveBeenCalled();
  });

  it('places the call, moves to in_progress, and starts polling', async () => {
    await getToReadyToConfirm('chat-1');
    mockRunCall.mockResolvedValueOnce({ run_id: 'run1', status: 'QUEUED' });
    mockGetCallRun.mockResolvedValueOnce({ status: 'COMPLETED', structuredContent: {} });
    const reply = await confirmMcpOutreachCall('chat-1');
    expect(reply).toContain('Call started');
    expect((await getMcpOutreachRecord('chat-1'))?.stage).toBe('in_progress');
  });

  it('persists a durable "submitting" marker before runCall, and blocks any retry after runCall fails -- run_call has no idempotency key, so retrying risks a duplicate call', async () => {
    await getToReadyToConfirm('chat-1');
    mockRunCall.mockRejectedValueOnce(new Error('CALL-E API error (500)'));

    const firstReply = await confirmMcpOutreachCall('chat-1');
    expect(firstReply).toContain('CALL-E error');
    expect((await getMcpOutreachRecord('chat-1'))?.stage).toBe('submitting');

    mockRunCall.mockClear();
    const retryReply = await confirmMcpOutreachCall('chat-1');
    expect(retryReply).toContain('already submitted');
    expect(mockRunCall).not.toHaveBeenCalled();
  });

  it('two concurrent confirms for the same chat result in exactly one runCall', async () => {
    await getToReadyToConfirm('chat-1');
    mockRunCall.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ run_id: 'run1', status: 'QUEUED' }), 20)));
    mockGetCallRun.mockResolvedValue({ status: 'COMPLETED' });
    const [a, b] = await Promise.all([confirmMcpOutreachCall('chat-1'), confirmMcpOutreachCall('chat-1')]);
    expect(mockRunCall).toHaveBeenCalledTimes(1);
    expect([a, b].some((r) => r.includes('Already placing'))).toBe(true);
  });
});

describe('cancelMcpOutreachCall', () => {
  it('deletes a pre-submission (ready_to_confirm) record', async () => {
    mockPlanCall.mockResolvedValueOnce({ ready_to_run: true, plan_id: 'p1', confirm_token: 't1', summary: 's' });
    await handleMcpOutreachMessage('chat-1', 'call Joe');
    await cancelMcpOutreachCall('chat-1');
    expect(await getMcpOutreachRecord('chat-1')).toBeNull();
  });

  it('does NOT delete an in_progress record -- CALL-E has no remote cancel, so dropping it here would silently lose tracking of a call still running', async () => {
    mockPlanCall.mockResolvedValueOnce({ ready_to_run: true, plan_id: 'p1', confirm_token: 't1', summary: 's' });
    await handleMcpOutreachMessage('chat-1', 'call Joe');
    mockRunCall.mockResolvedValueOnce({ run_id: 'run1', status: 'QUEUED' });
    mockGetCallRun.mockResolvedValue({ status: 'QUEUED' });
    await confirmMcpOutreachCall('chat-1');

    const reply = await cancelMcpOutreachCall('chat-1');
    expect(reply).toContain('cannot be cancelled remotely');
    expect((await getMcpOutreachRecord('chat-1'))?.stage).toBe('in_progress');
  });
});

describe('markMcpOutreachDelivered', () => {
  it('sets delivered: true on the persisted record', async () => {
    mockPlanCall.mockResolvedValueOnce({ ready_to_run: false, clarifying_questions: ['q'] });
    await handleMcpOutreachMessage('chat-1', 'call Joe');
    await markMcpOutreachDelivered('chat-1');
    expect((await getMcpOutreachRecord('chat-1'))?.delivered).toBe(true);
  });
});

describe('recoverInterruptedMcpOutreachCalls', () => {
  it('restarts polling for an in_progress record and never calls runCall', async () => {
    mockPlanCall.mockResolvedValueOnce({ ready_to_run: true, plan_id: 'p1', confirm_token: 't1', summary: 's' });
    await handleMcpOutreachMessage('chat-1', 'call Joe');
    mockRunCall.mockResolvedValueOnce({ run_id: 'run1', status: 'QUEUED' });
    mockGetCallRun.mockResolvedValue({ status: 'QUEUED' });
    await confirmMcpOutreachCall('chat-1');

    mockRunCall.mockClear();
    mockGetCallRun.mockClear();
    mockGetCallRun.mockResolvedValueOnce({ status: 'COMPLETED' });

    vi.useFakeTimers();
    recoverInterruptedMcpOutreachCalls();
    await vi.advanceTimersByTimeAsync(10_000);
    vi.useRealTimers();

    expect(mockRunCall).not.toHaveBeenCalled();
    expect(mockGetCallRun).toHaveBeenCalledWith('run1');
    expect((await getMcpOutreachRecord('chat-1'))?.stage).toBe('completed');
  });
});
