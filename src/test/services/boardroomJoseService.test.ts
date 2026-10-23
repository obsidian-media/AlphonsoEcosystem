import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../services/jose/submitToJose', () => ({ submitStepsToJose: vi.fn() }));
vi.mock('../../services/jose/joseStepOutputs', () => ({ getStepOutput: vi.fn() }));

import { submitStepsToJose } from '../../services/jose/submitToJose';
import { getStepOutput } from '../../services/jose/joseStepOutputs';
import { concludeOnJose, distributeOnJose, creativeBriefOnJose, BOARDROOM_LABEL } from '../../services/boardroomJoseService';

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
});
