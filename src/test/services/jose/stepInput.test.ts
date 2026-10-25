// Every step gets the work it needs, by step (agent roles Part A, 2026-10-24).
import { describe, it, expect, beforeEach } from 'vitest';
import { setStepOutput } from '../../../services/jose/joseStepOutputs';
import { buildStepInput, stepInputText, readableOutput, STEP_INPUT_LIMITS } from '../../../services/jose/stepInput';
import { buildMariaAuditPrompt } from '../../../services/mariaAuditService';
import { buildNovaAnalysisPrompt } from '../../../services/novaAnalysisService';
import { buildSentinelThreatPrompt } from '../../../services/sentinelSecurityService';
import { buildEchoSynthesisPrompt } from '../../../services/echoMemoryService';

const step = (stepId: string, agent: string, needs: string[] = [], extra: Record<string, unknown> = {}) =>
  ({ stepId, agent, actionType: 'x', needs, effects: ['read'], ...extra }) as any;

describe('buildStepInput', () => {
  beforeEach(() => localStorage.clear());

  it('gives a step both of the Miya steps it needs, by step id', () => {
    setStepOutput('c1', 'miya', 'miya', { summary: 'First draft' });
    setStepOutput('c1', 'miya-2', 'miya', { summary: 'Second draft' });
    const input = buildStepInput('c1', step('maria', 'maria', ['miya', 'miya-2']), 'the request', {});
    expect(input.needs.map((n) => [n.stepId, n.text])).toEqual([['miya', 'First draft'], ['miya-2', 'Second draft']]);
  });

  it('cuts a long output and says how much is on the board', () => {
    setStepOutput('c1', 'hector', 'hector', { summary: 'a'.repeat(8000) });
    const input = buildStepInput('c1', step('miya', 'miya', ['hector']), 'r', {});
    expect(input.needs[0].cut).toBe(2000);
    expect(input.needs[0].text.endsWith('(cut: 2000 more characters on the board)')).toBe(true);
    expect(input.needs[0].text.length).toBeLessThan(STEP_INPUT_LIMITS.localChars + 60);
    const large = buildStepInput('c1', step('miya', 'miya', ['hector']), 'r', { large: true });
    expect(large.needs[0].cut).toBe(0);
  });

  it('reads an output that only has a schema', () => {
    setStepOutput('c1', 'maria', 'maria', { schema: { riskLevel: 'low', summary: 'Looks fine' } });
    expect(readableOutput({ stepId: 'maria', agent: 'maria', storedAtMs: 1, schema: { riskLevel: 'low' } } as any)).toMatch(/low/);
    const input = buildStepInput('c1', step('marcus', 'marcus', ['maria']), 'r', {});
    expect(input.needs[0].text).toMatch(/Looks fine/);
  });

  it('summarises at most 12 other finished steps in one line each', () => {
    for (let i = 0; i < 15; i += 1) setStepOutput('c1', `s${i}`, 'hector', { summary: `Found ${'x'.repeat(300)} ${i}` });
    const input = buildStepInput('c1', step('miya', 'miya', ['s0']), 'r', {});
    expect(input.others).toHaveLength(12);
    expect(input.others.every((line) => line.length <= STEP_INPUT_LIMITS.otherLineChars)).toBe(true);
    expect(input.others.some((line) => line.includes('s0'))).toBe(false);
  });

  it('names the work to review', () => {
    setStepOutput('c1', 'miya', 'miya', { summary: 'The post about honeybees' });
    const input = buildStepInput('c1', step('maria', 'maria', ['miya'], { reviewOf: 'miya' }), 'r', {});
    expect(input.review?.text).toBe('The post about honeybees');
    expect(stepInputText(input)).toMatch(/The work to review/);
  });

  it("puts the needed work into Maria's, Nova's, Sentinel's and Echo's prompts", () => {
    setStepOutput('c1', 'miya', 'miya', { summary: 'Bees pollinate a third of our food.' });
    const input = buildStepInput('c1', step('x', 'maria', ['miya']), 'r', {});
    expect(buildMariaAuditPrompt('r', {}, input)).toContain('Bees pollinate a third of our food.');
    expect(buildNovaAnalysisPrompt('r', {}, { opportunityScore: 1, riskScore: 1, timingScore: 1, effortScore: 1, valueScore: 1 } as any, input)).toContain('Bees pollinate');
    expect(buildSentinelThreatPrompt('r', {}, { findings: [] } as any, input)).toContain('Bees pollinate');
    expect(buildEchoSynthesisPrompt('r', {}, input)).toContain('Bees pollinate');
  });
});

describe('the work inside a step (final review, agent roles Part A)', () => {
  beforeEach(() => localStorage.clear());

  it("reads a package artifact's text, not only the summary, and skips internal option lists", () => {
    setStepOutput('c1', 'miya', 'miya', {
      summary: 'Miya generated a structured creative package for "Bees".',
      artifacts: [
        { type: 'creative_package', title: 'Bees', hook: 'Bees run the world.', script: 'Bees pollinate a third of our food.' },
        { type: 'comfyui_local_generation_options', presets: [{ id: 'p1', name: 'Preset one' }] },
      ],
    });
    const input = buildStepInput('c1', step('maria', 'maria', ['miya']), 'r', {});
    expect(input.needs[0].text).toContain('Bees pollinate a third of our food.');
    expect(input.needs[0].text).not.toContain('Preset one');
    expect(input.needs[0].main).toBe('Bees pollinate a third of our food.');
  });

  it("uses the summary as the main text when the step saved nothing else", () => {
    setStepOutput('c1', 'alphonso', 'alphonso', { summary: 'Dear team, the launch moves to Friday.' });
    expect(buildStepInput('c1', step('marcus', 'marcus', ['alphonso']), 'r', {}).needs[0].main).toBe('Dear team, the launch moves to Friday.');
  });
});

describe('the skill in the step input (agent roles Part B)', () => {
  it('stepInputText puts the skill and what its tools found first', async () => {
    const { stepInputText, skillSection } = await import('../../../services/jose/stepInput');
    const input = {
      instruction: 'Check it', request: 'Bees', others: [], memory: '', review: null, needs: [],
      skill: { name: 'Claim check', reason: 'Numbers.', instructions: 'Check every claim.', results: [{ tool: 'read_sources', text: 'https://a.example' }] },
    };
    const text = stepInputText(input as never);
    expect(text.startsWith('Your skill: Claim check\nCheck every claim.\n\nWhat your tools found:\n- read_sources: https://a.example')).toBe(true);
    expect(skillSection({ ...input, skill: null } as never)).toBe('');
    expect(skillSection(null)).toBe('');
  });
});
