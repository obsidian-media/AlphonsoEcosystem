import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../services/jose/submitToJose', () => ({ submitStepsToJose: vi.fn(), submitToJose: vi.fn() }));
vi.mock('../../services/jose/joseRequestStore', () => ({ getJoseRequest: vi.fn() }));
vi.mock('../../services/jose/joseSummary', () => ({ closingSummary: vi.fn(() => 'Hector: Found the top 5 KDP niches [1].') }));
vi.mock('../../services/jose/joseStepOutputs', () => ({ getStepOutput: vi.fn() }));

import { submitStepsToJose, submitToJose } from '../../services/jose/submitToJose';
import { getJoseRequest } from '../../services/jose/joseRequestStore';
import { getStepOutput } from '../../services/jose/joseStepOutputs';
import { concludeOnJose, distributeOnJose, creativeBriefOnJose, BOARDROOM_LABEL, workRequestIn, workOnJose } from '../../services/boardroomJoseService';

const stepsOf = () => vi.mocked(submitStepsToJose).mock.calls[0][0].steps;

beforeEach(() => vi.clearAllMocks());

describe('Boardroom thread actions through Jose (phase 6a)', () => {
  it("Conclude runs one Maria review step and returns her verdict", async () => {
    vi.mocked(submitStepsToJose).mockResolvedValueOnce({ ok: true, commandId: 'c1', requestId: 'jose-request-c1' });
    vi.mocked(getStepOutput).mockReturnValueOnce({ summary: 'Fine.', schema: { riskLevel: 'low', approvalRequired: false, summary: 'Fine.', confidenceLevel: 'verified' } } as never);
    const result = await concludeOnJose('Launch plan', 'jose: ship it');
    expect(vi.mocked(submitStepsToJose).mock.calls[0][0]).toMatchObject({ source: 'boardroom', label: BOARDROOM_LABEL, text: 'Boardroom discussion: Launch plan\n\njose: ship it' });
    expect(stepsOf()).toEqual([expect.objectContaining({ stepId: 'maria', agent: 'maria', actionType: 'audit_governance', effects: ['read'], needs: [] })]);
    expect(getStepOutput).toHaveBeenCalledWith('c1', 'maria');
    expect(result).toEqual({ requestId: 'jose-request-c1', review: { riskLevel: 'low', approvalRequired: false, summary: 'Fine.', confidenceLevel: 'verified' } });
  });

  it('Conclude has no verdict when the request was refused', async () => {
    vi.mocked(submitStepsToJose).mockResolvedValueOnce({ ok: false, reason: 'plan_rejected', problems: ['x'] });
    expect(await concludeOnJose('t', 'x')).toEqual({ requestId: null, review: null });
  });

  it('Distribute to Slack is a Marcus step that sends, so it waits for approval', async () => {
    vi.mocked(submitStepsToJose).mockResolvedValueOnce({ ok: true, commandId: 'c2', requestId: 'jose-request-c2', pendingApprovalCount: 1 });
    const result = await distributeOnJose('Launch plan', 'Fine.', 'slack', '#launch');
    expect(stepsOf()).toEqual([expect.objectContaining({
      agent: 'marcus', actionType: 'distribution_slack', effects: ['publish_or_send'],
      payload: { channel: '#launch', text: 'Boardroom: Launch plan\nFine.' },
    })]);
    expect(result).toEqual({ requestId: 'jose-request-c2', waiting: true, summary: '' });
  });

  it('Distribute review only reads, and returns Marcus\'s summary', async () => {
    vi.mocked(submitStepsToJose).mockResolvedValueOnce({ ok: true, commandId: 'c3', requestId: 'jose-request-c3', pendingApprovalCount: 0 });
    vi.mocked(getStepOutput).mockReturnValueOnce({ summary: 'Ready for Slack and the blog.' } as never);
    const result = await distributeOnJose('Launch plan', 'Fine.', 'review', '');
    expect(stepsOf()).toEqual([expect.objectContaining({ agent: 'marcus', actionType: 'distribution_review', effects: ['read'] })]);
    expect(stepsOf()[0].payload).toBeUndefined();
    expect(result).toEqual({ requestId: 'jose-request-c3', waiting: false, summary: 'Ready for Slack and the blog.' });
  });

  it('Creative brief is one Miya step', async () => {
    vi.mocked(submitStepsToJose).mockResolvedValueOnce({ ok: true, commandId: 'c4', requestId: 'jose-request-c4', pendingApprovalCount: 0 });
    vi.mocked(getStepOutput).mockReturnValueOnce({ summary: 'A brief.' } as never);
    const result = await creativeBriefOnJose('Launch plan', 'context here');
    expect(stepsOf()).toEqual([expect.objectContaining({ stepId: 'miya', agent: 'miya', actionType: 'creative_brief', effects: ['write_own_work'] })]);
    expect(stepsOf()[0].instruction).toContain('Launch plan');
    expect(result).toEqual({ requestId: 'jose-request-c4', waiting: false, summary: 'A brief.' });
  });

  it("Conclude says when Maria's step is waiting for approval", async () => {
    vi.mocked(submitStepsToJose).mockResolvedValueOnce({ ok: true, commandId: 'c5', requestId: 'jose-request-c5', pendingApprovalCount: 1 });
    expect(await concludeOnJose('t', 'x')).toEqual({ requestId: 'jose-request-c5', review: null, waiting: true });
    expect(getStepOutput).not.toHaveBeenCalled();
  });
});

// 2.11.0 QA (owner, 2026-11-01): in a thread Hector said "I'll research…" and never could, and
// "/jose" was answered by Alphonso. Work asked for in a thread is a real Jose request.
describe('work asked for in a Boardroom thread', () => {
  const names = ['Hector', 'Jose', 'Alphonso'];

  it('recognises /jose and the requests the rules already plan, after any @mentions', () => {
    expect(workRequestIn('/jose research the top-selling KDP niches', names)).toBe('research the top-selling KDP niches');
    expect(workRequestIn('@Hector research the top-selling KDP niches', names)).toBe('research the top-selling KDP niches');
    expect(workRequestIn('@Hector, look up the current price of a Raspberry Pi 5', names)).toBe('look up the current price of a Raspberry Pi 5');
    expect(workRequestIn('What do you think about KDP?', names)).toBeNull();
    expect(workRequestIn('@Hector what happened?', names)).toBeNull();
    expect(workRequestIn('/jose', names)).toBeNull();
  });

  it("runs it as a Jose request and returns Jose's closing summary", async () => {
    vi.mocked(submitToJose).mockImplementationOnce(async (input: any) => {
      input.onProgress?.({ stage: 'request_started', requestId: 'jose-request-9' });
      return { ok: true, requestId: 'jose-request-9' };
    });
    vi.mocked(getJoseRequest).mockReturnValueOnce({ id: 'jose-request-9' } as never);
    const started = vi.fn();
    const result = await workOnJose('research KDP niches', { onStarted: started });
    expect(vi.mocked(submitToJose).mock.calls[0][0]).toMatchObject({ text: 'research KDP niches', source: 'boardroom' });
    expect(started).toHaveBeenCalledWith('jose-request-9');
    expect(result).toEqual({ requestId: 'jose-request-9', waiting: false, summary: 'Hector: Found the top 5 KDP niches [1].' });
  });

  it('says when it waits for you, and when Jose could not run it', async () => {
    vi.mocked(submitToJose).mockResolvedValueOnce({ ok: true, requestId: 'r2', pendingApprovalCount: 1 });
    vi.mocked(getJoseRequest).mockReturnValueOnce(null as never);
    expect(await workOnJose('send it')).toEqual({ requestId: 'r2', waiting: true, summary: 'A step is waiting for your approval in the app.' });
    vi.mocked(submitToJose).mockResolvedValueOnce({ ok: false, reason: 'plan_rejected', problems: ['No agent owns this.'] });
    expect(await workOnJose('x')).toEqual({ requestId: null, waiting: false, summary: "Jose couldn't run it: No agent owns this." });
  });
});
