import { describe, it, expect, vi, beforeEach } from 'vitest';

let request: any;
const notes: string[] = [];
vi.mock('../../../services/jose/joseRequestStore', () => ({
  getJoseRequest: () => request,
  updateJoseStep: (_id: string, stepId: string, patch: any) => {
    Object.assign(request.steps.find((s: any) => s.stepId === stepId), patch);
    return request;
  },
  appendRequestNote: (_id: string, text: string) => { notes.push(text); return request; },
}));

import { editSendText, SEND_TEXT_CHANGED } from '../../../services/marcus/editSendText';

function makeRequest(connector = 'slack') {
  return {
    id: 'r1', status: 'waiting_approval',
    steps: [{ stepId: 'marcus', agent: 'marcus', status: 'waiting_approval',
      sendPreview: { connector, kind: 'message', label: 'Slack #news', target: '#news', text: 'Old text', sourceStepId: 'alphonso', preparedAtMs: 1 } }],
  };
}

beforeEach(() => { request = makeRequest(); notes.length = 0; });

describe("editing the text Marcus sends", () => {
  it('saves exactly what you wrote, marked as yours', () => {
    const r = editSendText('r1', 'marcus', 'New text, all mine.', 'Old text');
    expect(r.ok).toBe(true);
    expect(request.steps[0].sendPreview).toMatchObject({ text: 'New text, all mine.', editedByYou: true, target: '#news' });
    expect(notes[0]).toBe('You changed the text Marcus sends.');
  });

  it('an edit based on an old text is refused with the latest', () => {
    request.steps[0].sendPreview.text = 'Changed on the computer';
    const r: any = editSendText('r1', 'marcus', 'Mine', 'Old text');
    expect(r).toMatchObject({ ok: false, reason: SEND_TEXT_CHANGED });
    expect(r.latest.text).toBe('Changed on the computer');
    expect(SEND_TEXT_CHANGED).toBe("This changed on your computer; here's the latest.");
  });

  it('an edited send keeps the checks (a gap like [Your Name] is refused)', () => {
    const r: any = editSendText('r1', 'marcus', 'Thanks, [Your Name]', 'Old text');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('[Your Name]');
    expect(request.steps[0].sendPreview.text).toBe('Old text');
  });

  it("text too long for the channel is refused", () => {
    request = makeRequest('discord');
    const r: any = editSendText('r1', 'marcus', 'x'.repeat(2001), 'Old text');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('Too long for Slack #news: 2,001 characters; the limit is 2,000.');
  });

  it('only while the send waits, and not empty', () => {
    expect(editSendText('r1', 'marcus', '  ', 'Old text').ok).toBe(false);
    request.steps[0].status = 'done';
    expect(editSendText('r1', 'marcus', 'New', 'Old text').ok).toBe(false);
  });
});
