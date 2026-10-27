import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../lib/ollama', () => ({
  generateAgentLlmResponse: vi.fn(),
}));

import { generateAgentLlmResponse } from '../../../lib/ollama';
import { findHelpRequest, chooseHelper, planHelp } from '../../../services/jose/joseHelp';
import type { PlanStep } from '../../../services/jose/stepGraph';

const llm = vi.mocked(generateAgentLlmResponse);
const says = (value: unknown) => ({ response: typeof value === 'string' ? value : JSON.stringify(value) }) as never;

const plan: PlanStep[] = [
  { stepId: 'script', agent: 'miya', actionType: 'creative_script', effects: ['write_own_work'], needs: [], instruction: 'Write the script.' },
  { stepId: 'campaign', agent: 'miya', actionType: 'creative_campaign', effects: ['write_own_work'], needs: ['script'], instruction: 'Write the campaign.' },
];

beforeEach(() => llm.mockReset());

describe('findHelpRequest', () => {
  it('finds a HELP line in the summary or in an artifact', () => {
    expect(findHelpRequest({ summary: 'Draft done.\nHELP: facts about the launch date' })).toBe('facts about the launch date');
    expect(findHelpRequest({ summary: 'ok', artifacts: [{ raw: 'text\n  HELP: the price of the product' }] })).toBe('the price of the product');
    // Only the exact "HELP:" agents are told to write; a script line "Help: ..." is content.
    expect(findHelpRequest({ summary: 'Help: our customers find us faster.' })).toBeNull();
    expect(findHelpRequest({ summary: 'All done, no help needed.' })).toBeNull();
    expect(findHelpRequest(null)).toBeNull();
  });
});

describe('chooseHelper', () => {
  // Agent phase 6: others can get Alphonso's help, for writing only.
  it('lets Alphonso help with writing, never with code', async () => {
    llm.mockResolvedValueOnce(says({ agent: 'alphonso', taskType: 'assistant_write' }));
    expect(await chooseHelper('the wording of the intro', 'miya')).toEqual({ agent: 'alphonso', actionType: 'assistant_write' });
    llm.mockResolvedValueOnce(says({ agent: 'alphonso', taskType: 'assistant_answer' }));
    expect(await chooseHelper('what a closure is', 'nova')).toEqual({ agent: 'alphonso', actionType: 'assistant_answer' });
    llm.mockResolvedValueOnce(says({ agent: 'alphonso', taskType: 'local_operation' }));
    expect(await chooseHelper('run the build', 'miya')).toBeNull();
  });

  // Agent phase 7: help about something decided before goes to Echo.
  it('the rules send help about an earlier decision to Echo', async () => {
    llm.mockResolvedValueOnce(says('no idea'));
    expect(await chooseHelper('what we decided about pricing', 'nova')).toEqual({ agent: 'echo', actionType: 'memory_recall' });
    expect(String((llm.mock.calls[0][1] as any).prompt)).toContain('echo memory_recall (what was decided before)');
  });

  it("offers Alphonso's writing types to Jose, and the rules send wording to him", async () => {
    llm.mockResolvedValueOnce(says('no idea'));
    expect(await chooseHelper('rewrite the wording of this paragraph', 'nova')).toEqual({ agent: 'alphonso', actionType: 'assistant_write' });
    const prompt = String((llm.mock.calls[0][1] as any).prompt);
    expect(prompt).toContain('alphonso assistant_write or assistant_answer (writing only)');
  });

  it("keeps Jose's choice when it is allowed and safe", async () => {
    llm.mockResolvedValueOnce(says({ agent: 'nova', taskType: 'analysis_timing' }));
    expect(await chooseHelper('when should we post?', 'miya')).toEqual({ agent: 'nova', actionType: 'analysis_timing' });
  });

  it('falls back to the rules when the answer is unusable', async () => {
    llm.mockResolvedValueOnce(says('Hector, I think.'));
    expect(await chooseHelper('facts about the launch date', 'miya')).toEqual({ agent: 'hector', actionType: 'research_report' });
    llm.mockRejectedValueOnce(new Error('down'));
    expect(await chooseHelper('is this accurate?', 'miya')).toEqual({ agent: 'maria', actionType: 'audit_quality' });
  });

  // Agent phase 3: Maria hands a security matter to Sentinel.
  it('a security help request goes to Sentinel', async () => {
    llm.mockRejectedValueOnce(new Error('down'));
    expect(await chooseHelper('security check of the link in the post', 'maria')).toEqual({ agent: 'sentinel', actionType: 'security_review' });
    llm.mockRejectedValueOnce(new Error('down'));
    expect(await chooseHelper('a password appears in the draft', 'maria')).toEqual({ agent: 'sentinel', actionType: 'security_review' });
  });

  it('never lets a help request publish, spend, delete or run code', async () => {
    llm.mockResolvedValueOnce(says({ agent: 'marcus', taskType: 'distribution_execution' }));
    expect(await chooseHelper('publish it to YouTube now', 'miya')).toBeNull();
    llm.mockResolvedValueOnce(says({ agent: 'alphonso', taskType: 'local_operation' }));
    expect(await chooseHelper('run npm install', 'miya')).toBeNull();
  });

  it('does not ask the asking agent to help itself', async () => {
    llm.mockResolvedValueOnce(says({ agent: 'hector', taskType: 'research_report' }));
    expect(await chooseHelper('more sources please', 'hector')).toBeNull();
  });
});

describe('help goes to the owner (agent roles Part A)', () => {
  it('tells Jose what each agent owns', async () => {
    llm.mockResolvedValueOnce(says({ agent: 'hector', taskType: 'research_report' }));
    await chooseHelper('facts about bees', 'miya');
    const prompt = String((llm.mock.calls[0][1] as { prompt: string }).prompt);
    expect(prompt).toContain('hector owns: Finding facts');
    expect(prompt).toContain('nova owns: Judging value');
  });

  it('refuses a helper who does not own the work', async () => {
    llm.mockResolvedValueOnce(says({ agent: 'nova', taskType: 'research_report' }));
    expect(await chooseHelper('find competitors', 'miya')).toBeNull();
  });

  it("by the rules, finding facts is Hector's and judging them Nova's", async () => {
    llm.mockResolvedValueOnce(says('no idea'));
    expect(await chooseHelper('find the competitors in this market', 'miya')).toEqual({ agent: 'hector', actionType: 'research_report' });
    llm.mockResolvedValueOnce(says('no idea'));
    expect(await chooseHelper('when is the best time to post', 'miya')).toEqual({ agent: 'nova', actionType: 'analysis_findings' });
  });
});

describe('planHelp', () => {
  it('adds the helper and a re-run, and moves later steps to the re-run', () => {
    const change = planHelp(plan, plan[0], 'facts about the launch date', { agent: 'hector', actionType: 'research_report' })!;
    expect(change.add.map((s) => s.stepId)).toEqual(['script-help', 'script-again']);
    expect(change.add[0]).toMatchObject({ agent: 'hector', needs: [], instruction: 'facts about the launch date', effects: ['read'] });
    expect(change.add[1]).toMatchObject({ agent: 'miya', needs: ['script', 'script-help'], helpRound: 1 });
    expect(change.add[1].instruction).toMatch(/Write the script\.[\s\S]*Use the help below\./);
    expect(change.rewire).toEqual({ from: ['script'], to: ['script-again'] });
  });

  it('allows one help request per step', () => {
    const again = { ...plan[0], stepId: 'script-again', helpRound: 1 };
    expect(planHelp([...plan, again], again, 'more', { agent: 'hector', actionType: 'research_report' })).toBeNull();
  });
});

// Jose phase 7: a content step's re-run keeps its content data.
describe('help for a content-factory step', () => {
  it('the step that runs again keeps contentStep', () => {
    const step = { stepId: 'script', agent: 'miya', actionType: 'creative_script', effects: ['write_own_work'], needs: [], instruction: 'Write it.', contentStep: { projectId: 'p1', step: 'script' } } as any;
    const change = planHelp([step], step, 'facts on honeybees', { agent: 'hector', actionType: 'research_report' } as any)!;
    const again = change.add.find((s: any) => s.stepId === 'script-again') as any;
    expect(again.contentStep).toEqual({ projectId: 'p1', step: 'script' });
    expect(again.helpRound).toBe(1);
  });
});
