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

  it('plans an explicit Jose request without asking the model', async () => {
    expect(await decideJoseRoute('/jose research the market')).toMatchObject({ route: 'plan', source: 'rule' });
    expect(llm).not.toHaveBeenCalled();
  });

  // Agent phase 7: remembering and forgetting are Echo's work, so they are planned.
  it('plans remember, forget and clean up without asking the model', async () => {
    for (const text of ['Remember that our launch is on Friday the 14th.', 'Can you forget the launch decision?', 'Clean up my memory']) {
      expect(await decideJoseRoute(text)).toMatchObject({ route: 'plan', source: 'rule' });
    }
    expect(llm).not.toHaveBeenCalled();
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
