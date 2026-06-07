import { beforeEach, describe, expect, it, vi } from 'vitest';

let runtimeReachable = true;
let ollamaAvailable = true;

vi.mock('../services/runtimeLedgerService', () => ({
  persistScopeRows: vi.fn(async () => undefined)
}));

const mockSetAgentOutput = vi.fn();
const mockGetPriorOutputs = vi.fn(() => ({}));
const mockBuildExecutionPlan = vi.fn((assignments) => {
  if (!Array.isArray(assignments) || assignments.length === 0) return { waves: [], assignmentMap: {} };
  const assignmentMap = {};
  for (const a of assignments) {
    if (a.agent) assignmentMap[a.agent] = a;
  }
  return { waves: [Object.keys(assignmentMap)], assignmentMap };
});

vi.mock('../services/agentOutputStoreService', () => ({
  setAgentOutput: (...args) => mockSetAgentOutput(...args),
  getPriorOutputs: (...args) => mockGetPriorOutputs(...args),
  buildExecutionPlan: (...args) => mockBuildExecutionPlan(...args),
  AGENT_DEPENDENCIES: {
    hector: [], maria: [], sentinel: [], nova: [], jose: [],
    miya: ['hector'], alphonso: ['miya'], marcus: ['maria'],
    echo: ['hector', 'miya', 'maria', 'marcus', 'nova', 'sentinel', 'alphonso']
  }
}));

vi.mock('../services/verificationService', () => ({
  verifyOllamaRuntimeProof: vi.fn(async () => ({
    id: 'runtime-proof-test',
    payload: { reachable: runtimeReachable }
  })),
  verifyProcessProof: vi.fn(async () => ({
    id: 'process-proof-test',
    payload: [{ running: runtimeReachable }]
  }))
}));

vi.mock('../services/hectorResearchService', () => ({
  createResearchDraft: vi.fn(() => ({ id: 'hector-report-draft' })),
  runHectorLiveResearch: vi.fn(async () => ({
    id: 'hector-report-draft',
    summary: 'Hector mock summary',
    confidenceLevel: 'inferred',
    sources: []
  }))
}));

vi.mock('../lib/ollama', () => ({
  generateOllamaResponse: vi.fn(async () => ({
    response: JSON.stringify({
      title: 'LLM Generated Title',
      hook: 'LLM hook line',
      script: 'Full LLM script',
      scenes: ['Scene A from LLM', 'Scene B from LLM'],
      prompts: ['Prompt 1 from LLM', 'Prompt 2 from LLM']
    })
  })),
  fetchOllamaModels: vi.fn(async () => ({
    models: ollamaAvailable ? [{ name: 'llama3.2:3b' }] : []
  })),
  PREFERRED_MODEL: 'llama3.2:3b'
}));

const mockMemoryItems = [
  { id: 'mem-1', title: 'Space exploration project plan', category: 'project_memory', content: 'Mars colony timeline' },
  { id: 'mem-2', title: 'Creative video about AI', category: 'creative_memory', content: 'Script for AI documentary' },
  { id: 'mem-3', title: 'Research on local LLMs', category: 'research_memory', content: 'Ollama vs llama.cpp comparison' }
];

vi.mock('../services/memoryService', () => ({
  pushMemoryItem: vi.fn(),
  listMemoryItems: vi.fn(() => mockMemoryItems)
}));

import {
  draftPrompt,
  parseJsonResponse,
  retrieveRelevantContext,
  getDLQ,
  isJoseIntakeCommand,
  retryDLQ,
  runJoseCommandExecutionPipeline
} from '../services/joseExecutionEngineService';

describe('jose intake command detection', () => {
  it('matches jose-prefixed commands', () => {
    expect(isJoseIntakeCommand('ask jose: route this task')).toBe(true);
    expect(isJoseIntakeCommand('/jose build a workflow')).toBe(true);
    expect(isJoseIntakeCommand('jose please run this through agents')).toBe(true);
  });

  it('does not match regular prompts', () => {
    expect(isJoseIntakeCommand('explain tauri updater')).toBe(false);
    expect(isJoseIntakeCommand('ask hector for docs')).toBe(false);
  });
});

describe('jose execution retries and dlq', () => {
  beforeEach(() => {
    localStorage.clear();
    runtimeReachable = false;
  });

  it('retries failed assignments and moves them to the dlq', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback) => {
      callback();
      return 0;
    });

    const result = await runJoseCommandExecutionPipeline({
      commandText: 'ask jose: verify local runtime package',
      source: 'shayan',
      zeroCostMode: true
    });

    setTimeoutSpy.mockRestore();

    expect(result.ok).toBe(true);
    expect(result.failedCount).toBeGreaterThan(0);

    const dlq = getDLQ();
    expect(dlq).toHaveLength(1);
    expect(dlq[0].taskId).toBeTruthy();
    expect(dlq[0].attempts).toBe(4);
    expect(dlq[0].error).toBeTruthy();

    runtimeReachable = true;

    const retrySpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback) => {
      callback();
      return 0;
    });
    const retryResult = await retryDLQ(dlq[0].taskId);
    retrySpy.mockRestore();

    expect(retryResult.ok).toBe(true);
    expect(getDLQ()).toHaveLength(0);
  });
});

describe('draftPrompt', () => {
  it('builds a miya prompt with task and context', () => {
    const prompt = draftPrompt('miya', 'Create a video about AI', { snippet: 'Prior work on AI topics' });
    expect(prompt).toContain('Miya');
    expect(prompt).toContain('Create a video about AI');
    expect(prompt).toContain('Prior work on AI topics');
    expect(prompt).toContain('JSON');
  });

  it('builds a hector prompt with task', () => {
    const prompt = draftPrompt('hector', 'Research local LLMs');
    expect(prompt).toContain('Hector');
    expect(prompt).toContain('Research local LLMs');
    expect(prompt).toContain('briefing');
  });

  it('builds a generic prompt for unknown agents', () => {
    const prompt = draftPrompt('unknown', 'Do something');
    expect(prompt).toContain('Do something');
  });
});

describe('parseJsonResponse', () => {
  it('parses plain JSON', () => {
    const result = parseJsonResponse('{"title":"test"}');
    expect(result).toEqual({ title: 'test' });
  });

  it('parses JSON wrapped in markdown fences', () => {
    const result = parseJsonResponse('```json\n{"title":"fenced"}\n```');
    expect(result).toEqual({ title: 'fenced' });
  });

  it('parses JSON wrapped in generic fences', () => {
    const result = parseJsonResponse('```\n{"title":"generic"}\n```');
    expect(result).toEqual({ title: 'generic' });
  });

  it('throws on invalid JSON', () => {
    expect(() => parseJsonResponse('not json')).toThrow();
  });
});

describe('LLM-powered agent drafting', () => {
  beforeEach(() => {
    localStorage.clear();
    runtimeReachable = true;
    ollamaAvailable = true;
  });

  it('uses LLM-generated package when Ollama is available', async () => {
    const result = await runJoseCommandExecutionPipeline({
      commandText: 'ask jose: create a creative package about space exploration',
      source: 'shayan',
      endpoint: 'http://localhost:11434',
      zeroCostMode: true
    });

    expect(result.ok).toBe(true);
  });

  it('falls back to template when Ollama is unavailable', async () => {
    ollamaAvailable = false;

    const result = await runJoseCommandExecutionPipeline({
      commandText: 'ask jose: create a creative package about space exploration',
      source: 'shayan',
      endpoint: 'http://localhost:11434',
      zeroCostMode: true
    });

    expect(result.ok).toBe(true);
  });
});

describe('retrieveRelevantContext', () => {
  it('returns empty snippet for empty query', () => {
    const result = retrieveRelevantContext('', mockMemoryItems);
    expect(result.snippet).toBe('');
    expect(result.items).toHaveLength(0);
  });

  it('returns empty snippet for empty memory', () => {
    const result = retrieveRelevantContext('space exploration', []);
    expect(result.snippet).toBe('');
    expect(result.items).toHaveLength(0);
  });

  it('returns empty snippet when no words match', () => {
    const result = retrieveRelevantContext('xyzzy foobar', mockMemoryItems);
    expect(result.snippet).toBe('');
    expect(result.items).toHaveLength(0);
  });

  it('matches memory items by title substring', () => {
    const result = retrieveRelevantContext('space exploration project', mockMemoryItems);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0].title).toContain('Space exploration');
  });

  it('matches memory items by content substring', () => {
    const result = retrieveRelevantContext('Mars colony timeline', mockMemoryItems);
    expect(result.items.length).toBeGreaterThan(0);
  });

  it('returns max 3 items', () => {
    const manyItems = Array.from({ length: 10 }, (_, i) => ({
      id: `mem-${i}`,
      title: `Space project ${i}`,
      category: 'project_memory',
      content: 'space details'
    }));
    const result = retrieveRelevantContext('space project', manyItems);
    expect(result.items.length).toBeLessThanOrEqual(3);
  });

  it('scores title matches higher than content matches', () => {
    const items = [
      { id: 'mem-1', title: 'Unrelated title', category: 'memory', content: 'space exploration details here' },
      { id: 'mem-2', title: 'Space exploration project', category: 'memory', content: 'unrelated content' }
    ];
    const result = retrieveRelevantContext('space exploration', items);
    expect(result.items[0].id).toBe('mem-2');
  });

  it('builds a snippet from matched items', () => {
    const result = retrieveRelevantContext('space exploration', mockMemoryItems);
    expect(result.snippet).toContain('[project_memory]');
    expect(result.snippet).toContain('Space exploration');
  });

  it('returns items with id, title, category, score', () => {
    const result = retrieveRelevantContext('space exploration', mockMemoryItems);
    expect(result.items[0]).toHaveProperty('id');
    expect(result.items[0]).toHaveProperty('title');
    expect(result.items[0]).toHaveProperty('category');
    expect(result.items[0]).toHaveProperty('score');
  });

  it('filters out short query words (<=3 chars)', () => {
    const result = retrieveRelevantContext('the a an', mockMemoryItems);
    expect(result.snippet).toBe('');
    expect(result.items).toHaveLength(0);
  });
});

describe('dependency-aware execution', () => {
  beforeEach(() => {
    localStorage.clear();
    runtimeReachable = true;
    ollamaAvailable = true;
    mockSetAgentOutput.mockClear();
    mockGetPriorOutputs.mockClear();
    mockBuildExecutionPlan.mockImplementation((assignments) => {
      if (!Array.isArray(assignments) || assignments.length === 0) return { waves: [], assignmentMap: {} };
      const assignmentMap = {};
      for (const a of assignments) {
        if (a.agent) assignmentMap[a.agent] = a;
      }
      return { waves: [Object.keys(assignmentMap)], assignmentMap };
    });
  });

  it('calls setAgentOutput after each successful agent execution', async () => {
    const result = await runJoseCommandExecutionPipeline({
      commandText: 'ask jose: verify local runtime package',
      source: 'shayan',
      zeroCostMode: true
    });

    expect(result.ok).toBe(true);
    expect(mockSetAgentOutput).toHaveBeenCalled();
    const lastCall = mockSetAgentOutput.mock.calls[mockSetAgentOutput.mock.calls.length - 1];
    expect(lastCall[0]).toBeTruthy();
    expect(lastCall[1]).toBeTruthy();
    expect(lastCall[2]).toHaveProperty('summary');
  });

  it('passes priorOutputs to executeAssignmentWithRetries', async () => {
    mockGetPriorOutputs.mockReturnValue({ hector: { summary: 'research context' } });

    const result = await runJoseCommandExecutionPipeline({
      commandText: 'ask jose: create a creative package about space exploration',
      source: 'shayan',
      endpoint: 'http://localhost:11434',
      zeroCostMode: true
    });

    expect(result.ok).toBe(true);
    expect(mockGetPriorOutputs).toHaveBeenCalled();
  });

  it('uses buildExecutionPlan to determine execution order', async () => {
    const planSpy = vi.fn((assignments) => {
      if (!Array.isArray(assignments) || assignments.length === 0) return { waves: [], assignmentMap: {} };
      const assignmentMap = {};
      for (const a of assignments) {
        if (a.agent) assignmentMap[a.agent] = a;
      }
      return { waves: [Object.keys(assignmentMap)], assignmentMap };
    });
    mockBuildExecutionPlan.mockImplementation(planSpy);

    const result = await runJoseCommandExecutionPipeline({
      commandText: 'ask jose: verify local runtime package',
      source: 'shayan',
      zeroCostMode: true
    });

    expect(result.ok).toBe(true);
    expect(planSpy).toHaveBeenCalled();
  });

  it('Miya executor receives Hector research as context when priorOutputs available', async () => {
    mockGetPriorOutputs.mockReturnValue({ hector: { summary: 'Hector found 3 key findings about AI safety' } });

    const result = await runJoseCommandExecutionPipeline({
      commandText: 'ask jose: create a creative package about AI safety',
      source: 'shayan',
      endpoint: 'http://localhost:11434',
      zeroCostMode: true
    });

    expect(result.ok).toBe(true);
    expect(mockSetAgentOutput).toHaveBeenCalled();
  });

  it('Echo executor preserves all prior agent outputs', async () => {
    mockGetPriorOutputs.mockReturnValue({
      hector: { summary: 'research done' },
      miya: { summary: 'creative done' },
      maria: { summary: 'governance done' }
    });

    const result = await runJoseCommandExecutionPipeline({
      commandText: 'ask jose: verify local runtime and preserve context',
      source: 'shayan',
      zeroCostMode: true
    });

    expect(result.ok).toBe(true);
  });

  it('returns executionReceipts with agent field', async () => {
    const result = await runJoseCommandExecutionPipeline({
      commandText: 'ask jose: verify local runtime package',
      source: 'shayan',
      zeroCostMode: true
    });

    expect(result.ok).toBe(true);
    expect(result.executionReceipts).toBeDefined();
    expect(Array.isArray(result.executionReceipts)).toBe(true);
    for (const receipt of result.executionReceipts) {
      expect(receipt).toHaveProperty('agent');
    }
  });
});
