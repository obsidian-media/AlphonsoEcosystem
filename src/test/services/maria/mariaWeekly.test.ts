// The weekly Maria schedule (agent phase 3): one Maria review of the week's risks, as a request.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const submit = vi.fn();
vi.mock('../../../services/jose/submitToJose', () => ({ submitStepsToJose: (...a: unknown[]) => submit(...a) }));
vi.mock('../../../services/jose/joseRequestStore', () => ({
  listJoseRequests: () => [
    { id: 'r1', text: 'Post the launch video', status: 'waiting_approval', updatedAtMs: Date.now() },
    { id: 'r2', text: 'Old done thing', status: 'done', updatedAtMs: Date.now() },
    { id: 'r3', text: 'Send the newsletter', status: 'failed', updatedAtMs: Date.now() },
    { id: 'r4', text: 'Ancient failure', status: 'failed', updatedAtMs: Date.now() - 30 * 86400000 },
  ],
}));

import { askMariaWeeklyRisks, MARIA_WEEKLY_LABEL } from '../../../services/maria/mariaWeekly';

beforeEach(() => submit.mockReset());

describe('askMariaWeeklyRisks', () => {
  it('asks one Maria step through Jose', async () => {
    submit.mockResolvedValueOnce({ ok: true, userReport: { summary: 'Risk: medium.' } });
    await askMariaWeeklyRisks('- marcus: sent a post');
    const call = submit.mock.calls[0][0];
    expect(MARIA_WEEKLY_LABEL).toBe('Asked by the weekly Maria schedule.');
    expect(call).toMatchObject({ source: 'schedule', allowPaidModels: false, label: MARIA_WEEKLY_LABEL });
    expect(call.steps).toEqual([expect.objectContaining({ stepId: 'maria', agent: 'maria', actionType: 'governance_audit', effects: ['read'], needs: [] })]);
    expect(call.text).toContain('- marcus: sent a post');
    expect(call.text).toContain('Send the newsletter');
    expect(call.text).toContain('Post the launch video');
    expect(call.text).not.toContain('Old done thing');
    expect(call.text).not.toContain('Ancient failure');
  });

  it('maps the result', async () => {
    submit.mockResolvedValueOnce({ ok: true, userReport: { summary: 'Risk: low.' } });
    expect(await askMariaWeeklyRisks('w')).toEqual({ state: 'done', summary: 'Risk: low.' });
    submit.mockResolvedValueOnce({ ok: false, reason: 'plan_rejected' });
    expect(await askMariaWeeklyRisks('w')).toEqual({ state: 'failed', summary: 'plan_rejected' });
  });
});
