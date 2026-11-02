import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  const requests = new Map<string, any>();
  return {
    requests,
    engine: {
      approveRequestStep: vi.fn(async () => ({ ok: true })),
      rejectRequestStep: vi.fn(() => ({ ok: true, summary: 'Rejected.' })),
      carryOnRequest: vi.fn(async () => ({ ok: true })),
      cancelRequest: vi.fn(() => ({ ok: true, summary: 'Cancelled.' })),
    },
    stop: { stopRequest: vi.fn(() => ({ ok: true, summary: 'Stopped by you.' })) },
    submit: { runApprovedPlan: vi.fn(async () => ({ ok: true })), cancelPlan: vi.fn(() => ({})) },
    inbound: {
      answerOrPlan: vi.fn(async () => ({ kind: 'answer', text: 'Paris.' })),
      inboundReply: (r: any) => (r.kind === 'answer' ? r.text : 'Jose is on it.'),
      outcomeLine: () => 'Done.',
    },
  };
});
vi.mock('../../../services/joseExecutionEngineService', () => h.engine);
vi.mock('../../../services/jose/joseStop', () => h.stop);
vi.mock('../../../services/jose/submitToJose', () => h.submit);
vi.mock('../../../services/jose/joseInbound', () => h.inbound);
vi.mock('../../../services/jose/joseRequestStore', () => ({ getJoseRequest: (id: string) => h.requests.get(id) || null }));

import { ALREADY_DONE, NOT_FROM_PHONE, handlePhoneCall, resetPhoneCallsForTests } from '../../../services/phone/phoneCalls';

const call = (name: string, args: unknown, id = Math.random().toString(36)) => ({ id, kind: 'call' as const, name: name as any, args });

describe('phoneCalls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPhoneCallsForTests();
    h.requests.clear();
    h.requests.set('r1', { id: 'r1', status: 'waiting_approval', steps: [{ stepId: 'hector', agent: 'hector', status: 'waiting_approval', effects: ['read', 'spend'] }] });
  });

  it('approve twice runs once and the second says Already done.', async () => {
    const [a, b] = await Promise.all([
      handlePhoneCall(call('request.approveStep', { requestId: 'r1', stepId: 'hector' }), 'ph-1'),
      handlePhoneCall(call('request.approveStep', { requestId: 'r1', stepId: 'hector' }), 'ph-2'),
    ]);
    expect(h.engine.approveRequestStep).toHaveBeenCalledTimes(1);
    expect([a, b]).toContain(ALREADY_DONE);
    expect([a, b].find((x) => x !== ALREADY_DONE)).toMatch(/Approved/);
  });

  it('a spend step approved from the phone goes through the same approval as the desktop', async () => {
    await handlePhoneCall(call('request.approveStep', { requestId: 'r1', stepId: 'hector' }), 'ph-1');
    // Exactly the board's call: the cap, Zero-Cost Mode and the rest are checked by the engine when it runs.
    expect(h.engine.approveRequestStep).toHaveBeenCalledWith('r1', 'hector');
  });

  it('a step no longer waiting says Already done.', async () => {
    h.requests.get('r1').status = 'running';
    expect(await handlePhoneCall(call('request.approveStep', { requestId: 'r1', stepId: 'hector' }), 'ph-1')).toBe(ALREADY_DONE);
    expect(await handlePhoneCall(call('request.rejectStep', { requestId: 'r1', stepId: 'hector' }), 'ph-1')).toBe(ALREADY_DONE);
    expect(h.engine.approveRequestStep).not.toHaveBeenCalled();
  });

  it('a call not in PHONE_CALLS is refused', async () => {
    await expect(handlePhoneCall(call('settings.set', { zeroCostMode: false }), 'ph-1')).rejects.toThrow(NOT_FROM_PHONE);
    await expect(handlePhoneCall(call('toString', {}), 'ph-1')).rejects.toThrow(NOT_FROM_PHONE);
  });

  it('chat.send reaches answerOrPlan with source phone and the repeat id is ignored', async () => {
    const first = await handlePhoneCall(call('chat.send', { messageId: 'msg-1', text: 'Capital of France?' }), 'ph-1');
    expect(first).toEqual({ messageId: 'msg-1', reply: 'Paris.' });
    expect(h.inbound.answerOrPlan).toHaveBeenCalledWith('Capital of France?', expect.objectContaining({ source: 'phone', background: true }));
    const again = await handlePhoneCall(call('chat.send', { messageId: 'msg-1', text: 'Capital of France?' }), 'ph-1');
    expect(h.inbound.answerOrPlan).toHaveBeenCalledTimes(1);
    expect(again).toEqual({ messageId: 'msg-1', reply: 'Paris.' });
  });

  it('stop, cancel, carry on, run and cancel a plan reach the computer\'s own functions', async () => {
    expect(await handlePhoneCall(call('request.stop', { requestId: 'r1' }), 'ph-1')).toBe('Stopped by you.');
    h.requests.set('r2', { id: 'r2', status: 'interrupted', steps: [] });
    expect(await handlePhoneCall(call('request.cancel', { requestId: 'r2' }), 'ph-1')).toBe('Cancelled.');
    await handlePhoneCall(call('request.carryOn', { requestId: 'r2' }), 'ph-1');
    expect(h.engine.carryOnRequest).toHaveBeenCalledWith('r2');
    h.requests.set('r3', { id: 'r3', status: 'waiting_plan_approval', steps: [] });
    await handlePhoneCall(call('plan.run', { requestId: 'r3' }), 'ph-1');
    expect(h.submit.runApprovedPlan).toHaveBeenCalledWith('r3');
    h.requests.set('r4', { id: 'r4', status: 'waiting_plan_approval', steps: [] });
    await handlePhoneCall(call('plan.cancel', { requestId: 'r4' }), 'ph-1');
    expect(h.submit.cancelPlan).toHaveBeenCalledWith('r4');
  });
});
