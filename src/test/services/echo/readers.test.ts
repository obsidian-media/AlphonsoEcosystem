// Agent phase 7: every agent and every direct answer get the past decisions that matter.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const prompts: string[] = [];
vi.mock('../../../lib/ollama', () => ({
  generateOllamaResponse: vi.fn(async () => ({ response: '{}' })),
  fetchOllamaModels: vi.fn(async () => ({ models: [] })),
  PREFERRED_MODEL: 'llama3.2:3b',
  getConfiguredOllamaModel: () => 'llama3.2:3b',
  getConfiguredOllamaEndpoint: () => 'http://127.0.0.1:11434',
  generateAgentLlmResponse: vi.fn(async (_agent: string, opts: any) => { prompts.push(String(opts?.prompt || '')); return { response: 'Dear Sam, the launch is on Friday the 14th.' }; }),
  withAgentModel: async (_a: string, _m: string, fn: () => unknown) => fn(),
  getAgentModelOverride: () => null,
}));
vi.mock('../../../services/memoryGraphService', () => ({ addNode: vi.fn(async () => null), addEdge: vi.fn(async () => null) }));
vi.mock('../../../services/jose/joseFinish', () => ({ saveRequestDecisions: vi.fn(async () => ({ saved: true, note: '' })) }));

import { runJoseCommandExecutionPipeline } from '../../../services/joseExecutionEngineService';
import { addDecision } from '../../../services/echo/decisions';
import { answerDecisionsBlock } from '../../../services/echo/recall';

const seed = () => {
  addDecision({ kind: 'decision', text: 'The launch is on Friday the 14th at $29.', topics: ['launch', 'price'], source: { surface: 'chat', by: 'you' } } as never);
  addDecision({ kind: 'preference', text: 'Short emails without emojis.', topics: ['email'], appliesTo: ['alphonso'], source: { surface: 'chat', by: 'you' } } as never);
};

beforeEach(() => {
  localStorage.clear();
  prompts.length = 0;
});

describe('a step gets the decisions that matter', () => {
  it("an Alphonso writing step's input has the launch decision and the email preference", async () => {
    seed();
    await runJoseCommandExecutionPipeline({
      commandText: 'Write a short email to Sam about the launch.', source: 'user', zeroCostMode: true,
      assignments: [{ agent: 'alphonso', actionType: 'assistant_write', stepId: 'write', title: 'Write', rationale: 't', riskLevel: 'low', requiresApproval: false, commandPreview: '', fragments: [], effects: ['write_own_work'], needs: [] }],
    });
    const prompt = prompts.find((p) => p.includes('Write a short email to Sam')) || '';
    expect(prompt).toContain('The launch is on Friday the 14th at $29.');
    expect(prompt).toContain('Short emails without emojis.');
  });
});

describe('answerDecisionsBlock', () => {
  it('is "Decisions you saved:" with the matching lines, or empty', async () => {
    seed();
    const block = await answerDecisionsBlock('What did we decide about the launch?');
    expect(block.startsWith('Decisions you saved:\n')).toBe(true);
    expect(block).toContain('The launch is on Friday the 14th at $29.');
    expect(block).toContain('Short emails without emojis.');
    localStorage.clear();
    expect(await answerDecisionsBlock('What did we decide about the launch?')).toBe('');
  });
});
