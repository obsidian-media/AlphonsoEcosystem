import { beforeEach, describe, expect, it, vi } from 'vitest';

let _timeoutSpy;

vi.mock('../services/connectors/connectorImageGenerators', () => ({
  generateComfyUiImage: vi.fn(async () => ({
    ok: true, imageUrls: ['http://localhost/mock.png'], outputPaths: ['/tmp/mock.png']
  }))
}));

vi.mock('../services/verificationService', () => ({
  verifyOllamaRuntimeProof: vi.fn(async () => ({
    id: 'runtime-proof-test',
    payload: { reachable: true }
  })),
  verifyProcessProof: vi.fn(async () => ({
    id: 'process-proof-test',
    payload: [{ running: true }]
  })),
  verifyCommandExecution: vi.fn(async () => ({
    payload: { success: true, exitCode: 0, stdout: '', stderr: '' },
    trust: 'verified'
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
    response: JSON.stringify({ title: 'mock', hook: 'mock', script: 'mock', scenes: [], prompts: [] })
  })),
  fetchOllamaModels: vi.fn(async () => ({ models: [] })),
  PREFERRED_MODEL: 'llama3.2:3b'
}));


vi.mock('../services/creativeRoutingService', () => ({
  // Every command looks like an image request, so a skipped early route is visible.
  detectCreativeIntent: vi.fn(() => 'image_generation'),
  routeToCreativeTool: vi.fn(async () => ({ ok: true, tool: 'comfyui' }))
}));


vi.mock('../services/runtimeLedgerService', () => ({
  persistScopeRows: vi.fn(async () => undefined)
}));

vi.mock('../services/chromaDbService', () => ({
  addMemoryToChroma: vi.fn(async () => undefined),
  semanticSearchMemory: vi.fn(async () => []),
  isChromaHealthy: vi.fn(async () => false)
}));

vi.mock('../services/agentOutputStoreService', () => ({
  setAgentOutput: vi.fn(),
  getPriorOutputs: vi.fn(() => ({})),
  buildExecutionPlan: vi.fn((assignments) => {
    if (!Array.isArray(assignments) || assignments.length === 0) return { waves: [], assignmentMap: {} };
    const assignmentMap = {};
    for (const a of assignments) {
      if (a.agent) assignmentMap[a.agent] = a;
    }
    return { waves: [Object.keys(assignmentMap)], assignmentMap };
  }),
  AGENT_DEPENDENCIES: {
    hector: [], maria: [], sentinel: [], nova: [], jose: [],
    miya: ['hector'], alphonso: ['miya'], marcus: ['maria'],
    echo: ['hector', 'miya', 'maria', 'marcus', 'nova', 'sentinel', 'alphonso']
  }
}));

vi.mock('../services/contentFactory/contentAgentExecutor', () => ({
  executeContentStepAssignment: vi.fn(async (assignment) => ({
    summary: `${assignment.agent} did ${assignment.actionType}`,
    resultState: 'completed',
    artifacts: [{ type: 'content_step_output', actionType: assignment.actionType, data: { ok: true }, raw: '{}' }],
    sources: [],
    contractAction: assignment.actionType,
  })),
}));

import { runJoseCommandExecutionPipeline } from '../services/joseExecutionEngineService';
import { createJoseCommandRoute } from '../services/joseCommandRouterService';
import { generateComfyUiImage } from '../services/connectors/connectorImageGenerators';
import { executeContentStepAssignment } from '../services/contentFactory/contentAgentExecutor';

// Callers that already know which agent does what (the content factory) give
// Jose explicit assignments instead of free text to split up (2026-10-22).
function assignment(agent, actionType, extra = {}) {
  return {
    agent, actionType, title: `Content ${actionType}`, rationale: 'content factory step',
    riskLevel: 'low', requiresApproval: false, commandPreview: 'Writes text only.', fragments: [], ...extra,
  };
}

describe('Jose with explicit assignments', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(generateComfyUiImage).mockClear();
    vi.mocked(executeContentStepAssignment).mockClear();
  });

  it('uses the given assignments instead of splitting the text', async () => {
    const command = await createJoseCommandRoute({
      commandText: 'Content factory: research for "Launch"',
      assignments: [assignment('hector', 'research_virality'), assignment('nova', 'analysis_market')],
    });
    expect(command.assignments.map((a) => a.agent)).toEqual(['hector', 'nova']);
    expect(command.assignments.map((a) => a.title)).toEqual(['Content research_virality', 'Content analysis_market']);
  });

  it('skips the image shortcut when assignments are given', async () => {
    const result = await runJoseCommandExecutionPipeline({
      commandText: 'Content factory: thumbnail for "make an image"',
      source: 'content-factory',
      zeroCostMode: true,
      previewMode: false,
      assignments: [assignment('miya', 'creative_thumbnails', { contentStep: { projectId: 'p1', step: 'thumbnail', task: 'x', prior: {} } })],
    });
    expect(generateComfyUiImage).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('sends a content step to the content executor', async () => {
    const result = await runJoseCommandExecutionPipeline({
      commandText: 'Content factory: script for "Launch"',
      source: 'content-factory',
      zeroCostMode: true,
      previewMode: false,
      assignments: [assignment('miya', 'creative_script', { contentStep: { projectId: 'p1', step: 'script', task: 'Write it', prior: {} } })],
    });
    expect(executeContentStepAssignment).toHaveBeenCalledTimes(1);
    expect(vi.mocked(executeContentStepAssignment).mock.calls[0][0].actionType).toBe('creative_script');
    expect(result.failedCount).toBe(0);
  });

  it('without assignments, still takes the image shortcut as before', async () => {
    await runJoseCommandExecutionPipeline({ commandText: 'make an image of a llama', source: 'user', zeroCostMode: true });
    expect(generateComfyUiImage).toHaveBeenCalledTimes(1);
  });
});
