import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../services/jose/joseDecision', () => ({ decideJoseRoute: vi.fn() }));
vi.mock('../../../services/jose/submitToJose', () => ({ submitToJose: vi.fn() }));
vi.mock('../../../lib/ollama', () => ({ generateAgentLlmResponse: vi.fn() }));

import { decideJoseRoute } from '../../../services/jose/joseDecision';
import { submitToJose } from '../../../services/jose/submitToJose';
import { generateAgentLlmResponse } from '../../../lib/ollama';
import { answerOrPlan, inboundReply, outcomeLine } from '../../../services/jose/joseInbound';

beforeEach(() => vi.clearAllMocks());

describe('answerOrPlan', () => {
  it('answers a plain question without making a request', async () => {
    vi.mocked(decideJoseRoute).mockResolvedValueOnce({ route: 'direct', source: 'rule', reason: 'q' } as never);
    vi.mocked(generateAgentLlmResponse).mockResolvedValueOnce({ response: ' Paris. ' } as never);
    expect(await answerOrPlan('What is the capital of France?', { source: 'telegram' })).toEqual({ kind: 'answer', text: 'Paris.' });
    expect(submitToJose).not.toHaveBeenCalled();
    expect(vi.mocked(generateAgentLlmResponse).mock.calls[0][0]).toBe('alphonso');
  });

  it('says so when the model gives no answer', async () => {
    vi.mocked(decideJoseRoute).mockResolvedValueOnce({ route: 'direct', source: 'rule', reason: 'q' } as never);
    vi.mocked(generateAgentLlmResponse).mockResolvedValueOnce({ response: '' } as never);
    await expect(answerOrPlan('Hi?', { source: 'telegram' })).rejects.toThrow('The model returned an empty reply.');
  });

  it('hands a task to Jose with the caller\'s options', async () => {
    vi.mocked(decideJoseRoute).mockResolvedValueOnce({ route: 'plan', source: 'model', reason: 't' } as never);
    vi.mocked(submitToJose).mockResolvedValueOnce({ ok: true, requestId: 'r1', waitingForPlan: false } as never);
    const result = await answerOrPlan('Research the launch', { source: 'schedule', showPlanFirst: 'never', allowPaidModels: false });
    expect(result).toMatchObject({ kind: 'request', requestId: 'r1', waitingForPlan: false });
    expect(submitToJose).toHaveBeenCalledWith(expect.objectContaining({ text: 'Research the launch', source: 'schedule', showPlanFirst: 'never', allowPaidModels: false }));
  });

  it('in the background, starts the request and returns at once', async () => {
    vi.mocked(decideJoseRoute).mockResolvedValueOnce({ route: 'plan', source: 'model', reason: 't' } as never);
    let finish: (v: unknown) => void = () => {};
    vi.mocked(submitToJose).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }) as never);
    const started = await answerOrPlan('Research the launch', { source: 'telegram', background: true });
    expect(started.kind).toBe('started');
    finish({ ok: true, requestId: 'r1', waitingForPlan: true });
    expect(await (started as any).done).toMatchObject({ requestId: 'r1', waitingForPlan: true });
  });
});

describe('what a channel says back', () => {
  it('an answer, or that Jose is on it, per channel', () => {
    expect(inboundReply({ kind: 'answer', text: 'Paris.' }, 'telegram')).toBe('Paris.');
    expect(inboundReply({ kind: 'started', done: Promise.resolve({}) }, 'telegram')).toBe("Jose is on it. I'll tell you when it's done, or when something needs you.");
    expect(inboundReply({ kind: 'started', done: Promise.resolve({}) }, 'whatsapp')).toBe("Jose is on it. I'll tell you when it's done.");
  });

  it('one line for how a request ended', () => {
    expect(outcomeLine({ waitingForPlan: true })).toBe("Jose's plan is waiting for you on the board in the app.");
    expect(outcomeLine({ pendingApprovalCount: 1 })).toBe('A step is waiting for your approval in the app.');
    expect(outcomeLine({ ok: true, executedCount: 2, failedCount: 0 })).toBe('Done.');
    expect(outcomeLine({ ok: false, reason: 'plan_rejected', problems: ['x'] })).toBe("Jose couldn't run it: x");
    expect(outcomeLine({ ok: true, failedCount: 1, executedCount: 1 })).toBe('Finished, but a step failed. See the board in the app.');
  });
});
