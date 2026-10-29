// Agent phase 5: Marcus's step. Readiness checks read and ask nothing; a send step sends the
// preview prepared before you approved it; the record says who approved and who reviewed it.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../services/marcus/runSend', () => ({ runMarcusSend: vi.fn(), ALREADY_SENT: 'Already sent.' }));
vi.mock('../../../services/marcus/prepareSend', async (orig) => ({ ...(await orig() as object), prepareMarcusSend: vi.fn() }));
vi.mock('../../../services/marcus/readiness', () => ({ checkReadiness: vi.fn() }));
vi.mock('../../../services/memoryService', () => ({ pushMemoryItem: vi.fn() }));
vi.mock('../../../services/contentFactory/postMetrics', () => ({ readDueMetrics: vi.fn(async () => 0) }));

import { runMarcusSend } from '../../../services/marcus/runSend';
import { prepareMarcusSend } from '../../../services/marcus/prepareSend';
import { checkReadiness } from '../../../services/marcus/readiness';
import { pushMemoryItem } from '../../../services/memoryService';
import { createJoseRequest, updateJoseStep } from '../../../services/jose/joseRequestStore';
import { runMarcusDistribution } from '../../../services/marcusExecutionService';

const PREVIEW = { connector: 'slack', target: '#news', kind: 'message', label: 'Slack #news', text: 'Open Saturday. sk-live-1234abcd5678efgh', sourceStepId: 'write', preparedAtMs: 1 };
const send = { stepId: 'marcus', agent: 'marcus', actionType: 'distribution_execution', effects: ['publish_or_send'], needs: ['write', 'sentinel-send-marcus'] };

function request(withPreview = true) {
  createJoseRequest({ commandId: 'm1', source: 'user', text: '/jose post it to Slack #news', kind: 'normal', steps: [
    { stepId: 'write', agent: 'alphonso', actionType: 'assistant_write', effects: ['write_own_work'], needs: [] },
    { stepId: 'sentinel-send-marcus', agent: 'sentinel', actionType: 'security_review', effects: ['read'], needs: ['write'], reviewOf: 'write' },
    { stepId: 'check', agent: 'maria', actionType: 'audit_quality', effects: ['read'], needs: ['write'], reviewOf: 'write' },
    send,
  ] as never });
  updateJoseStep('jose-request-m1', 'sentinel-send-marcus', { status: 'done' });
  updateJoseStep('jose-request-m1', 'check', { status: 'done' });
  if (withPreview) updateJoseStep('jose-request-m1', 'marcus', { sendPreview: PREVIEW as never });
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('runMarcusDistribution', () => {
  it('distribution_readiness and distribution_review run the check, read only', async () => {
    vi.mocked(checkReadiness).mockResolvedValue({ ready: false, text: 'Not ready:\n- Nobody reviewed it yet.' });
    for (const actionType of ['distribution_readiness', 'distribution_review']) {
      const r = await runMarcusDistribution('x', { ...send, actionType, effects: ['read'] } as never, null, { commandId: 'm1' });
      expect(r).toMatchObject({ summary: 'Not ready:\n- Nobody reviewed it yet.', resultState: 'completed', schema: { kind: 'send', status: 'checked', reviewVerdict: 'pass' } });
    }
    expect(runMarcusSend).not.toHaveBeenCalled();
  });

  it('a send step sends the saved preview', async () => {
    request();
    vi.mocked(runMarcusSend).mockResolvedValue({ ok: true, sentence: 'Sent to Slack #news.', link: null, platformId: '1.2' });
    const r = await runMarcusDistribution('x', send as never, null, { commandId: 'm1' });
    expect(runMarcusSend).toHaveBeenCalledWith('m1', 'marcus', PREVIEW);
    expect(prepareMarcusSend).not.toHaveBeenCalled();
    expect(r.summary).toBe('Maria reviewed it. Sentinel checked it. Sent to Slack #news.');
    expect(r.resultState).toBe('completed');
  });

  it('no preview → prepares, then sends (callers outside the gate)', async () => {
    request(false);
    vi.mocked(prepareMarcusSend).mockResolvedValue({ ok: true, preview: PREVIEW as never });
    vi.mocked(runMarcusSend).mockResolvedValue({ ok: true, sentence: 'Sent to Slack #news.' });
    await runMarcusDistribution('x', send as never, null, { commandId: 'm1' });
    expect(prepareMarcusSend).toHaveBeenCalled();
    expect(runMarcusSend).toHaveBeenCalledWith('m1', 'marcus', PREVIEW);
  });

  it('a preparation problem: setup waits, fix asks the writer, nothing sent', async () => {
    request(false);
    vi.mocked(prepareMarcusSend).mockResolvedValueOnce({ ok: false, outcome: 'setup', reason: "Slack isn't set up." });
    expect(await runMarcusDistribution('x', send as never, null, { commandId: 'm1' })).toMatchObject({ resultState: 'setup_required', summary: "Slack isn't set up." });
    vi.mocked(prepareMarcusSend).mockResolvedValueOnce({ ok: false, outcome: 'fix', reason: 'Too long.', sourceStepId: 'write' });
    expect(await runMarcusDistribution('x', send as never, null, { commandId: 'm1' })).toMatchObject({ resultState: 'completed', schema: { reviewVerdict: 'fix', findings: ['Too long.'] } });
    vi.mocked(prepareMarcusSend).mockResolvedValueOnce({ ok: false, outcome: 'failed', reason: 'Nothing to send.' });
    expect(await runMarcusDistribution('x', send as never, null, { commandId: 'm1' })).toMatchObject({ resultState: 'failed', summary: 'Nothing to send.' });
    expect(runMarcusSend).not.toHaveBeenCalled();
  });

  it('the record: approvedBy you, reviewedBy the Maria and Sentinel steps, verified only when sent', async () => {
    request();
    vi.mocked(runMarcusSend).mockResolvedValueOnce({ ok: true, sentence: 'Sent to Slack #news.', platformId: '1.2' });
    const sent = await runMarcusDistribution('x', send as never, null, { commandId: 'm1' });
    expect(sent.schema).toMatchObject({ kind: 'send', connector: 'slack', target: '#news', sendKind: 'message', status: 'sent', approvedBy: 'you', reviewedBy: ['sentinel-send-marcus', 'check'], confidenceLevel: 'verified', platformId: '1.2' });
    vi.mocked(runMarcusSend).mockResolvedValueOnce({ ok: false, sentence: 'Not sent to Slack #news: channel_not_found.' });
    const failed = await runMarcusDistribution('x', send as never, null, { commandId: 'm1' });
    // QA batch 1 (owner, 2026-10-28): a failed send waits with the platform's reason; Carry on sends it again.
    expect(failed.resultState).toBe('setup_required');
    expect(failed.summary).toBe('Not sent to Slack #news: channel_not_found. When that is fixed, Carry on sends it again.');
    expect(failed.schema).toMatchObject({ status: 'failed', confidenceLevel: 'failed' });
  });

  it('one memory item, keys hidden', async () => {
    request();
    vi.mocked(runMarcusSend).mockResolvedValue({ ok: true, sentence: 'Sent to Slack #news.' });
    await runMarcusDistribution('x', send as never, null, { commandId: 'm1' });
    expect(pushMemoryItem).toHaveBeenCalledTimes(1);
    const item = vi.mocked(pushMemoryItem).mock.calls[0][0] as { title: string };
    expect(item.title).toBe('Marcus: sent to Slack #news — Open Saturday. [hidden key, ends …efgh]');
    expect(JSON.stringify(vi.mocked(pushMemoryItem).mock.calls)).not.toContain('sk-live-1234abcd5678efgh');
  });

});
