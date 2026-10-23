import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../services/jose/joseInbound', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/jose/joseInbound')>()),
  answerOrPlan: vi.fn(),
}));

import { answerOrPlan } from '../../services/jose/joseInbound';
import { runScheduledCommand } from '../../services/scheduledCommandService';

beforeEach(() => vi.clearAllMocks());

describe('runScheduledCommand (phase 6a)', () => {
  it('never shows the plan first and never uses a paid model', async () => {
    vi.mocked(answerOrPlan).mockResolvedValueOnce({ kind: 'answer', text: 'ok' });
    await runScheduledCommand('Research the launch', { endpoint: 'http://e', zeroCostMode: true });
    expect(answerOrPlan).toHaveBeenCalledWith('Research the launch', { source: 'schedule', endpoint: 'http://e', zeroCostMode: true, showPlanFirst: 'never', allowPaidModels: false });
  });

  it('a direct answer is done, with its first line as the summary', async () => {
    vi.mocked(answerOrPlan).mockResolvedValueOnce({ kind: 'answer', text: 'Note written.\nMore detail.' });
    expect(await runScheduledCommand('Write a note', {})).toEqual({ ok: true, summary: 'Note written.', details: 'Note written.\nMore detail.' });
  });

  it("a finished request gives its report and each agent's summary", async () => {
    vi.mocked(answerOrPlan).mockResolvedValueOnce({ kind: 'request', requestId: 'r', waitingForPlan: false, result: {
      ok: true, pendingApprovalCount: 0,
      command: { userReport: { summary: 'Done.', assignmentSummaries: [{ agent: 'hector', reportSummary: '3 sources' }, { agent: 'miya' }] } },
    } });
    expect(await runScheduledCommand('x', {})).toEqual({ ok: true, summary: 'Done.', details: 'hector: 3 sources', pendingApprovalCount: 0, error: undefined });
  });

  it('a step waiting for approval is reported as waiting', async () => {
    vi.mocked(answerOrPlan).mockResolvedValueOnce({ kind: 'request', requestId: 'r', waitingForPlan: false, result: { ok: true, pendingApprovalCount: 2, command: { userReport: { summary: 'Waiting.' } } } });
    expect((await runScheduledCommand('x', {})).pendingApprovalCount).toBe(2);
  });

  it('a refused or failed request is not ok and says why', async () => {
    vi.mocked(answerOrPlan).mockResolvedValueOnce({ kind: 'request', requestId: null, waitingForPlan: false, result: { ok: false, reason: 'plan_rejected', problems: ['x'] } });
    expect(await runScheduledCommand('x', {})).toMatchObject({ ok: false, error: "Jose couldn't run it: x" });
  });
});
