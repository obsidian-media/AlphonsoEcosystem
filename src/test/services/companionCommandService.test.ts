import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../services/jose/joseInbound', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/jose/joseInbound')>()),
  answerOrPlan: vi.fn(),
}));
vi.mock('../../lib/ollama', () => ({ generateOllamaResponse: vi.fn(), PREFERRED_MODEL: 'llama3.2:3b' }));

import { answerOrPlan } from '../../services/jose/joseInbound';
import { generateOllamaResponse } from '../../lib/ollama';
import { handleCompanionCommand } from '../../services/companionCommandService';

const broadcast = vi.fn(async () => undefined);
const deps = (signal = new AbortController().signal) => ({ broadcast, endpoint: 'http://e', model: 'm', zeroCostMode: true, signal });
const cmd = { commandId: 'c1', text: 'Plan a launch', agentId: 'alphonso', language: 'English', voiceConversation: false };

beforeEach(() => vi.clearAllMocks());

describe('handleCompanionCommand (phase 6a)', () => {
  it('goes through Jose and sends the answer back', async () => {
    vi.mocked(answerOrPlan).mockResolvedValueOnce({ kind: 'answer', text: 'Paris.' });
    await handleCompanionCommand(cmd, deps());
    expect(answerOrPlan).toHaveBeenCalledWith('Plan a launch', expect.objectContaining({ source: 'ios_companion', endpoint: 'http://e', zeroCostMode: true }));
    expect(broadcast).toHaveBeenCalledWith('done', { commandId: 'c1', summary: 'Paris.' });
  });

  it("sends a finished request's report", async () => {
    vi.mocked(answerOrPlan).mockResolvedValueOnce({ kind: 'request', requestId: 'r', waitingForPlan: false, result: { ok: true, command: { userReport: { summary: 'Hector found 3 sources.' } } } });
    await handleCompanionCommand(cmd, deps());
    expect(broadcast).toHaveBeenCalledWith('done', { commandId: 'c1', summary: 'Hector found 3 sources.' });
  });

  it('says when the plan waits for you', async () => {
    vi.mocked(answerOrPlan).mockResolvedValueOnce({ kind: 'request', requestId: 'r', waitingForPlan: true, result: { waitingForPlan: true } });
    await handleCompanionCommand(cmd, deps());
    expect(broadcast).toHaveBeenCalledWith('done', { commandId: 'c1', summary: "Jose's plan is waiting for you on the board in the app." });
  });

  it('reports progress as agent status', async () => {
    vi.mocked(answerOrPlan).mockImplementationOnce(async (_t, options: any) => {
      options.onProgress({ stage: 'executed', assignment: { agent: 'hector' } });
      return { kind: 'answer', text: 'ok' };
    });
    await handleCompanionCommand(cmd, deps());
    expect(broadcast).toHaveBeenCalledWith('agent_status', { commandId: 'c1', agent: 'hector', status: 'executed', detail: 'hector completed' });
  });

  it('sends nothing once aborted', async () => {
    const ctrl = new AbortController();
    vi.mocked(answerOrPlan).mockImplementationOnce(async () => { ctrl.abort(); return { kind: 'answer', text: 'late' }; });
    await handleCompanionCommand(cmd, deps(ctrl.signal));
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('sends the error back', async () => {
    vi.mocked(answerOrPlan).mockRejectedValueOnce(new Error('no model'));
    await handleCompanionCommand(cmd, deps());
    expect(broadcast).toHaveBeenCalledWith('done', { commandId: 'c1', error: 'Error: no model' });
  });

  it('a spoken conversation stays a direct reply from the chosen agent', async () => {
    vi.mocked(generateOllamaResponse).mockResolvedValueOnce({ response: 'Hello.' } as never);
    await handleCompanionCommand({ ...cmd, agentId: 'miya', voiceConversation: true }, deps());
    expect(answerOrPlan).not.toHaveBeenCalled();
    expect(vi.mocked(generateOllamaResponse).mock.calls[0][0]).toMatchObject({ endpoint: 'http://e', model: 'm' });
    expect(broadcast).toHaveBeenCalledWith('done', { commandId: 'c1', summary: 'Hello.' });
  });
});
