// Nova's step (agent phase 2, owner 2026-10-25): a ranked verdict from her model, with the
// model Jose picked for the step; no keyword scores, no fallback numbers.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const llm = vi.fn();
vi.mock('../lib/ollama', () => ({ generateAgentLlmResponse: (...a) => llm(...a) }));
vi.mock('../services/memoryService', () => ({ pushMemoryItem: vi.fn() }));

import * as nova from '../services/novaAnalysisService';
import { runNovaAnalysis, NOVA_NO_VERDICT } from '../services/novaAnalysisService';

const BAKERY = 'Which of these should a small bakery do first: a weekly email newsletter, a loyalty card, or a podcast? Prioritize them.';
const json = (v) => ({ response: JSON.stringify(v) });
const opt = (name, rank, sources = []) => ({ name, rank, why: `${name} because.`, value: 'high', effort: 'low', risk: 'low', sources });
const stepInput = (over = {}) => ({ instruction: '', request: BAKERY, needs: [], others: [], memory: '', review: null, ...over });
const hectorNeed = { stepId: 'hector', agent: 'hector', text: 'Newsletters cost little [1]. Podcasts take time [2].', files: [], sources: ['https://a.example', 'https://b.example'], cut: 0, main: '', failed: false };

beforeEach(() => { llm.mockReset(); localStorage.clear(); });

describe('Nova gives a ranked verdict', () => {
  it('the verdict is the hand-over', async () => {
    llm.mockResolvedValueOnce(json({ doFirst: 'the newsletter', options: [opt('Email newsletter', 1, [1]), opt('Podcast', 2, [2])], wouldChange: 'a big audience' }));
    const out = await runNovaAnalysis('Should we start a newsletter or a podcast?', { commandId: 'c1', packetId: 'p1', stepId: 'nova' }, {}, { stepInput: stepInput({ request: 'Should we start a newsletter or a podcast?', needs: [hectorNeed] }) });
    expect(out.resultState).toBe('completed');
    expect(out.summary.startsWith('What to do first:')).toBe(true);
    expect(out.schema.options).toHaveLength(2);
    expect(out.artifacts).toEqual([]);
  });

  it('no keyword scores', async () => {
    expect(nova).not.toHaveProperty('computeOpportunityScores');
    expect(nova).not.toHaveProperty('buildNovaFallbackAnalysis');
    llm.mockResolvedValueOnce(json({ doFirst: 'go', options: [opt('Launch to production by email', 1)] }));
    const out = await runNovaAnalysis('Launch to production by email?', { commandId: 'c2' }, {}, { stepInput: stepInput({ request: 'Launch to production by email?' }) });
    expect(out.schema.options[0].risk).toBe('low');
  });

  it('uses the step model', async () => {
    llm.mockResolvedValueOnce(json({ doFirst: 'go', options: [opt('Launch', 1)] }));
    await runNovaAnalysis('Launch?', { commandId: 'c3', packetId: 'pkt-9' }, {}, { stepInput: stepInput({ request: 'Launch?' }) });
    const [agent, options] = llm.mock.calls[0];
    expect(agent).toBe('nova');
    expect(options).not.toHaveProperty('model');
    expect(options).not.toHaveProperty('endpoint');
    expect(options.sessionId).toBeTruthy();
  });

  it('unreadable twice fails', async () => {
    llm.mockResolvedValue({ response: 'I would do the newsletter' });
    const out = await runNovaAnalysis(BAKERY, { commandId: 'c4' }, {}, { stepInput: stepInput() });
    expect(out.resultState).toBe('failed');
    expect(out.summary).toBe(NOVA_NO_VERDICT);
    expect(out.failureReason).toBe(NOVA_NO_VERDICT);
    expect(out.schema).toBeNull();
    expect(llm).toHaveBeenCalledTimes(2);
  });

  it('a left-out option is asked once, then listed not judged', async () => {
    const two = json({ doFirst: 'the newsletter', options: [opt('Email newsletter', 1), opt('Loyalty card', 2)] });
    llm.mockResolvedValueOnce(two).mockResolvedValueOnce(two);
    const out = await runNovaAnalysis(BAKERY, { commandId: 'c5' }, {}, { stepInput: stepInput() });
    expect(llm).toHaveBeenCalledTimes(2);
    expect(llm.mock.calls[1][1].prompt).toContain('You left out: a podcast.');
    const last = out.schema.options[out.schema.options.length - 1];
    expect(last).toMatchObject({ name: 'a podcast', notJudged: true });
    expect(out.summary).toContain('3. a podcast: not judged.');
  });
});
