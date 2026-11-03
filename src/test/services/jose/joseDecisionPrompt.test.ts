// Phone phase 4: Jose's answer-or-plan prompt and reading his answer, shared by the computer and the phone.
import { describe, expect, it } from 'vitest';
import { joseDecisionPrompt, readJoseDecision } from '../../../services/jose/joseDecision';

describe("Jose's decision prompt", () => {
  it('names the message and asks for JSON only', () => {
    const prompt = joseDecisionPrompt('hi');
    expect(prompt).toContain('Message: hi');
    expect(prompt).toContain('Answer with JSON only');
  });

  it('includes the recent conversation when given', () => {
    expect(joseDecisionPrompt('and then?', [{ role: 'user', content: 'tell me about bees' }])).toContain('user: tell me about bees');
  });

  it('reads an answer wrapped in a code fence', () => {
    expect(readJoseDecision('```json\n{"route":"plan","reason":"x"}\n```')).toEqual({ route: 'plan', reason: 'x' });
  });

  it('reads nothing from an answer without a route', () => {
    expect(readJoseDecision('sure, I can help')).toBeNull();
    expect(readJoseDecision('{"route":"maybe"}')).toBeNull();
  });
});
