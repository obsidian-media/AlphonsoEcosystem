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
  // A finished research run (agent phase 1): status, the report and its hand-over text.
  runHectorLiveResearch: vi.fn(async () => ({
    id: 'hector-report-draft',
    status: 'research_done',
    summary: 'Hector mock summary',
    text: 'Hector mock summary\n\nSources:\n[1] Mock — https://example.com (Read)',
    research: { answer: 'Hector mock summary', subQuestions: [], disagreements: [], notFound: [], sources: [{ n: 1, title: 'Mock', url: 'https://example.com', kind: 'general', label: 'read', excerpt: '' }], rounds: 1, providers: [] },
    confidenceLevel: 'inferred',
    sources: []
  }))
}));

vi.mock('../lib/ollama', () => ({
  generateOllamaResponse: vi.fn(async () => ({
    response: JSON.stringify({ title: 'mock', hook: 'mock', script: 'mock', scenes: [], prompts: [] })
  })),
  fetchOllamaModels: vi.fn(async () => ({ models: [] })),
  PREFERRED_MODEL: 'llama3.2:3b',
  getConfiguredOllamaModel: () => 'llama3.2:3b',
  // Nova answers with a ranked verdict from her model (agent phase 2); the other agents
  // keep the path they had in this test (no agent model call).
  generateAgentLlmResponse: vi.fn(async (agent) => {
    if (agent === 'nova') return { response: JSON.stringify({ doFirst: 'the launch', options: [{ name: 'The launch', rank: 1, why: 'ready', value: 'high', effort: 'low', risk: 'low' }] }) };
    // Maria's plan review (agent phase 3).
    if (agent === 'maria') return { response: JSON.stringify({ risk: 'low', why: 'Nothing is sent.', rules: [], points: ['Nothing leaves this computer.'], needsApproval: false, approvalReasons: [], offer: '' }) };
    throw new Error('no agent model in this test');
  })
}));

vi.mock('../services/sentinelGateService', () => ({
  shouldBlock: vi.fn(() => ({ blocked: false, reason: '' })),
  checkSentinelAlerts: vi.fn(() => ({ found: false, alerts: [], output: null }))
}));

vi.mock('../services/creativeRoutingService', () => ({
  detectCreativeIntent: vi.fn(() => null),
  routeToCreativeTool: vi.fn(async () => null)
}));

vi.mock('../services/novaFeedbackService', () => ({
  storeNovaScore: vi.fn(),
  getDecompositionHints: vi.fn(() => ({ hints: [], score: null }))
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

import { runJoseCommandExecutionPipeline } from '../services/joseExecutionEngineService';
import { listOrchestrationReceipts } from '../services/orchestrationReceiptService';

describe('jose execution pipeline e2e', () => {
  beforeEach(() => {
    localStorage.clear();
    _timeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((cb) => { cb(); return 0; });
  });
  afterEach(() => {
    if (_timeoutSpy) _timeoutSpy.mockRestore();
  });

  it('decomposes, executes safe assignments, and emits merge report receipts', async () => {
    const result = await runJoseCommandExecutionPipeline({
      commandText: 'ask jose: create a launch script and verify local runtime package',
      source: 'user',
      zeroCostMode: true
    });

    expect(result.ok).toBe(true);
    expect(result.commandId).toBeTruthy();
    expect(result.executedCount).toBeGreaterThan(0);
    // The closing summary (agent roles Part A): one line per step, then the board.
    expect(result.command?.userReport?.summary).toContain('Open on the board.');
    expect(result.command?.userReport?.summary).not.toContain('Jose merged');

    const receipts = listOrchestrationReceipts({ commandId: result.commandId });
    const types = receipts.map((item) => item.eventType);
    expect(types).toContain('assignment_created');
    expect(types).toContain('pipeline_completed');
    expect(types).toContain('jose_merge_confirm_reported');
  });

  it('executes low-risk specialist agents without noisy approval or contract failures', async () => {
    const result = await runJoseCommandExecutionPipeline({
      commandText: 'ask jose: research launch positioning, create a campaign image prompt, audit approval policy, check security permissions, remember this decision, and score the opportunity priority',
      source: 'user',
      zeroCostMode: true
    });

    expect(result.ok).toBe(true);
    expect(result.failedCount).toBe(0);
    expect(result.pendingApprovalCount).toBe(0);
    expect(result.executedCount).toBeGreaterThanOrEqual(6);

    const summaries = result.command?.userReport?.assignmentSummaries || [];
    expect(summaries.map((item) => item.agent)).toEqual(expect.arrayContaining([
      'hector', 'miya', 'maria', 'sentinel', 'echo', 'nova'
    ]));
    expect(summaries.every((item) => item.reportStatus !== 'not_reported')).toBe(true);
    expect(result.command?.userReport?.contractFailures || []).toHaveLength(0);
  });
});

