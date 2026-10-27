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
import { planJoseRequest, describePlanSource, PLAN_EXAMPLE, copiedPlaceholders, missingAsked } from '../../../services/jose/josePlanner';
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

  // Agent phase 3: the fallback used to drop each step's links, so the writing
  // didn't read the research and the check wasn't a review of the writing.
  it('the fallback keeps the links', async () => {
    const text = 'Research three facts about honeybees, write a short post about them, and have the post checked for accuracy';
    llm.mockResolvedValueOnce(answer(cycle)).mockResolvedValueOnce(answer(cycle));
    const plan = await planJoseRequest(text);
    expect(plan.source).toBe('rules');
    const byId = Object.fromEntries(plan.steps.map((s) => [s.stepId, s]));
    expect(Object.keys(byId)).toEqual(['hector', 'write', 'check']);
    expect(byId.write.needs).toEqual(['hector']);
    expect(byId.check.needs).toEqual(['write']);
    expect(byId.check.reviewOf).toBe('write');
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

  it('offers no paid model when the caller allows none (a schedule)', async () => {
    (globalThis as any).__josePaid = { ok: true };
    llm.mockResolvedValueOnce(answer([{ id: 'a', agent: 'miya', taskType: 'creative_script', instruction: 'x', effects: ['write_own_work'], model: 'claude:claude-haiku-5-5' }]));
    const plan = await planJoseRequest(PARTY, { allowPaidModels: false });
    (globalThis as any).__josePaid = undefined;
    expect(promptOf(0)).not.toMatch(/claude:/);
    expect(plan.steps[0].model).toBeUndefined();
  });
});

describe('the planner names each job with its meaning (agent phase 1)', () => {
  it('the prompt lists task types with meanings, not prefixes', async () => {
    llm.mockResolvedValueOnce(answer([{ id: 'ideas', agent: 'nova', taskType: 'analysis_findings', instruction: 'Suggest party ideas.', effects: ['read'], needs: [] }]));
    await planJoseRequest(PARTY);
    expect(promptOf(0)).toContain('- assistant_write: ');
    expect(promptOf(0)).not.toContain('Task types starting with');
  });
});

describe("the planner refuses a code step for writing (agent phase 1)", () => {
  it('asks the model to fix it, naming the problem', async () => {
    llm
      .mockResolvedValueOnce(answer([{ id: 'write', agent: 'alphonso', taskType: 'local_operation', instruction: 'Write the paragraph.', effects: ['run'], needs: [] }]))
      .mockResolvedValueOnce(answer([{ id: 'write', agent: 'alphonso', taskType: 'assistant_write', instruction: 'Write the paragraph.', effects: ['write_own_work'], needs: [] }]));
    const plan = await planJoseRequest('Write a paragraph about honeybees');
    expect(promptOf(1)).toContain('write is writing, not code: give it to Alphonso as assistant_write.');
    expect(plan.steps[0].actionType).toBe('assistant_write');
  });
});

// Agent phase 5: the example had placeholders ("short_id", "<agent>") that a 7B model
// copied, so Jose's own plans failed his checks on every live request.
describe('the example plan has nothing a small model can copy', () => {
  it('the prompt has no placeholders', async () => {
    llm.mockResolvedValueOnce(answer([{ id: 'a', agent: 'nova', taskType: 'analysis_x', instruction: 'x', effects: ['read'] }]));
    await planJoseRequest(PARTY);
    const prompt = promptOf(0);
    for (const p of ['short_id', '<agent>', '<task type>', '<step id>', '"normal" or']) expect(prompt).not.toContain(p);
    expect(prompt).toContain(PLAN_EXAMPLE);
  });

  it('names copied placeholders so the fix round can say so', () => {
    expect(copiedPlaceholders([{ id: 'short_id', agent: 'none', taskType: 'normal' }])).toEqual([
      'Step id "short_id" is the example\'s placeholder: use your own ids.',
      'Agent "none" is not one of the agents.',
      'Task type "normal" is not a task type.',
    ]);
    expect(copiedPlaceholders([{ id: 'research', agent: 'hector', taskType: 'research_report' }])).toEqual([]);
  });

  // The desktop run (2026-10-26): the model planned only the writing for "post it to Slack".
  it('a plan that leaves out the send is sent back; still missing → the simple plan with Marcus', async () => {
    const SLACK = '/jose Post a short note that we open at 9 to Slack #news.';
    const writeOnly = answer([{ id: 'write', agent: 'alphonso', taskType: 'assistant_write', instruction: 'Write it.', effects: ['write_own_work'], needs: [] }]);
    llm.mockResolvedValueOnce(writeOnly).mockResolvedValueOnce(writeOnly);
    const plan = await planJoseRequest(SLACK);
    expect(promptOf(1)).toContain('The request asks to send to Slack: add a marcus step that sends it.');
    expect(plan.source).toBe('rules');
    expect(plan.steps.some((s) => s.agent === 'marcus')).toBe(true);
  });

  it('a readiness question needs the readiness check', () => {
    const plan = [{ agent: 'hector', effects: ['read'], actionType: 'research_report' }, { agent: 'alphonso', effects: ['write_own_work'], actionType: 'assistant_write' }];
    expect(missingAsked('/jose Is my announcement ready to post on Slack?', plan as never)).toEqual(['The request asks whether it is ready to send: add a marcus step with the task type distribution_readiness.']);
    expect(missingAsked('/jose Is my announcement ready to post on Slack?', [{ agent: 'marcus', effects: ['read'], actionType: 'distribution_readiness' }] as never)).toEqual([]);
  });

  // The Maria desktop run (2026-10-26): with working plans, the 7B model left out the check asked for.
  it('a check or a plan audit asked for needs Maria', () => {
    const noMaria = [{ agent: 'hector', effects: ['read'], actionType: 'research_report' }, { agent: 'alphonso', effects: ['write_own_work'], actionType: 'assistant_write' }, { agent: 'sentinel', effects: ['read'], actionType: 'security_content_check' }];
    expect(missingAsked('/jose Research three facts about honeybees, write a short post about them, and have the post checked for accuracy', noMaria as never))
      .toEqual(['The request asks for the writing to be checked: add a maria step with the task type audit_quality that reviews it.']);
    expect(missingAsked('/jose Audit this plan for compliance risks: tomorrow we email all 500 customers a 30 percent discount code.', noMaria as never))
      .toEqual(['The request asks for a review of a plan: add a maria step with the task type audit_governance.']);
    const withMaria = [...noMaria, { agent: 'maria', effects: ['read'], actionType: 'audit_quality' }];
    expect(missingAsked('/jose Research three facts about honeybees, write a short post about them, and have the post checked for accuracy', withMaria as never)).toEqual([]);
  });

  // The Maria desktop run (2026-10-26): the model's check needed nothing and reviewed nothing.
  it('a review step that needs nothing reviews the one piece of work', async () => {
    llm.mockResolvedValueOnce(answer([
      { id: 'research', agent: 'hector', taskType: 'research_report', instruction: 'Find facts.', effects: ['read'], needs: [] },
      { id: 'write', agent: 'alphonso', taskType: 'assistant_write', instruction: 'Write it.', effects: ['write_own_work'], needs: ['research'] },
      { id: 'audit_quality', agent: 'maria', taskType: 'audit_quality', instruction: 'Check it.', effects: ['read'], needs: [] },
    ]));
    const plan = await planJoseRequest('/jose Research three facts about honeybees, write a short post about them, and have the post checked for accuracy');
    expect(plan.steps.find((s) => s.stepId === 'audit_quality')).toMatchObject({ needs: ['write'], reviewOf: 'write' });
  });

  // Agent phase 6: a code request needs Alphonso's code step; plain writing needs no research.
  it('a code request planned without an Alphonso code step is sent back', () => {
    const plan = [{ agent: 'alphonso', effects: ['write_own_work'], actionType: 'assistant_answer' }];
    expect(missingAsked('Add a dark mode toggle to my website', plan as never))
      .toEqual(['The request asks for code: add an alphonso step with the task type local_operation.']);
    expect(missingAsked('Add a dark mode toggle to my website', [{ agent: 'alphonso', effects: ['run'], actionType: 'local_operation' }] as never)).toEqual([]);
    expect(missingAsked('What is a closure in JavaScript?', plan as never)).toEqual([]);
  });

  it('plain writing planned with research is sent back; writing that needs facts keeps it', () => {
    const plan = [{ agent: 'hector', effects: ['read'], actionType: 'research_report' }, { agent: 'alphonso', effects: ['write_own_work'], actionType: 'assistant_write' }];
    expect(missingAsked('Write a short email to my landlord saying the heating is broken', plan as never))
      .toEqual(["The request doesn't need research: remove the hector step."]);
    expect(missingAsked('Research the latest prices and write an email about them', plan as never)).toEqual([]);
  });

  // Live run (2026-10-26): "In shop, change test.js so it prints 'ok'" was planned with research first.
  it('a code request planned with research it does not need is sent back', () => {
    const plan = [{ agent: 'hector', effects: ['read'], actionType: 'research_report' }, { agent: 'alphonso', effects: ['run'], actionType: 'local_operation' }];
    expect(missingAsked("In shop, change test.js so it prints 'ok'", plan as never)).toEqual(["The request doesn't need research: remove the hector step."]);
    expect(missingAsked('Research the latest React release and update my app to it', plan as never)).toEqual([]);
  });

  // Agent phase 7: remember, forget and clean up need Echo's step.
  it("a request to remember, forget or clean up without Echo's step is sent back", () => {
    const plan = [{ agent: 'alphonso', effects: ['write_own_work'], actionType: 'assistant_answer' }];
    expect(missingAsked('Remember that I prefer short emails without emojis', plan as never))
      .toEqual(['The request asks to remember something: add an echo step with the task type memory_preservation.']);
    expect(missingAsked('Forget that the launch is on Friday', plan as never))
      .toEqual(['The request asks to forget something: add an echo step with the task type memory_forget.']);
    expect(missingAsked('Clean up my memory', plan as never))
      .toEqual(['The request asks to clean up memory: add an echo step with the task type memory_cleanup.']);
    expect(missingAsked('Remember that I prefer short emails', [{ agent: 'echo', effects: ['write_own_work'], actionType: 'memory_preservation' }] as never)).toEqual([]);
    // Found in the real app: "Clean up my memory" got a forget step too, which could forget something unasked.
    expect(missingAsked('Clean up my memory', [
      { agent: 'echo', effects: ['write_own_work'], actionType: 'memory_forget' },
      { agent: 'echo', effects: ['write_own_work'], actionType: 'memory_cleanup' },
    ] as never)).toEqual(['The request does not ask to forget anything: remove the memory_forget step.']);
    expect(missingAsked('Remember that the launch is Friday', [
      { agent: 'echo', effects: ['write_own_work'], actionType: 'memory_preservation' },
      { agent: 'echo', effects: ['write_own_work'], actionType: 'memory_cleanup' },
    ] as never)).toEqual(['The request does not ask to clean up memory: remove the memory_cleanup step.']);
    // Asking whether something is remembered is not asking to save it.
    expect(missingAsked('Do you remember what we decided about the launch?', plan as never)).toEqual([]);
    // A note to post is not something to remember.
    expect(missingAsked('Post a short note that we open at 9 to Slack #news.', [{ agent: 'marcus', effects: ['publish_or_send'], actionType: 'distribution_execution' }] as never)).toEqual([]);
  });

  it('a plan with the send is used as it is', async () => {
    llm.mockResolvedValueOnce(answer([
      { id: 'write', agent: 'alphonso', taskType: 'assistant_write', instruction: 'Write it.', effects: ['write_own_work'], needs: [] },
      { id: 'send', agent: 'marcus', taskType: 'distribution_execution', instruction: 'Post it.', effects: ['publish_or_send'], needs: ['write'] },
    ]));
    const plan = await planJoseRequest('/jose Post a short note that we open at 9 to Slack #news.');
    expect(plan.source).toBe('fresh');
    expect(llm).toHaveBeenCalledTimes(1);
  });

  it('a plan with short_id ids is fixed once, the problem named, then used', async () => {
    llm
      .mockResolvedValueOnce(answer([{ id: 'short_id', agent: 'nova', taskType: 'analysis_x', instruction: 'x', effects: ['read'] }]))
      .mockResolvedValueOnce(answer([{ id: 'judge', agent: 'nova', taskType: 'analysis_x', instruction: 'x', effects: ['read'] }]));
    const plan = await planJoseRequest(PARTY);
    expect(llm).toHaveBeenCalledTimes(2);
    expect(promptOf(1)).toContain('is the example\'s placeholder');
    expect(plan.source).toBe('fresh');
  });
});
