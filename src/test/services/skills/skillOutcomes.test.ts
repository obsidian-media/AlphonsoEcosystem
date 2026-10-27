// Agent roles Part C1: what each skill's work achieved.
import { describe, it, expect, beforeEach } from 'vitest';
import { recordStepOutcome, recordReviewVerdict, skillStats, statsLine, listSkillOutcomes } from '../../../services/skills/skillOutcomes';
import { skillLastUsed } from '../../../services/skills/skillUse';

const base = { requestId: 'r1', stepId: 'draft', agent: 'miya', skill: 'Creative package', actionType: 'creative_package', model: null } as const;
const DAY = 24 * 3600 * 1000;

beforeEach(() => localStorage.clear());

describe('recording', () => {
  it('keeps only its own words: an unknown outcome or verdict is not stored', () => {
    recordStepOutcome({ ...base, outcome: 'sk-secret' as never });
    expect(listSkillOutcomes()).toEqual([]);
    recordStepOutcome({ ...base, outcome: 'done' });
    recordReviewVerdict('r1', 'draft', 'sk-secret' as never);
    expect(listSkillOutcomes()[0].verdict).toBeUndefined();
    expect(JSON.stringify(listSkillOutcomes())).not.toContain('sk-secret');
  });

  it('keeps only names the app knows: agent, task type and skill; no model', () => {
    recordStepOutcome({ ...base, agent: 'sk-agent' as never, outcome: 'done' });
    expect(listSkillOutcomes()).toEqual([]);
    recordStepOutcome({ ...base, stepId: 's2', skill: 'sk-skill', actionType: 'sk-type', model: 'sk-model', outcome: 'done' });
    const saved = listSkillOutcomes()[0] as any;
    expect(saved.skill).toBeNull();
    expect(saved.actionType).toBe('');
    expect(saved.model).toBeUndefined();
    expect(JSON.stringify(listSkillOutcomes())).not.toMatch(/sk-/);
  });

  it('one record per step: a step carried on after an approval is not counted twice', () => {
    recordStepOutcome({ ...base, outcome: 'setup_needed' }, 1000);
    recordStepOutcome({ ...base, outcome: 'done' }, 2000);
    expect(listSkillOutcomes()).toHaveLength(1);
    expect(listSkillOutcomes()[0]).toMatchObject({ outcome: 'done', atMs: 2000 });
  });

  it("a review's verdict lands on the step it reviewed", () => {
    recordStepOutcome({ ...base, outcome: 'done' });
    recordReviewVerdict('r1', 'draft', 'fix');
    expect(listSkillOutcomes()[0].verdict).toBe('fix');
  });

  it('a verdict that comes before the outcome is kept (the review ends while the run goes on)', () => {
    recordReviewVerdict('r1', 'draft', 'pass');
    recordStepOutcome({ ...base, outcome: 'done' });
    expect(listSkillOutcomes()).toHaveLength(1);
    expect(listSkillOutcomes()[0]).toMatchObject({ agent: 'miya', outcome: 'done', verdict: 'pass' });
  });

  it('keeps the last 1,000', () => {
    for (let i = 0; i < 1001; i += 1) recordStepOutcome({ ...base, stepId: `s${i}`, outcome: 'done' }, i);
    expect(listSkillOutcomes()).toHaveLength(1000);
  });
});

describe('the numbers per skill', () => {
  it('counts uses, reviews and passes', () => {
    recordStepOutcome({ ...base, stepId: 'a', outcome: 'done' }, 1);
    recordStepOutcome({ ...base, stepId: 'b', outcome: 'failed' }, 2);
    recordStepOutcome({ ...base, stepId: 'c', outcome: 'done' }, 3);
    recordReviewVerdict('r1', 'a', 'pass');
    recordReviewVerdict('r1', 'c', 'fix');
    expect(skillStats('miya', 'Creative package')).toEqual({ used: 3, reviewed: 2, passed: 1, lastUsedMs: 3 });
    expect(skillStats('miya', 'creative package').used).toBe(3);
  });

  it('says it plainly', () => {
    const now = Date.UTC(2026, 9, 27, 12);
    expect(statsLine({ used: 0, reviewed: 0, passed: 0, lastUsedMs: null }, now)).toBe('Not used yet');
    expect(statsLine({ used: 12, reviewed: 10, passed: 9, lastUsedMs: now - 1000 }, now)).toBe('Used 12 times · 9 of 10 reviews passed · last used today');
    expect(statsLine({ used: 1, reviewed: 0, passed: 0, lastUsedMs: now - 3 * DAY }, now)).toBe('Used once · last used 3 days ago');
  });
});

describe('last used', () => {
  it('reads the results, seeded once from the old last-used record', () => {
    localStorage.setItem('alphonso_skill_last_used_v1', JSON.stringify({ 'hector:web research with sources': 500 }));
    expect(skillLastUsed('hector', 'Web research with sources')).toBe(500);
    recordStepOutcome({ ...base, agent: 'hector', skill: 'Web research with sources', stepId: 'h', outcome: 'done' }, 900);
    expect(skillLastUsed('hector', 'Web research with sources')).toBe(900);
  });
});
