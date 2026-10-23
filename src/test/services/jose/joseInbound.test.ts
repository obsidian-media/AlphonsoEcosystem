import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../services/jose/joseDecision', () => ({ decideJoseRoute: vi.fn() }));
vi.mock('../../../services/jose/submitToJose', () => ({ submitToJose: vi.fn() }));
vi.mock('../../../lib/ollama', () => ({ generateAgentLlmResponse: vi.fn() }));

import { decideJoseRoute } from '../../../services/jose/joseDecision';
import { submitToJose } from '../../../services/jose/submitToJose';
import { generateAgentLlmResponse } from '../../../lib/ollama';
import { answerOrPlan } from '../../../services/jose/joseInbound';

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
});
