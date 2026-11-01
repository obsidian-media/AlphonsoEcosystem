import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../lib/ollama', () => ({
  generateAgentLlmResponse: vi.fn(),
}));

import { generateAgentLlmResponse } from '../../../lib/ollama';
import { decideJoseRoute, DECISION_TIMEOUT_MS } from '../../../services/jose/joseDecision';
import { isPlainQuestion } from '../../../lib/chatUtils';

const llm = vi.mocked(generateAgentLlmResponse);
const says = (route: string) => ({ response: JSON.stringify({ route, reason: 'because' }) }) as never;

beforeEach(() => llm.mockReset());
afterEach(() => vi.useRealTimers());

describe('decideJoseRoute: answer directly or plan', () => {
  it('answers a plain question directly without asking the model', async () => {
    expect(await decideJoseRoute('What is 2 + 2? Reply with just the number.')).toMatchObject({ route: 'direct', source: 'rule' });
    expect(llm).not.toHaveBeenCalled();
  });

  // 2.11.0 QA (owner, 2026-11-01): "research the latest trends in AI agents" was answered from a
  // small model's memory, with no sources. Asking for research is Hector's work, whatever the model says.
  it('plans a request for research without asking the model, also when phrased as a question', async () => {
    for (const text of [
      'research the latest trends in AI agents',
      'Please look up the current price of a Raspberry Pi 5',
      'Can you research what changed in Tailwind v4?',
      'find out who makes the best budget drones',
      'Give me the news on electric cars, with sources',
    ]) {
      expect(await decideJoseRoute(text), text).toMatchObject({ route: 'plan', source: 'rule' });
    }
    expect(llm).not.toHaveBeenCalled();
  });

  it('still answers a question about research itself directly', async () => {
    expect(await decideJoseRoute('What is research?')).toMatchObject({ route: 'direct', source: 'rule' });
  });

  it('plans an explicit Jose request without asking the model', async () => {
    expect(await decideJoseRoute('/jose research the market')).toMatchObject({ route: 'plan', source: 'rule' });
    expect(llm).not.toHaveBeenCalled();
  });

  // Agent phase 7: remembering and forgetting are Echo's work, so they are planned.
  // Agent roles Part C1: a team asked for by name is planned by rule.
  it('plans a team request without asking the model', async () => {
    expect(await decideJoseRoute('use team Launch to post the news')).toMatchObject({ route: 'plan', source: 'rule' });
    expect(await decideJoseRoute('/team Launch post the news')).toMatchObject({ route: 'plan', source: 'rule' });
    expect(llm).not.toHaveBeenCalled();
  });

  it('plans remember, forget and clean up without asking the model', async () => {
    for (const text of ['Remember that our launch is on Friday the 14th.', 'Can you forget the launch decision?', 'Clean up my memory']) {
      expect(await decideJoseRoute(text)).toMatchObject({ route: 'plan', source: 'rule' });
    }
    expect(llm).not.toHaveBeenCalled();
  });

  // QA batch 0 (CI, 2026-10-27): a small model answered "research …, write …, and have it
  // checked" in one reply. Two or more kinds of work can't be one reply: planned by rule.
  it('plans a message asking for two or more kinds of work without asking the model', async () => {
    for (const text of [
      'Research three facts about honeybees, write a short post about them, and have the post checked for accuracy. Do not send it anywhere.',
      'Write a note that we open at 9 and post it to Slack #news',
    ]) {
      expect(await decideJoseRoute(text)).toMatchObject({ route: 'plan', source: 'rule' });
    }
    expect(llm).not.toHaveBeenCalled();
    llm.mockResolvedValueOnce(says('direct'));
    expect(await decideJoseRoute('Write a short poem about the sea')).toMatchObject({ source: 'model' });
  });

  it("tells Jose's model that remember, forget and clean up are planned", async () => {
    llm.mockResolvedValueOnce(says('plan'));
    await decideJoseRoute('Our launch is on Friday the 14th, keep that for later.');
    expect(String((llm.mock.calls[0][1] as any).prompt)).toContain('Plan when the message asks to remember or forget something, or to clean up memory: Echo does that.');
  });

  it('lets the model decide everything else', async () => {
    llm.mockResolvedValueOnce(says('plan'));
    expect(await decideJoseRoute('Make a launch video for my app')).toMatchObject({ route: 'plan', source: 'model' });
    llm.mockResolvedValueOnce(says('direct'));
    expect(await decideJoseRoute('Thanks, that helps')).toMatchObject({ route: 'direct', source: 'model' });
  });

  it('falls back to the word rule when the model fails or answers nonsense', async () => {
    llm.mockRejectedValueOnce(new Error('down'));
    expect(await decideJoseRoute('build a landing page for my bakery')).toMatchObject({ route: 'plan', source: 'fallback' });
    llm.mockResolvedValueOnce({ response: 'sure!' } as never);
    expect(await decideJoseRoute('Thanks, that helps')).toMatchObject({ route: 'direct', source: 'fallback' });
  });

  it('does not wait for a model that never answers', async () => {
    vi.useFakeTimers();
    llm.mockImplementationOnce(() => new Promise(() => {}) as never);
    const pending = decideJoseRoute('build a landing page for my bakery');
    await vi.advanceTimersByTimeAsync(DECISION_TIMEOUT_MS);
    expect(await pending).toMatchObject({ route: 'plan', source: 'fallback' });
  });
});

describe('isPlainQuestion', () => {
  it('spots questions, but not image requests phrased as questions', () => {
    expect(isPlainQuestion('Why is the sky blue')).toBe(true);
    expect(isPlainQuestion('Is this ready?')).toBe(true);
    expect(isPlainQuestion('Can you make an image of a cat?')).toBe(false);
    expect(isPlainQuestion('Build a web app')).toBe(false);
  });
});
