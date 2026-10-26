import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../lib/ollama', () => ({
  generateAgentLlmResponse: vi.fn(),
}));

import { generateAgentLlmResponse } from '../../../lib/ollama';
import { judgeReview, planReviewRound } from '../../../services/jose/joseReviewLoop';
import type { PlanStep } from '../../../services/jose/stepGraph';

const llm = vi.mocked(generateAgentLlmResponse);

const plan: PlanStep[] = [
  { stepId: 'script', agent: 'miya', actionType: 'creative_script', effects: ['write_own_work'], needs: [], instruction: 'Write the script.' },
  { stepId: 'review_value', agent: 'nova', actionType: 'analysis_content_review', effects: ['read'], needs: ['script'], reviewOf: 'script', instruction: 'Review the value.' },
  { stepId: 'review_quality', agent: 'maria', actionType: 'audit_content_quality', effects: ['read'], needs: ['script'], reviewOf: 'script', instruction: 'Check the quality.' },
  { stepId: 'campaign', agent: 'miya', actionType: 'creative_campaign', effects: ['write_own_work'], needs: ['review_value', 'review_quality'], instruction: 'Write the campaign.' },
];
const byId = (steps: PlanStep[], id: string) => steps.find((s) => s.stepId === id)!;
const judged = (ids: string[], verdicts: ('pass' | 'fix')[], steps = plan) =>
  ids.map((id, i) => ({ review: byId(steps, id), verdict: verdicts[i], findings: verdicts[i] === 'fix' ? [`${id} found a problem`] : [] }));

beforeEach(() => llm.mockReset());

describe('planReviewRound', () => {
  it('sends the work back once, with the findings, and re-reviews it', () => {
    const { changes, notes } = planReviewRound(plan, judged(['review_value', 'review_quality'], ['fix', 'pass']));
    expect(notes).toEqual([]);
    expect(changes).toHaveLength(1);
    const [change] = changes;
    const ids = change.add.map((s) => s.stepId);
    expect(ids).toEqual(['script-fix-1', 'review_value-r1', 'review_quality-r1']);
    const fix = change.add[0];
    expect(fix).toMatchObject({ agent: 'miya', actionType: 'creative_script', revises: 'script', round: 1, needs: ['script', 'review_value', 'review_quality'] });
    expect(fix.instruction).toMatch(/Write the script\.[\s\S]*Fix what the review found:[\s\S]*review_value found a problem/);
    expect(change.add[1]).toMatchObject({ agent: 'nova', reviewOf: 'script-fix-1', round: 1, needs: ['script-fix-1'] });
    // Later steps use the revised work and wait for its re-reviews.
    expect(change.rewire).toEqual({ from: ['script', 'review_value', 'review_quality'], to: ['script-fix-1', 'review_value-r1', 'review_quality-r1'] });
  });

  it('a revision and its re-reviews keep their content data (phase 6b)', () => {
    const withContent = plan.map((s) => ({ ...s, contentStep: { projectId: 'p1', step: s.stepId === 'script' ? 'script' : 'review' } as never }));
    const [change] = planReviewRound(withContent, judged(['review_value', 'review_quality'], ['fix', 'pass'], withContent)).changes;
    expect(change.add[0].contentStep).toEqual({ projectId: 'p1', step: 'script' });
    expect(change.add[1].contentStep).toEqual({ projectId: 'p1', step: 'review' });
    expect(change.add[2].contentStep).toEqual({ projectId: 'p1', step: 'review' });
  });

  it('changes nothing when every review passes', () => {
    expect(planReviewRound(plan, judged(['review_value', 'review_quality'], ['pass', 'pass']))).toEqual({ changes: [], notes: [] });
  });

  it('stops after 2 rounds and asks the user', () => {
    // Round 1 and round 2 both still say "fix".
    const round1 = planReviewRound(plan, judged(['review_value'], ['fix'])).changes[0].add;
    const afterRound1 = [...plan, ...round1];
    const round2 = planReviewRound(afterRound1, judged(['review_value-r1'], ['fix'], afterRound1)).changes[0].add;
    expect(round2.map((s) => s.stepId)).toEqual(['script-fix-2', 'review_value-r2']);
    expect(round2[0]).toMatchObject({ revises: 'script', round: 2, needs: ['script-fix-1', 'review_value-r1'] });
    const afterRound2 = [...afterRound1, ...round2];
    const third = planReviewRound(afterRound2, judged(['review_value-r2'], ['fix'], afterRound2));
    expect(third.changes).toEqual([]);
    expect(third.notes[0]).toMatch(/still found problems after 2 rounds: review_value-r2 found a problem\. Tell me what to change, or use it as it is\./);
  });
});

describe('judgeReview', () => {
  const review = byId(plan, 'review_value');

  it("reads the reviewer's own verdict", async () => {
    llm.mockResolvedValueOnce({ response: '{"verdict": "fix", "findings": ["The hook is weak."]}' } as never);
    expect(await judgeReview(review, { summary: 'The hook is weak; make it stronger.' })).toEqual({ verdict: 'fix', findings: ['The hook is weak.'] });
    expect(llm).toHaveBeenCalledWith('nova', expect.objectContaining({ format: 'json' }));
  });

  // Agent phase 3: an unreadable review is never a pass.
  it('an unreadable review is never a pass', async () => {
    llm.mockResolvedValueOnce({ response: 'Looks fine to me!' } as never);
    expect(await judgeReview(review, { summary: 'ok' })).toMatchObject({ verdict: 'fix', findings: ['The review could not be read: check it on the board.'] });
    llm.mockRejectedValueOnce(new Error('down'));
    expect((await judgeReview(review, { summary: 'ok' })).verdict).toBe('fix');
  });

  // Agent phase 3: a content quality review's verdict comes from her own scores and the
  // brand's threshold, with no second model call.
  it("a content review under the brand's threshold is fix, without a model call", async () => {
    localStorage.clear();
    const { saveBrand } = await import('../../../services/contentFactory/contentBrandService');
    const { createProject, emptyBrief } = await import('../../../services/contentFactory/contentProjectService');
    const brand = saveBrand({ name: 'B', qualityThreshold: 7 } as never);
    const project = createProject(brand.id, 'P', { ...emptyBrief(), idea: 'Idea' });
    const quality = { ...byId(plan, 'review_quality'), contentStep: { projectId: project.id, step: 'review' } } as PlanStep;
    const output = (data: unknown) => ({ summary: 's', artifacts: [{ type: 'content_step_output', actionType: 'audit_content_quality', data }] });
    const low = await judgeReview(quality, output({ pieces: [{ pieceId: 'script', score: 5, weakPoints: ['The hook is slow.'] }], honestyIssues: [] }));
    expect(low).toEqual({ verdict: 'fix', findings: ['script: 5/10 (under 7): The hook is slow.'] });
    const fine = await judgeReview(quality, output({ pieces: [{ pieceId: 'script', score: 8, weakPoints: [] }], honestyIssues: [] }));
    expect(fine.verdict).toBe('pass');
    expect(llm).not.toHaveBeenCalled();
  });

  it('a content review with an honesty issue is fix', async () => {
    localStorage.clear();
    const { saveBrand } = await import('../../../services/contentFactory/contentBrandService');
    const { createProject, emptyBrief } = await import('../../../services/contentFactory/contentProjectService');
    const brand = saveBrand({ name: 'B', qualityThreshold: 7 } as never);
    const project = createProject(brand.id, 'P', { ...emptyBrief(), idea: 'Idea' });
    const quality = { ...byId(plan, 'review_quality'), contentStep: { projectId: project.id, step: 'review' } } as PlanStep;
    const out = await judgeReview(quality, { summary: 's', artifacts: [{ type: 'content_step_output', actionType: 'audit_content_quality', data: { pieces: [{ pieceId: 'script', score: 9, weakPoints: [] }], honestyIssues: ['It promises results it cannot show.'] } }] });
    expect(out).toEqual({ verdict: 'fix', findings: ['Honesty: It promises results it cannot show.'] });
  });
});
