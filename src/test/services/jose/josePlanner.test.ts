import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../lib/ollama', () => ({
  generateAgentLlmResponse: vi.fn(),
}));

vi.mock('../../../services/jose/joseModels', async (importOriginal) => ({
  ...(await importOriginal()),
  listInstalledModels: vi.fn(async () => ['llama3.2:3b', 'qwen2.5:7b']),
}));

vi.mock('../../../services/jose/joseSpend', async (importOriginal) => ({
  ...(await importOriginal()),
  paidModelAvailable: vi.fn(() => (globalThis as any).__josePaid || { ok: false, reason: 'off' }),
  paidModelId: vi.fn(() => 'claude:claude-haiku-5-5'),
}));

import { generateAgentLlmResponse } from '../../../lib/ollama';
import { planJoseRequest, describePlanSource } from '../../../services/jose/josePlanner';
import { getTemplate } from '../../../services/jose/joseTemplates';
import { decomposeJoseCommand, parseJoseCommand } from '../../../services/joseCommandRouterService';

const llm = vi.mocked(generateAgentLlmResponse);

type ModelStep = { id: string; agent: string; taskType: string; instruction: string; effects?: string[]; needs?: string[]; model?: string };
const answer = (steps: ModelStep[], basedOnTemplate: string | null = null, kind = 'normal') =>
  ({ response: JSON.stringify({ basedOnTemplate, kind, steps }) }) as never;
const promptOf = (call: number) => String((llm.mock.calls[call][1] as { prompt: string }).prompt);

const templateAsModelSteps = (id: string): ModelStep[] =>
  getTemplate(id)!.steps.map((s) => ({ id: s.stepId, agent: s.agent, taskType: s.actionType, instruction: s.instruction || '', effects: s.effects, needs: s.needs }));

const VIDEO = 'Make a YouTube video script about our launch';
const PARTY = 'Plan a birthday party for my daughter';

beforeEach(() => {
  llm.mockReset();
  localStorage.clear();
});

describe('Jose plans fresh when no template fits (owner: make sure of it)', () => {
  it('plans fresh, with no template in the prompt, when none fits', async () => {
    llm.mockResolvedValueOnce(answer([{ id: 'ideas', agent: 'nova', taskType: 'analysis_party', instruction: 'Suggest party ideas.', effects: ['read'], needs: [] }]));
    const plan = await planJoseRequest(PARTY);
    expect(promptOf(0)).not.toMatch(/Starting point/);
    expect(plan.source).toBe('fresh');
    expect(plan.templateId).toBeNull();
    expect(plan.steps.map((s) => s.stepId)).toEqual(['ideas']);
    expect(plan.steps[0].instruction).toBe('Suggest party ideas.');
    expect(describePlanSource(plan)).toBe('Planned fresh.');
  });

  it('"Plan this fresh" skips templates even when one fits', async () => {
    llm.mockResolvedValueOnce(answer(templateAsModelSteps('content_video'), 'content_video'));
    const plan = await planJoseRequest(VIDEO, { planFresh: true });
    expect(promptOf(0)).not.toMatch(/Starting point/);
    expect(plan.source).toBe('fresh');
    expect(plan.templateId).toBeNull();
  });

  it('uses a fitting template unchanged and says so', async () => {
    llm.mockResolvedValueOnce(answer(templateAsModelSteps('content_video'), 'content_video'));
    const plan = await planJoseRequest(VIDEO);
    expect(promptOf(0)).toMatch(/Starting point: Content video/);
    expect(plan.source).toBe('template');
    expect(plan.templateId).toBe('content_video');
    expect(describePlanSource(plan)).toBe('Based on template Content video.');
  });

  it('adapts a template and says so', async () => {
    const steps = [...templateAsModelSteps('content_video'), { id: 'safety', agent: 'sentinel', taskType: 'security_content_check', instruction: 'Check the campaign for unsafe claims.', effects: ['read'], needs: ['campaign'] }];
    llm.mockResolvedValueOnce(answer(steps, 'content_video'));
    const plan = await planJoseRequest(VIDEO);
    expect(plan.source).toBe('adapted');
    expect(describePlanSource(plan)).toBe('Based on template Content video (adapted).');
  });

  it('accepts any agents in any order (the old fixed order no longer binds)', async () => {
    llm.mockResolvedValueOnce(answer([
      { id: 'value', agent: 'nova', taskType: 'analysis_value', instruction: 'Is this worth doing?', effects: ['read'] },
      { id: 'facts', agent: 'hector', taskType: 'research', instruction: 'Find the facts.', effects: ['read'], needs: ['value'] },
    ]));
    const plan = await planJoseRequest(PARTY);
    expect(plan.source).toBe('fresh');
    expect(plan.steps.find((s) => s.stepId === 'facts')?.needs).toEqual(['value']);
  });

  it('takes the kind from the model', async () => {
    llm.mockResolvedValueOnce(answer([{ id: 'a', agent: 'nova', taskType: 'analysis_x', instruction: 'x', effects: ['read'] }], null, 'project'));
    expect((await planJoseRequest(PARTY)).kind).toBe('project');
  });
});

describe('the rules check every plan, with one fix and then a fallback', () => {
  const cycle: ModelStep[] = [
    { id: 'a', agent: 'nova', taskType: 'analysis_x', instruction: 'x', effects: ['read'], needs: ['b'] },
    { id: 'b', agent: 'nova', taskType: 'analysis_y', instruction: 'y', effects: ['read'], needs: ['a'] },
  ];

  it('asks once more, naming the problem, and uses the fixed plan', async () => {
    llm.mockResolvedValueOnce(answer(cycle)).mockResolvedValueOnce(answer([{ id: 'a', agent: 'nova', taskType: 'analysis_x', instruction: 'x', effects: ['read'] }]));
    const plan = await planJoseRequest(PARTY);
    expect(llm).toHaveBeenCalledTimes(2);
    expect(promptOf(1)).toMatch(/cycle/);
    expect(plan.source).toBe('fresh');
  });

  it('falls back to the simple plan, saying why, when no template fits', async () => {
    const text = 'research the latest pricing for electric bikes';
    llm.mockResolvedValueOnce(answer(cycle)).mockResolvedValueOnce(answer(cycle));
    const plan = await planJoseRequest(text);
    expect(plan.source).toBe('rules');
    expect(plan.note).toMatch(/didn't pass the checks/);
    expect(plan.steps.map((s) => s.agent)).toEqual(decomposeJoseCommand(parseJoseCommand(text)).map((a) => a.agent));
  });

  it('falls back to a fitting template unchanged', async () => {
    llm.mockResolvedValueOnce(answer(cycle)).mockResolvedValueOnce(answer(cycle));
    const plan = await planJoseRequest(VIDEO);
    expect(plan.source).toBe('template');
    expect(plan.steps.map((s) => s.stepId)).toEqual(getTemplate('content_video')!.steps.map((s) => s.stepId));
    expect(plan.note).toMatch(/didn't pass the checks/);
  });

  it('falls back when Jose’s model is not available', async () => {
    llm.mockRejectedValue(new Error('connection refused'));
    const plan = await planJoseRequest(PARTY);
    expect(plan.source).toBe('rules');
    expect(plan.note).toMatch(/isn't available/);
  });

  it('reads JSON wrapped in prose, and treats an empty plan as unusable', async () => {
    llm
      .mockResolvedValueOnce({ response: '{"basedOnTemplate": null, "steps": []}' } as never)
      .mockResolvedValueOnce({ response: 'Here is the plan:\n```json\n{"basedOnTemplate": null, "kind": "normal", "steps": [{"id": "a", "agent": "nova", "taskType": "analysis_x", "instruction": "x", "effects": ["read"], "needs": []}]}\n```\nDone.' } as never);
    const plan = await planJoseRequest(PARTY);
    expect(llm).toHaveBeenCalledTimes(2);
    expect(plan.source).toBe('fresh');
  });

  it('cannot dodge approval by under-declaring effects', async () => {
    llm.mockResolvedValueOnce(answer([{ id: 'post', agent: 'marcus', taskType: 'distribution_execution', instruction: 'Post it.', effects: ['read'] }]));
    const plan = await planJoseRequest(PARTY);
    expect(plan.steps[0].effects).toContain('publish_or_send');
  });

  it('refuses running code by anyone but Alphonso', async () => {
    const bad = [{ id: 'a', agent: 'miya', taskType: 'creative_x', instruction: 'Run the build.', effects: ['run'] }];
    llm.mockResolvedValueOnce(answer(bad)).mockResolvedValueOnce(answer(bad));
    const plan = await planJoseRequest(PARTY);
    expect(promptOf(1)).toMatch(/only Alphonso/);
    expect(plan.source).toBe('rules');
  });
});

// Phase 4: Jose picks the model for each step, from installed models only.
describe('the model for each step', () => {
  it('names the installed models in the prompt and keeps an installed choice', async () => {
    llm.mockResolvedValueOnce(answer([{ id: 'a', agent: 'nova', taskType: 'analysis_x', instruction: 'x', effects: ['read'], model: 'qwen2.5:7b' }]));
    const plan = await planJoseRequest(PARTY);
    expect(promptOf(0)).toMatch(/qwen2\.5:7b/);
    expect(plan.steps[0].model).toBe('qwen2.5:7b');
  });

  it('drops a model that is not installed', async () => {
    llm.mockResolvedValueOnce(answer([{ id: 'a', agent: 'nova', taskType: 'analysis_x', instruction: 'x', effects: ['read'], model: 'gpt-imaginary:70b' }]));
    const plan = await planJoseRequest(PARTY);
    expect(plan.steps[0].model).toBeUndefined();
  });

  it('offers the paid model only when you allow it; a step given it spends and has a cost', async () => {
    const paidStep = { id: 'a', agent: 'miya', taskType: 'creative_script', instruction: 'Write it.', effects: ['write_own_work'], model: 'claude:claude-haiku-5-5' };
    llm.mockResolvedValueOnce(answer([paidStep]));
    const off = await planJoseRequest(PARTY);
    expect(promptOf(0)).not.toMatch(/claude:/);
    expect(off.steps[0].model).toBeUndefined();
    expect(off.steps[0].effects).not.toContain('spend');

    (globalThis as any).__josePaid = { ok: true };
    llm.mockResolvedValueOnce(answer([paidStep]));
    const on = await planJoseRequest(PARTY);
    (globalThis as any).__josePaid = undefined;
    expect(promptOf(1)).toMatch(/claude:claude-haiku-5-5/);
    expect(on.steps[0]).toMatchObject({ model: 'claude:claude-haiku-5-5' });
    expect(on.steps[0].effects).toEqual(expect.arrayContaining(['write_own_work', 'spend']));
    expect(on.steps[0].costEstimateUsd).toBeGreaterThanOrEqual(0);
  });

  it("fills a template step's needs and review from the template when the model leaves them out", async () => {
    const research = getTemplate('research_report')!;
    const bare = research.steps.map((step) => ({ id: step.stepId, agent: step.agent, taskType: step.actionType, instruction: step.instruction || '', effects: step.effects }));
    llm.mockResolvedValueOnce(answer(bare, 'research_report'));
    const plan = await planJoseRequest('Research what the IANA example domain is used for and write a short report.');
    for (const step of research.steps) {
      const planned = plan.steps.find((s) => s.stepId === step.stepId)!;
      expect(planned.needs).toEqual(step.needs);
      expect(planned.reviewOf).toBe(step.reviewOf);
    }
  });

  it('takes a review step that needs one step to review that step, when the model does not say', async () => {
    llm.mockResolvedValueOnce(answer([
      { id: 'facts', agent: 'hector', taskType: 'research_report', instruction: 'Find facts.', effects: ['read'], needs: [] },
      { id: 'analysis', agent: 'nova', taskType: 'analysis_findings', instruction: 'Analyse.', effects: ['read'], needs: ['facts'] },
      { id: 'check', agent: 'maria', taskType: 'audit_quality', instruction: 'Check it.', effects: ['read'], needs: ['analysis'] },
      { id: 'both', agent: 'sentinel', taskType: 'security_review', instruction: 'Check both.', effects: ['read'], needs: ['facts', 'analysis'] },
    ]));
    const plan = await planJoseRequest(PARTY);
    expect(plan.steps.find((s) => s.stepId === 'check')!.reviewOf).toBe('analysis');
    expect(plan.steps.find((s) => s.stepId === 'both')!.reviewOf).toBeUndefined();
    expect(plan.steps.find((s) => s.stepId === 'analysis')!.reviewOf).toBeUndefined();
  });
});
