import { describe, it, expect, vi, beforeEach } from 'vitest';

let request: any;
const updates: any[] = [];
const notes: string[] = [];
vi.mock('../../../services/jose/joseRequestStore', () => ({
  getJoseRequest: () => request,
  updateJoseStep: (_id: string, stepId: string, patch: any) => {
    updates.push({ stepId, patch });
    const step = request.steps.find((s: any) => s.stepId === stepId);
    Object.assign(step, patch);
    return request;
  },
  appendRequestNote: (_id: string, text: string) => { notes.push(text); return request; },
}));
const resumeJoseRequest = vi.fn(async () => ({ ok: true }));
vi.mock('../../../services/joseExecutionEngineService', () => ({ resumeJoseRequest: (...a: unknown[]) => resumeJoseRequest(...(a as [])) }));

import { sendBackStep, sentBackChange, SEND_BACK_NOT_HERE } from '../../../services/jose/sendBackStep';

function makeRequest() {
  return {
    id: 'r1', status: 'waiting_approval',
    steps: [
      { stepId: 'alphonso', agent: 'alphonso', actionType: 'assistant_write', effects: ['write_own_work'], needs: [], instruction: 'Write the note', status: 'done' },
      { stepId: 'marcus', agent: 'marcus', actionType: 'distribution_slack', effects: ['publish_or_send'], needs: ['alphonso'], status: 'waiting_approval',
        sendPreview: { connector: 'slack', kind: 'message', label: 'Slack #news', target: '#news', text: 'Old text', sourceStepId: 'alphonso', preparedAtMs: 1 } },
    ],
  };
}

beforeEach(() => { request = makeRequest(); updates.length = 0; notes.length = 0; resumeJoseRequest.mockClear(); });

describe('Send back a waiting send', () => {
  it('remembers the reason, clears the prepared text and carries the request on', async () => {
    const r = await sendBackStep('r1', 'marcus', '  Make it shorter ');
    expect(r.ok).toBe(true);
    const marcus = request.steps[1];
    expect(marcus.sentBack).toEqual({ workStepId: 'alphonso', reason: 'Make it shorter', atMs: expect.any(Number) });
    expect(marcus.sendPreview).toBeUndefined();
    expect(notes[0]).toBe("You sent Alphonso's work back: Make it shorter");
    expect(resumeJoseRequest).toHaveBeenCalledWith('r1');
  });

  it("the send waits for a fix step with the reason, as the review loop's fix rounds do", () => {
    const change = sentBackChange(request.steps, { stepId: 'marcus', sentBack: { workStepId: 'alphonso', reason: 'Make it shorter', atMs: 1 } } as any);
    expect(change).not.toBeNull();
    expect(change!.add).toEqual([expect.objectContaining({
      stepId: 'alphonso-fix-1', agent: 'alphonso', actionType: 'assistant_write', effects: ['write_own_work'], needs: ['alphonso'], revises: 'alphonso', round: 1,
    })]);
    expect(change!.add[0].instruction).toContain('Fix what you were asked: Make it shorter');
    expect(change!.rewire).toEqual({ from: ['alphonso'], to: ['alphonso-fix-1'] });
  });

  it('a second send back fixes the newest version', () => {
    request.steps.splice(1, 0, { stepId: 'alphonso-fix-1', agent: 'alphonso', actionType: 'assistant_write', effects: ['write_own_work'], needs: ['alphonso'], revises: 'alphonso', round: 1, status: 'done' });
    const change = sentBackChange(request.steps, { stepId: 'marcus', sentBack: { workStepId: 'alphonso-fix-1', reason: 'Friendlier', atMs: 1 } } as any);
    expect(change!.add[0]).toMatchObject({ stepId: 'alphonso-fix-2', needs: ['alphonso-fix-1'], revises: 'alphonso', round: 2 });
  });

  it('past the rounds is refused with the reason', async () => {
    request.steps.splice(1, 0,
      { stepId: 'alphonso-fix-1', agent: 'alphonso', revises: 'alphonso', round: 1, needs: ['alphonso'], effects: [], status: 'done' },
      { stepId: 'alphonso-fix-2', agent: 'alphonso', revises: 'alphonso', round: 2, needs: ['alphonso-fix-1'], effects: [], status: 'done' });
    request.steps[3].sendPreview.sourceStepId = 'alphonso-fix-2';
    const r = await sendBackStep('r1', 'marcus', 'Again');
    expect(r).toEqual({ ok: false, summary: "It was already redone 2 times. Edit the text yourself, or approve or reject it." });
    expect(resumeJoseRequest).not.toHaveBeenCalled();
  });

  it('a step whose text no agent wrote has nothing to send back', async () => {
    request.steps[1].sendPreview.sourceStepId = null;
    expect(await sendBackStep('r1', 'marcus', 'x')).toEqual({ ok: false, summary: SEND_BACK_NOT_HERE });
    request = makeRequest();
    request.steps[1].status = 'done';
    expect((await sendBackStep('r1', 'marcus', 'x')).ok).toBe(false);
    request = makeRequest();
    expect((await sendBackStep('r1', 'marcus', '   ')).ok).toBe(false);
  });
});
