// The daily Nova schedule (agent phase 2): a one-step request asking her what to do next.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const submit = vi.fn();
vi.mock('../../../services/jose/submitToJose', () => ({ submitStepsToJose: (...a: unknown[]) => submit(...a) }));
vi.mock('../../../services/jose/joseRequestStore', () => ({
  listJoseRequests: () => [
    { id: 'r1', text: 'Post the launch video', status: 'waiting_approval' },
    { id: 'r2', text: 'Old done thing', status: 'done' },
    { id: 'r3', text: 'Set up Slack', status: 'waiting_setup' },
  ],
}));

import { askNovaWhatNext, NOVA_DAILY_LABEL } from '../../../services/nova/novaDaily';

beforeEach(() => submit.mockReset());

describe('askNovaWhatNext', () => {
  it('asks one Nova step through Jose', async () => {
    submit.mockResolvedValueOnce({ ok: true, userReport: { summary: 'Nova: What to do first: approve the launch video.' } });
    await askNovaWhatNext('- jose: wrote a report');
    const call = submit.mock.calls[0][0];
    expect(call).toMatchObject({ source: 'schedule', allowPaidModels: false, label: NOVA_DAILY_LABEL });
    expect(call.steps).toEqual([expect.objectContaining({ stepId: 'nova', agent: 'nova', actionType: 'analysis_findings', effects: ['read'], needs: [] })]);
    expect(call.text).toContain('- jose: wrote a report');
    expect(call.text).toContain('Still waiting:');
    expect(call.text).toContain('Post the launch video');
    expect(call.text).toContain('Set up Slack');
    expect(call.text).not.toContain('Old done thing');
  });

  it('maps the result', async () => {
    submit.mockResolvedValueOnce({ ok: true, userReport: { summary: 'Nova: What to do first: approve the launch video.' } });
    expect(await askNovaWhatNext('w')).toEqual({ state: 'done', summary: 'Nova: What to do first: approve the launch video.' });
    submit.mockResolvedValueOnce({ ok: false, reason: 'plan_rejected' });
    expect(await askNovaWhatNext('w')).toEqual({ state: 'failed', summary: 'plan_rejected' });
  });
});
