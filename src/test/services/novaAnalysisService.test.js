// Nova's step (agent phase 2): with nothing to judge she asks Hector through the help line;
// each verdict is saved once, with one memory note; the engine stores no keyword score.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const llm = vi.fn();
const pushMemoryItem = vi.fn();
const appendSessionEvent = vi.fn();
const appendOrchestrationReceipt = vi.fn();
vi.mock('../../lib/ollama', () => ({ generateAgentLlmResponse: (...a) => llm(...a) }));
vi.mock('../../services/memoryService', () => ({ pushMemoryItem: (...a) => pushMemoryItem(...a) }));
vi.mock('../../services/sessionIntelligenceService', () => ({ appendSessionEvent: (...a) => appendSessionEvent(...a) }));
vi.mock('../../services/orchestrationReceiptService', () => ({ appendOrchestrationReceipt: (...a) => appendOrchestrationReceipt(...a) }));

import { runNovaAnalysis } from '../../services/novaAnalysisService';
import { findHelpRequest } from '../../services/jose/joseHelp';
import { listVerdicts } from '../../services/nova/novaVerdicts';

const json = (v) => ({ response: JSON.stringify(v) });
const input = (over = {}) => ({ instruction: '', request: 'What should my bakery do to get more customers?', needs: [], others: [], memory: '', review: null, ...over });
const verdict = json({ doFirst: 'a loyalty card', options: [{ name: 'Loyalty card', rank: 1, why: 'brings regulars back', value: 'high', effort: 'low', risk: 'low' }] });

beforeEach(() => { llm.mockReset(); pushMemoryItem.mockReset(); appendSessionEvent.mockReset(); appendOrchestrationReceipt.mockReset(); localStorage.clear(); });

describe('nothing to judge', () => {
  it('nothing to judge asks for research', async () => {
    llm.mockResolvedValueOnce({ response: 'HELP: research what small bakeries spend on marketing' });
    const out = await runNovaAnalysis('x', { commandId: 'c1', stepId: 'nova' }, {}, { stepInput: input() });
    expect(llm.mock.calls[0][1].prompt).toContain('HELP: research');
    expect(out.resultState).toBe('completed');
    expect(findHelpRequest(out)).toBe('research what small bakeries spend on marketing');
    expect(listVerdicts()).toEqual([]);
  });

  it('failed needs count as nothing to judge', async () => {
    llm.mockResolvedValueOnce({ response: 'HELP: research bakery marketing' });
    const failedHector = { stepId: 'hector', agent: 'hector', text: 'No search engine found anything.', files: [], sources: [], cut: 0, main: '', failed: true };
    await runNovaAnalysis('x', { commandId: 'c2' }, {}, { stepInput: input({ needs: [failedHector] }) });
    expect(llm.mock.calls[0][1].prompt).toContain('HELP: research');
  });

  it('a help round never asks for help again', async () => {
    llm.mockResolvedValueOnce(verdict);
    const out = await runNovaAnalysis('x', { commandId: 'c3', helpRound: 1 }, {}, { stepInput: input() });
    expect(llm.mock.calls[0][1].prompt).not.toContain('HELP:');
    expect(out.schema.fromRequestOnly).toBe(true);
    expect(out.summary.split('\n')[0]).toBe('Judged from your request only.');
  });
});

describe('what is kept', () => {
  it('saves the verdict and one memory note', async () => {
    llm.mockResolvedValueOnce(verdict);
    await runNovaAnalysis('x', { commandId: 'c4', packetId: 'p4', helpRound: 1 }, {}, { stepInput: input() });
    expect(listVerdicts()[0]).toMatchObject({ doFirst: 'a loyalty card', commandId: 'c4', about: 'What should my bakery do to get more customers?' });
    expect(pushMemoryItem).toHaveBeenCalledTimes(1);
    expect(pushMemoryItem.mock.calls[0][0]).toMatchObject({ title: 'Nova: What should my bakery do to get more customers? — do first: a loyalty card', confidence: 'inferred' });
    expect(appendSessionEvent).not.toHaveBeenCalled();
    expect(appendOrchestrationReceipt).not.toHaveBeenCalled();
  });

  // Final review: the engine passes the command id in options, not on the assignment.
  it('saves the verdict under the command id the engine passes', async () => {
    llm.mockResolvedValueOnce(verdict);
    await runNovaAnalysis('x', { packetId: 'p5', helpRound: 1 }, {}, { stepInput: input(), commandId: 'cmd-from-engine' });
    expect(listVerdicts()[0].commandId).toBe('cmd-from-engine');
  });

  it('the engine stores no score after a Nova step', () => {
    const engine = readFileSync('src/services/joseExecutionEngineService.ts', 'utf8');
    expect(engine).not.toContain('extractNovaScore');
  });
});
