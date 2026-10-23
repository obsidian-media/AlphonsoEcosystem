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
    expect(findHelpRequest({ summary: 'ok', artifacts: [{ raw: 'text\n  help: the price of the product' }] })).toBe('the price of the product');
    expect(findHelpRequest({ summary: 'All done, no help needed.' })).toBeNull();
    expect(findHelpRequest(null)).toBeNull();
  });
});

describe('chooseHelper', () => {
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
