import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/ollama', () => ({
  generateAgentLlmResponse: vi.fn(),
}));

import { generateAgentLlmResponse } from '../../../lib/ollama';
import { executeContentStepAssignment } from '../../../services/contentFactory/contentAgentExecutor';

const good = JSON.stringify({ hookScore: 8, scriptScore: 7, notes: ['clear'], mustFix: [] });

function assignment(actionType = 'analysis_content_review', agent = 'nova'): never {
  return {
    agent,
    actionType,
    contentStep: {
      projectId: 'p1', step: 'review', task: 'Review it.', prior: {},
      brief: { idea: 'Idea', platforms: [], outputs: [], format: 'story', lengthSec: 30, notes: '', writeInMyVoice: false, showEverything: false },
      brand: { name: 'B', palette: [], references: [{ url: 'https://ref.example', note: '' }], lessons: [], pastScripts: '' },
    },
  } as never;
}

// Braces matter: a function returned from beforeEach is run as cleanup after
// each test, and mockReset() returns the mock itself.
beforeEach(() => { vi.mocked(generateAgentLlmResponse).mockReset(); });

describe('executeContentStepAssignment', () => {
  it('asks the assignment\'s own agent for JSON and returns the parsed answer', async () => {
    vi.mocked(generateAgentLlmResponse).mockResolvedValue({ response: good, done: true });
    const result = await executeContentStepAssignment(assignment());
    expect(result.resultState).toBe('completed');
    expect(result.artifacts[0]).toMatchObject({ type: 'content_step_output', actionType: 'analysis_content_review', data: { hookScore: 8 } });
    const [agent, options] = vi.mocked(generateAgentLlmResponse).mock.calls[0];
    expect(agent).toBe('nova');
    expect(options).toMatchObject({ format: 'json', sessionId: 'content:p1:review' });
    expect(options.prompt).toContain('Return JSON only');
  });

  it('asks again once when the first answer cannot be read', async () => {
    vi.mocked(generateAgentLlmResponse)
      .mockResolvedValueOnce({ response: 'Sure! Here is my review.', done: true })
      .mockResolvedValueOnce({ response: good, done: true });
    const result = await executeContentStepAssignment(assignment());
    expect(result.resultState).toBe('completed');
    expect(generateAgentLlmResponse).toHaveBeenCalledTimes(2);
    expect(vi.mocked(generateAgentLlmResponse).mock.calls[1][1].prompt).toContain('could not be read');
  });

  it('fails, saying so, when both answers cannot be read', async () => {
    vi.mocked(generateAgentLlmResponse).mockResolvedValue({ response: 'no json here', done: true });
    const result = await executeContentStepAssignment(assignment());
    expect(result.resultState).toBe('failed');
    expect(result.failureReason).toBe("The model's answer could not be read.");
    expect(result.artifacts[0].raw).toBe('no json here');
    expect(result.summary).toContain("could not be read");
  });

  it('fails with the error when the model cannot be reached', async () => {
    vi.mocked(generateAgentLlmResponse).mockImplementation(async () => { throw new Error('Ollama is not running'); });
    const result = await executeContentStepAssignment(assignment());
    expect(result.resultState).toBe('failed');
    expect(result.failureReason).toContain('Ollama is not running');
  });

  it('lists research reference links as sources', async () => {
    const research = JSON.stringify({
      references: [1, 2, 3].map((n) => ({ title: `T${n}`, url: `https://r${n}.example`, whyItWorks: 'w', hook: 'h' })),
      patterns: ['a', 'b', 'c'], hookIdeas: ['x', 'y', 'z'],
    });
    vi.mocked(generateAgentLlmResponse).mockResolvedValue({ response: research, done: true });
    const result = await executeContentStepAssignment(assignment('research_virality', 'hector'));
    expect(result.sources).toEqual(['https://r1.example', 'https://r2.example', 'https://r3.example']);
  });
});
