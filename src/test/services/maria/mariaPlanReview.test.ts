// Maria reviews a plan or an action (agent phase 3, owner 2026-10-25): risk with a reason,
// the rules that apply and why, concrete points, what needs your approval, and an offer
// when the plan sends or posts something. No "low risk, approval required".
import { describe, it, expect, vi, beforeEach } from 'vitest';

const llm = vi.fn();
vi.mock('../../../lib/ollama', () => ({ generateAgentLlmResponse: (...a: unknown[]) => llm(...a) }));

import { parsePlanReview, contradiction, planReviewText, planReviewPrompt, runMariaPlanReview } from '../../../services/maria/mariaPlanReview';
import { MARIA_NO_REVIEW } from '../../../services/maria/mariaWorkReview';

const PLAN = 'Audit this plan: tomorrow we email all 500 customers a 30 percent discount code and post it on Instagram.';
const json = (v: unknown) => ({ response: JSON.stringify(v) });
const input = { instruction: '', request: PLAN, needs: [], others: [], memory: '', review: null };
const good = {
  risk: 'medium', why: 'It emails customers and publishes a code.',
  rules: [{ rule: 'Permission to email customers', applies: 'All 500 customers get a marketing email.' }],
  points: ['Posting the code on Instagram gives it to everyone, not only customers.'],
  needsApproval: true, approvalReasons: ['Posting the code on Instagram gives it to everyone, not only customers.'],
  offer: 'the email and the Instagram post, ready to send',
};

beforeEach(() => llm.mockReset());

describe('parsePlanReview', () => {
  it('a specific review', () => {
    const r = parsePlanReview(JSON.stringify(good))!;
    expect(r.rules[0].rule).toBe('Permission to email customers');
    expect(r.points).toHaveLength(1);
    expect(r.needsApproval).toBe(true);
  });

  it('approval reasons must be among the points or rules', () => {
    const r = parsePlanReview(JSON.stringify({ ...good, approvalReasons: ['Something she never mentioned'] }))!;
    expect(r.approvalReasons).toEqual([]);
    expect(r.needsApproval).toBe(false);
  });

  it('unreadable is null', () => expect(parsePlanReview('Seems risky')).toBeNull());
});

describe('contradiction and the text', () => {
  it('low risk with an approval is a contradiction', () => {
    expect(contradiction({ ...parsePlanReview(JSON.stringify(good))!, risk: 'low' })).toBe('You asked for approval but said low risk: say which.');
    expect(contradiction(parsePlanReview(JSON.stringify(good))!)).toBeNull();
  });

  it('the text starts with Risk: and closes with the offer', () => {
    const text = planReviewText(parsePlanReview(JSON.stringify(good))!);
    expect(text.startsWith('Risk: medium. It emails customers and publishes a code.')).toBe(true);
    expect(text).toContain('Needs your approval:');
    expect(text.trim().endsWith('Want me to have Marcus prepare this? (the email and the Instagram post, ready to send)')).toBe(true);
  });

  it('the prompt hands security to Sentinel', () => {
    expect(planReviewPrompt(input as never, {})).toContain("Security (secrets, unsafe links or commands, permissions) is Sentinel's");
  });
});

describe('runMariaPlanReview', () => {
  const assignment = { agent: 'maria', actionType: 'governance_audit', stepId: 'maria', packetId: 'p1' };

  it('no low risk with an approval', async () => {
    const low = json({ ...good, risk: 'low' });
    llm.mockResolvedValueOnce(low).mockResolvedValueOnce(low);
    const out = await runMariaPlanReview(assignment, input as never, {});
    expect(llm.mock.calls[1][1].prompt).toContain('You asked for approval but said low risk: say which.');
    expect(out.schema?.risk).toBe('medium');
  });

  it('schema keeps riskLevel and approvalRequired', async () => {
    llm.mockResolvedValueOnce(json(good));
    const out = await runMariaPlanReview(assignment, input as never, {});
    expect(out.schema).toMatchObject({ kind: 'plan', riskLevel: 'medium', approvalRequired: true, offer: good.offer });
    expect(out.summary.startsWith('Risk: medium.')).toBe(true);
    expect(llm.mock.calls[0][1]).not.toHaveProperty('model');
  });

  it('unreadable twice fails', async () => {
    llm.mockResolvedValue({ response: 'Seems risky' });
    const out = await runMariaPlanReview(assignment, input as never, {});
    expect(out.resultState).toBe('failed');
    expect(out.summary).toBe(MARIA_NO_REVIEW);
  });
});
