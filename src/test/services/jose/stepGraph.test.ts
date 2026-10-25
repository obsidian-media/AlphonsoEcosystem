import { describe, it, expect } from 'vitest';
import { JOSE_LIMITS, checkPlan, buildStepWaves, legacyNeeds, isPaidModelId, type PlanStep } from '../../../services/jose/stepGraph';

const step = (stepId: string, agent: string, actionType: string, needs: string[] = [], effects: PlanStep['effects'] = ['read']): PlanStep =>
  ({ stepId, agent, actionType, needs, effects });

import { isCodeRequest } from '../../../services/jose/taskTypeMeanings';

describe('stepGraph', () => {
  it('has the limits from the design', () => {
    expect(JOSE_LIMITS).toEqual({ maxSteps: 50, normalMs: 1_800_000, projectMs: 7_200_000, maxFixRounds: 2 });
  });

  it('lets one agent have several steps, in order', () => {
    const steps = [step('script', 'miya', 'creative_script', [], ['write_own_work']), step('revise', 'miya', 'creative_script', ['script'], ['write_own_work'])];
    expect(checkPlan(steps)).toEqual({ ok: true, problems: [] });
    expect(buildStepWaves(steps)).toEqual([['script'], ['revise']]);
  });

  it('runs steps as soon as what they need is done', () => {
    const steps = [
      step('a', 'hector', 'research'),
      step('b', 'nova', 'analysis_x', ['a']),
      step('c', 'maria', 'audit_x', ['a']),
      step('d', 'jose', 'orchestration_review', ['b', 'c']),
    ];
    expect(buildStepWaves(steps)).toEqual([['a'], ['b', 'c'], ['d']]);
  });

  it('rejects steps that wait for each other', () => {
    const result = checkPlan([step('a', 'hector', 'research', ['b']), step('b', 'nova', 'analysis_x', ['a'])]);
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/cycle/i);
    expect(() => buildStepWaves([step('a', 'hector', 'research', ['b']), step('b', 'nova', 'analysis_x', ['a'])])).toThrow();
  });

  it('rejects a step that needs a missing step, naming it', () => {
    const result = checkPlan([step('a', 'hector', 'research', ['ghost'])]);
    expect(result.problems.join(' ')).toMatch(/ghost/);
  });

  it('rejects running code by anyone but Alphonso', () => {
    const result = checkPlan([step('a', 'miya', 'creative_x', [], ['run'])]);
    expect(result.problems.join(' ')).toMatch(/only Alphonso/);
  });

  it('rejects publishing by anyone but Marcus', () => {
    const result = checkPlan([step('a', 'hector', 'research', [], ['publish_or_send'])]);
    expect(result.problems.join(' ')).toMatch(/only Marcus/);
  });

  it('rejects unknown agents, task types an agent may not do, and duplicate ids', () => {
    expect(checkPlan([step('a', 'ghost', 'research')]).problems.join(' ')).toMatch(/unknown agent/i);
    expect(checkPlan([step('a', 'miya', 'research')]).problems.join(' ')).toMatch(/may not do "research"/);
    expect(checkPlan([step('a', 'hector', 'research'), step('a', 'nova', 'analysis_x')]).problems.join(' ')).toMatch(/twice/);
  });

  it("can leave task types to the run-time check (the splitter's plans)", () => {
    const plan = [step('a', 'miya', 'research', [], ['read'])];
    expect(checkPlan(plan).ok).toBe(false);
    expect(checkPlan(plan, { taskTypes: false })).toEqual({ ok: true, problems: [] });
    expect(checkPlan([step('a', 'miya', 'creative_x', [], ['run'])], { taskTypes: false }).ok).toBe(false);
  });

  it('rejects more than 50 steps', () => {
    const many = Array.from({ length: 51 }, (_, i) => step(`s${i}`, 'hector', 'research'));
    expect(checkPlan(many).problems.join(' ')).toMatch(/50/);
  });

  it("keeps today's order for the splitter's tasks", () => {
    const needs = legacyNeeds([{ agent: 'hector', stepId: 'hector' }, { agent: 'miya', stepId: 'miya' }, { agent: 'echo', stepId: 'echo' }]);
    expect(needs.miya).toEqual(['hector']);
    expect(needs.echo.sort()).toEqual(['hector', 'miya']);
    expect(needs.hector).toEqual([]);
  });

  // Phase 4: the spending on a paid-model step is the model call, which always asks.
  it('lets a step with a paid model spend, and no other step', () => {
    const paid: PlanStep = { ...step('a', 'miya', 'creative_script', [], ['write_own_work', 'spend']), model: 'claude:claude-haiku-5-5' };
    expect(checkPlan([paid]).ok).toBe(true);
    expect(checkPlan([{ ...paid, model: 'qwen2.5:7b' }]).problems.join(' ')).toMatch(/Miya may not spend money/);
  });

  // Content factory phase 2b: a Runway run of AI clips spends through the gated Runway connector.
  it("lets Miya's paid media steps spend (AI clips; Higgsfield pictures since 4b), and no other Miya step without a paid model", () => {
    expect(checkPlan([step('clips', 'miya', 'creative_video_clips', [], ['write_own_work', 'spend'])]).ok).toBe(true);
    expect(checkPlan([step('s', 'miya', 'creative_scenes', [], ['write_own_work', 'spend'])]).ok).toBe(true);
    expect(checkPlan([step('s', 'miya', 'creative_script', [], ['write_own_work', 'spend'])]).problems.join(' ')).toMatch(/Miya may not spend money/);
    expect(checkPlan([step('n', 'nova', 'creative_video_clips', [], ['read', 'spend'])]).problems.join(' ')).toMatch(/may not/);
  });

  it('knows a paid model id', () => {
    expect(isPaidModelId('claude:claude-haiku-5-5')).toBe(true);
    expect(isPaidModelId('chatgpt:')).toBe(true);
    expect(isPaidModelId('qwen2.5:7b')).toBe(false);
    expect(isPaidModelId(undefined)).toBe(false);
  });
});

describe('a code step needs a code request (agent phase 1)', () => {
  const codeStep = (instruction = 'Write the paragraph.') => [{ stepId: 'alphonso', agent: 'alphonso', actionType: 'local_operation', effects: ['run' as const], needs: [], instruction }];

  it('refuses a code step for a writing request', () => {
    expect(checkPlan(codeStep(), { request: 'Research bees and write a short summary' }).problems)
      .toContain('alphonso is writing, not code: give it to Alphonso as assistant_write.');
  });

  it('allows it when the request is about code', () => {
    expect(checkPlan(codeStep(), { request: 'Fix the build error in my app' }).ok).toBe(true);
  });

  it("allows it when the step's instruction is about code", () => {
    expect(checkPlan(codeStep('Write a script that renames the files.'), { request: 'Tidy my photos folder' }).ok).toBe(true);
  });

  it('without a request there is no check (steps a caller already decided)', () => {
    expect(checkPlan(codeStep()).ok).toBe(true);
  });

  it('isCodeRequest reads whole words', () => {
    expect(isCodeRequest('fix the failing test')).toBe(true);
    expect(isCodeRequest('write a short post about bees')).toBe(false);
    expect(isCodeRequest('the latest contest results')).toBe(false);
  });
});
