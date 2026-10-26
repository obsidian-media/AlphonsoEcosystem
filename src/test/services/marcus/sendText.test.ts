// Agent phase 5: what Marcus sends. Never his own words: text handed to him, the writer's
// work, or the one piece your request quotes.
import { describe, it, expect } from 'vitest';
import { textToSend, NOTHING_TO_SEND } from '../../../services/marcus/sendText';

const need = (stepId: string, agent: string, main: string, extra: Record<string, unknown> = {}) =>
  ({ stepId, agent, text: main, main, files: [], sources: [], cut: 0, ...extra });
const input = (needs: unknown[], request = '/jose post it to Slack #news') =>
  ({ instruction: '', request, needs, others: [], memory: '', review: null }) as never;

describe('textToSend', () => {
  it('payload text first', () => {
    expect(textToSend({ payload: { text: 'Hi' } }, input([need('write', 'alphonso', 'Other')]))).toEqual({ text: 'Hi', sourceStepId: null });
  });

  it("the writer's work, never Sentinel's or Maria's verdict", () => {
    const got = textToSend({}, input([need('write', 'alphonso', 'Open Saturday.'), need('sentinel-send-marcus', 'sentinel', 'Safe.'), need('check', 'maria', 'Pass.')]));
    expect(got).toEqual({ text: 'Open Saturday.', sourceStepId: 'write' });
  });

  it('the latest revision after a fix round', () => {
    const got = textToSend({}, input([need('write', 'alphonso', 'Too long…'), need('write-fix-1', 'alphonso', 'Short.')]));
    expect(got).toEqual({ text: 'Short.', sourceStepId: 'write-fix-1' });
  });

  it('a failed step is not work to send', () => {
    expect(textToSend({}, input([need('write', 'alphonso', 'The model was not reachable.', { failed: true })]))).toBeNull();
  });

  it('one quoted piece of the request', () => {
    expect(textToSend({}, input([], 'tell my team on Telegram "meeting at 3pm"'))).toEqual({ text: 'meeting at 3pm', sourceStepId: null });
    expect(textToSend({}, input([], 'send "a" or "b" to Slack'))).toBeNull();
  });

  it('nothing → null, and the sentence', () => {
    expect(textToSend({}, input([]))).toBeNull();
    expect(NOTHING_TO_SEND).toBe('Nothing to send: no earlier step wrote the text.');
  });
});
