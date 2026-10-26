// Agent phase 4: /scan, the sidebar's Re-scan and the daily schedule ask Sentinel for one real
// review of the week, as a request.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const submit = vi.fn();
vi.mock('../../../services/jose/submitToJose', () => ({ submitStepsToJose: (...a: unknown[]) => submit(...a) }));

import { askSentinelWeekReview, lastSentinelReview, SENTINEL_WEEKLY_LABEL } from '../../../services/sentinel/sentinelWeekly';
import { createJoseRequest } from '../../../services/jose/joseRequestStore';
import { setStepOutput } from '../../../services/jose/joseStepOutputs';

beforeEach(() => { submit.mockReset(); localStorage.clear(); });

describe('askSentinelWeekReview', () => {
  it('asks one Sentinel step through Jose, keys hidden', async () => {
    submit.mockResolvedValueOnce({ ok: true, requestId: 'jose-request-c1', userReport: { summary: 'Safe.' } });
    await askSentinelWeekReview('- alphonso: used sk-live-1234abcd5678efgh', { source: 'schedule' });
    const call = submit.mock.calls[0][0];
    expect(SENTINEL_WEEKLY_LABEL).toBe("Asked by Sentinel's review of the week.");
    expect(call).toMatchObject({ source: 'schedule', allowPaidModels: false, label: SENTINEL_WEEKLY_LABEL });
    expect(call.steps).toEqual([expect.objectContaining({ stepId: 'sentinel', agent: 'sentinel', actionType: 'security_review', effects: ['read'], needs: [] })]);
    expect(call.text).toContain('[hidden key, ends …efgh]');
    expect(call.text).not.toContain('sk-live-1234abcd5678efgh');
  });

  it('maps the result', async () => {
    submit.mockResolvedValueOnce({ ok: true, requestId: 'jose-request-c1', userReport: { summary: 'Risky: one link.' } });
    expect(await askSentinelWeekReview('w')).toEqual({ state: 'done', summary: 'Risky: one link.', requestId: 'jose-request-c1' });
    submit.mockResolvedValueOnce({ ok: false, reason: 'plan_rejected' });
    expect(await askSentinelWeekReview('w')).toMatchObject({ state: 'failed', summary: 'plan_rejected' });
  });
});

describe('lastSentinelReview', () => {
  it('reads the newest weekly review from its request', () => {
    expect(lastSentinelReview()).toBeNull();
    createJoseRequest({ commandId: 'c1', source: 'user', text: 'week', kind: 'normal', plan: { source: 'given', templateId: null, note: SENTINEL_WEEKLY_LABEL }, steps: [{ stepId: 'sentinel', agent: 'sentinel', actionType: 'security_review', effects: ['read'], needs: [] }] } as never);
    setStepOutput('c1', 'sentinel', 'sentinel', { summary: 'Risky:', schema: { kind: 'security', verdict: 'risky', findings: ['x: y → z'] } });
    expect(lastSentinelReview()).toMatchObject({ requestId: 'jose-request-c1', verdict: 'risky', findings: ['x: y → z'] });
  });
});
