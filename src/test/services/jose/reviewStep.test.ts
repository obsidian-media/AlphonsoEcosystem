// Reviewers judge the draft and give the verdict in one answer (agent roles Part A).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const llm = vi.fn();
vi.mock('../../../lib/ollama', () => ({ generateAgentLlmResponse: (...args: unknown[]) => llm(...args) }));

import { runReviewStep } from '../../../services/jose/reviewStep';
import { judgeReview } from '../../../services/jose/joseReviewLoop';
import type { StepInput } from '../../../services/jose/stepInput';

const input = (reviewText: string | null): StepInput => ({
  instruction: 'Check the post against the sources.',
  request: 'Write a post about bees and have it checked',
  needs: [],
  others: [],
  memory: '',
  review: reviewText === null ? null : { stepId: 'miya', agent: 'miya', text: reviewText, files: [], sources: [], cut: 0, main: reviewText },
});

describe('runReviewStep', () => {
  beforeEach(() => llm.mockReset());

  it('puts the draft in the prompt and returns the verdict with the review', async () => {
    llm.mockResolvedValue({ response: '{"review":"The third claim has no source.","verdict":"fix","findings":["Add a source for the third claim"]}' });
    const result = await runReviewStep('maria', input('Bees make honey. Bees pollinate. Bees live 50 years.'), 'audit_quality');
    expect(llm.mock.calls[0][0]).toBe('maria');
    expect(llm.mock.calls[0][1].prompt).toContain('Bees live 50 years.');
    expect(result.resultState).toBe('completed');
    expect(result.summary).toBe('The third claim has no source.');
    expect(result.schema).toEqual({ verdict: 'fix', findings: ['Add a source for the third claim'] });
  });

  it('fails when the reviewed step saved no work', async () => {
    const result = await runReviewStep('maria', input(null), 'audit_quality');
    expect(result.resultState).toBe('failed');
    expect(result.summary).toBe("Nothing to review: the step to review saved no work.");
    const empty = await runReviewStep('maria', input('   '), 'audit_quality');
    expect(empty.summary).toBe("Nothing to review: Miya's step saved no work.");
    expect(llm).not.toHaveBeenCalled();
  });

  it('keeps the review text when the answer is not JSON', async () => {
    llm.mockResolvedValue({ response: 'Looks good to me overall.' });
    const result = await runReviewStep('nova', input('Draft'), 'analysis_findings');
    expect(result.summary).toBe('Looks good to me overall.');
    expect(result.schema?.verdict).toBeUndefined();
  });
});

describe('judgeReview reads the verdict the review already gave', () => {
  beforeEach(() => llm.mockReset());

  it('uses the saved verdict without asking the model again', async () => {
    const judged = await judgeReview({ stepId: 'maria', agent: 'maria', actionType: 'audit_quality', needs: ['miya'], effects: ['read'] } as any,
      { summary: 'Missing a source.', schema: { verdict: 'fix', findings: ['Add a source'] } });
    expect(judged).toEqual({ verdict: 'fix', findings: ['Add a source'] });
    expect(llm).not.toHaveBeenCalled();
  });
});
