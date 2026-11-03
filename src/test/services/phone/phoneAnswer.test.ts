// Phone phase 4: answering on the phone with Alphonso's own prompt and Echo's mirrored decisions.
import { describe, expect, it, vi } from 'vitest';
import { answerOnPhone, ENGINE_LABEL } from '../../../services/phone/phoneAnswer';
import { NEEDS_COMPUTER } from '../../../services/phone/phoneRoute';
import { ALPHONSO_ANSWER_PROMPT } from '../../../services/alphonso/answerPrompt';
import type { Decision } from '../../../services/echo/decisions';

const d1: Decision = {
  id: 'd1', kind: 'decision', text: 'The spring launch is on Friday 14 March', why: 'the printer needs two weeks',
  topics: [], source: { surface: 'chat', by: 'echo' }, atMs: Date.parse('2026-10-20T12:00:00Z'), status: 'active',
};
const history = Array.from({ length: 8 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', text: `line ${i}` }));

describe('answerOnPhone', () => {
  it("answers with Alphonso's prompt, the saved decisions and the last 6 messages", async () => {
    const calls: Array<[string, string]> = [];
    const ask = vi.fn(async (system: string, prompt: string) => { calls.push([system, prompt]); return '  Friday 14 March, because the printer needs two weeks.  '; });
    const r = await answerOnPhone({ text: 'When is the spring launch?', history, decisions: [d1], ask });
    expect(r).toEqual({ kind: 'answer', text: 'Friday 14 March, because the printer needs two weeks.' });
    const [system, prompt] = calls[calls.length - 1];
    expect(system).toBe(ALPHONSO_ANSWER_PROMPT);
    expect(prompt).toContain('Decisions you saved:');
    expect(prompt).toContain('14 March');
    expect(prompt).toContain('user: line 2');
    expect(prompt).not.toContain('line 1\n');
    expect(prompt).toContain('User: When is the spring launch?');
  });

  it('leaves a send for the computer and never asks for an answer', async () => {
    const ask = vi.fn(async () => 'should not be used');
    expect(await answerOnPhone({ text: 'send Sam the notes', history: [], decisions: [], ask })).toEqual({ kind: 'computer', reason: NEEDS_COMPUTER });
    expect(ask).not.toHaveBeenCalled();
  });

  it('says so when no answer comes back, or the model fails', async () => {
    expect(await answerOnPhone({ text: 'How many minutes is 2.5 hours?', history: [], decisions: [], ask: async () => '  ' })).toEqual({ kind: 'failed', reason: 'No answer came back.' });
    expect(await answerOnPhone({ text: 'How many minutes is 2.5 hours?', history: [], decisions: [], ask: async () => { throw new Error('No answer after 120 seconds (timed out).'); } }))
      .toEqual({ kind: 'failed', reason: 'No answer after 120 seconds (timed out).' });
  });

  it('names where each answer came from', () => {
    expect(ENGINE_LABEL).toEqual({ phone: 'Answered on this phone', openrouter: 'Answered with OpenRouter (free)' });
  });
});
