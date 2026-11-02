// Phone app phase 3 part A (owner, 2026-11-02): Boardroom's reply loop moves out of the desktop
// screen so a message from the phone gets exactly the same replies and limits.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateAgentResponse = vi.fn();
vi.mock('../../services/boardroomFacilitatorService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/boardroomFacilitatorService')>()),
  generateAgentResponse: (...a: unknown[]) => generateAgentResponse(...a),
}));
const workOnJose = vi.fn();
vi.mock('../../services/boardroomJoseService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/boardroomJoseService')>()),
  workOnJose: (...a: unknown[]) => workOnJose(...a),
}));

const { runBoardroomReplies, HERMES_ON_COMPUTER, MAX_CHAIN_DEPTH } = await import('../../services/boardroomReplies');
const { createThread, listThreadMessages } = await import('../../services/boardroomThreadService');

const allow = async () => true;
let threadId = '';

beforeEach(() => {
  localStorage.clear();
  generateAgentResponse.mockReset().mockImplementation(async ({ agentId }: { agentId: string }) => ({ ok: true, text: `${agentId} says hi`, model: 'm', latencyMs: 5 }));
  workOnJose.mockReset().mockResolvedValue({ requestId: 'req-1', waiting: false, summary: 'Hector: done.' });
  threadId = createThread({ topic: 'Launch', participants: ['alphonso', 'maria', 'nova'] }).id;
});

const speakers = () => listThreadMessages(threadId).map((m) => m.speaker);

describe('runBoardroomReplies', () => {
  it('posts the message and the mentioned agents reply in order', async () => {
    await runBoardroomReplies({ threadId, text: '@maria @nova thoughts?', approve: allow });
    expect(speakers()).toEqual(['user', 'maria', 'nova']);
  });

  it('with no mention, Alphonso replies', async () => {
    await runBoardroomReplies({ threadId, text: 'thoughts?', approve: allow });
    expect(speakers()).toEqual(['user', 'alphonso']);
  });

  it('stops after MAX_CHAIN_DEPTH chained replies with an escalation', async () => {
    const next: Record<string, string> = { maria: '@nova', nova: '@alphonso', alphonso: '@maria' };
    generateAgentResponse.mockImplementation(async ({ agentId }: { agentId: string }) => ({ ok: true, text: `over to ${next[agentId]}`, model: 'm', latencyMs: 1 }));
    await runBoardroomReplies({ threadId, text: '@maria start', approve: allow });
    const messages = listThreadMessages(threadId);
    expect(generateAgentResponse).toHaveBeenCalledTimes(MAX_CHAIN_DEPTH);
    expect(messages[messages.length - 1].kind).toBe('escalation');
  });

  it('work asked for goes to Jose, not a chat reply', async () => {
    await runBoardroomReplies({ threadId, text: 'research the bakery market in Lisbon', approve: allow });
    expect(workOnJose).toHaveBeenCalledTimes(1);
    expect(generateAgentResponse).not.toHaveBeenCalled();
  });

  it('a Hermes agent from the phone fails with HERMES_ON_COMPUTER', async () => {
    await runBoardroomReplies({ threadId, text: '@maria hi', approve: async () => false });
    const failure = listThreadMessages(threadId).find((m) => m.kind === 'failure');
    expect(failure?.content).toContain(HERMES_ON_COMPUTER);
    expect(generateAgentResponse).not.toHaveBeenCalled();
  });

  it('tells its caller after every change', async () => {
    const onChange = vi.fn();
    await runBoardroomReplies({ threadId, text: '@maria hi', approve: allow, onChange });
    expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
