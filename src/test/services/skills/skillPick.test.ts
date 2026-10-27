// The agent picks its skill, with a reason (agent roles Part B, 2026-10-25).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const llm = vi.fn();
vi.mock('../../../lib/ollama', async (orig) => ({ ...(await orig() as object), generateAgentLlmResponse: (...a: unknown[]) => llm(...a) }));

import { pickSkill } from '../../../services/skills/skillPick';
import { setUserSkillFiles } from '../../../services/skills/skillLibrary';

const says = (value: unknown) => ({ response: typeof value === 'string' ? value : JSON.stringify(value) });

beforeEach(() => { llm.mockReset(); setUserSkillFiles([]); });

describe('pickSkill', () => {
  it('no model call when one skill fits', async () => {
    const picked = await pickSkill('alphonso', 'assistant_answer', null, { contentStep: false });
    expect(picked).toMatchObject({ skill: { name: 'Answer a question' }, reason: 'The only skill for this task.' });
    expect(llm).not.toHaveBeenCalled();
  });

  it('says so when no skill fits', async () => {
    expect(await pickSkill('alphonso', 'juggling', null, { contentStep: false })).toEqual({ skill: null, reason: 'No skill for this task.' });
  });

  it('content steps use the skill for their task', async () => {
    const picked = await pickSkill('miya', 'creative_script', null, { contentStep: true });
    expect(picked).toMatchObject({ skill: { name: 'Write the script' }, reason: "This step's format needs it." });
    expect(llm).not.toHaveBeenCalled();
  });

  it("the agent's choice and reason are kept", async () => {
    llm.mockResolvedValueOnce(says({ skill: 'Claim check', reason: 'The post quotes numbers.' }));
    const picked = await pickSkill('maria', 'audit_quality', null, { contentStep: false });
    expect(picked).toMatchObject({ skill: { name: 'Claim check' }, reason: 'The post quotes numbers.' });
    const prompt = String(llm.mock.calls[0][1].prompt);
    expect(prompt).toContain('Claim check: The work states facts');
    expect(prompt).toContain('Quality review: Work needs a quality review');
  });

  it('an unknown or unreadable choice falls back with "Matches this step\'s task."', async () => {
    llm.mockResolvedValueOnce(says({ skill: 'Juggling', reason: 'fun' }));
    expect(await pickSkill('maria', 'audit_quality', null, { contentStep: false }))
      .toMatchObject({ skill: { name: 'Claim check' }, reason: "Matches this step's task." });
    llm.mockResolvedValueOnce(says('I would pick the claim check'));
    expect((await pickSkill('maria', 'audit_quality', null, { contentStep: false })).reason).toBe("Matches this step's task.");
    llm.mockRejectedValueOnce(new Error('down'));
    expect((await pickSkill('maria', 'audit_quality', null, { contentStep: false })).reason).toBe("Matches this step's task.");
  });

  it('a user skill is offered beside a built-in one with the same name', async () => {
    setUserSkillFiles([{ agent: 'alphonso', file: 'answer-a-question.md', text: '---\nname: Answer a question\nagent: alphonso\nuse_when: My way of answering.\ntask_types: [assistant_answer]\n---\nAnswer in one line.' }]);
    llm.mockResolvedValueOnce(says({ skill: 'Answer a question (yours)', reason: 'Short answers wanted.' }));
    const picked = await pickSkill('alphonso', 'assistant_answer', null, { contentStep: false });
    const prompt = String(llm.mock.calls[0][1].prompt);
    expect(prompt).toContain('Answer a question: Someone asks a plain question.');
    expect(prompt).toContain('Answer a question (yours): My way of answering.');
    expect(picked.skill?.source).toBe('user');
    expect(picked.reason).toBe('Short answers wanted.');
  });

  it('cuts a long reason to 160 characters', async () => {
    llm.mockResolvedValueOnce(says({ skill: 'Claim check', reason: 'x'.repeat(300) }));
    expect((await pickSkill('maria', 'audit_quality', null, { contentStep: false })).reason.length).toBe(160);
  });
});

// Jose phase 7: a skill whose reviewed work keeps failing is offered last.
describe('skill results guide the pick', () => {
  const record = async (skill: string, verdicts: ('pass' | 'fix')[]) => {
    const { recordStepOutcome, recordReviewVerdict } = await import('../../../services/skills/skillOutcomes');
    verdicts.forEach((v, i) => {
      recordStepOutcome({ requestId: `r-${skill}-${i}`, stepId: 's', agent: 'maria', skill, actionType: 'audit_quality', outcome: 'done' });
      recordReviewVerdict(`r-${skill}-${i}`, 's', v);
    });
  };
  beforeEach(() => localStorage.clear());

  it('a skill that failed review 3 of 4 times is listed last, with why, and is not the fallback', async () => {
    await record('Claim check', ['pass', 'fix', 'fix', 'fix']);
    llm.mockResolvedValueOnce(says('unreadable'));
    const picked = await pickSkill('maria', 'audit_quality', null, { contentStep: false });
    const prompt = String(llm.mock.calls[0][1].prompt);
    expect(prompt.indexOf('Quality review:')).toBeLessThan(prompt.indexOf('Claim check:'));
    expect(prompt).toContain('(its reviewed work failed 3 of 4 times)');
    expect(picked.skill?.name).toBe('Quality review');
    expect(picked.reason).toBe("Picked Quality review; Claim check's reviewed work failed 3 of 4 times.");
  });

  it('fewer than 3 reviews is not enough to hold a skill back', async () => {
    await record('Claim check', ['fix', 'fix']);
    llm.mockResolvedValueOnce(says('unreadable'));
    expect((await pickSkill('maria', 'audit_quality', null, { contentStep: false })).skill?.name).toBe('Claim check');
  });

  it('a single skill is used whatever its record', async () => {
    const { recordStepOutcome, recordReviewVerdict } = await import('../../../services/skills/skillOutcomes');
    for (let i = 0; i < 4; i += 1) {
      recordStepOutcome({ requestId: `a${i}`, stepId: 's', agent: 'alphonso', skill: 'Answer a question', actionType: 'assistant_answer', outcome: 'done' });
      recordReviewVerdict(`a${i}`, 's', 'fix');
    }
    expect((await pickSkill('alphonso', 'assistant_answer', null, { contentStep: false })).skill?.name).toBe('Answer a question');
  });
});
