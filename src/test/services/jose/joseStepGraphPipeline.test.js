import { beforeEach, describe, expect, it, vi } from 'vitest';

// Jose runs plans as step graphs (2026-10-23): several steps per agent, each
// waiting only for the steps it needs, approval decided by declared effects.
vi.mock('../../../services/connectors/connectorImageGenerators', () => ({
  generateComfyUiImage: vi.fn(async () => ({
    ok: true, imageUrls: ['http://localhost/mock.png'], outputPaths: ['/tmp/mock.png']
  }))
}));

vi.mock('../../../services/verificationService', () => ({
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

vi.mock('../../../services/hectorResearchService', () => ({
  createResearchDraft: vi.fn(() => ({ id: 'hector-report-draft' })),
  runHectorLiveResearch: vi.fn(async () => ({
    id: 'hector-report-draft',
    summary: 'Hector mock summary',
    confidenceLevel: 'inferred',
    sources: []
  }))
}));

vi.mock('../../../lib/ollama', () => ({
  generateOllamaResponse: vi.fn(async () => ({
    response: JSON.stringify({ title: 'mock', hook: 'mock', script: 'mock', scenes: [], prompts: [] })
  })),
  fetchOllamaModels: vi.fn(async () => ({ models: [] })),
  PREFERRED_MODEL: 'llama3.2:3b'
}));

vi.mock('../../../services/sentinelGateService', () => ({
  shouldBlock: vi.fn(() => ({ blocked: false, reason: '' })),
  checkSentinelAlerts: vi.fn(() => ({ found: false, alerts: [], output: null }))
}));

vi.mock('../../../services/creativeRoutingService', () => ({
  detectCreativeIntent: vi.fn(() => null),
  routeToCreativeTool: vi.fn(async () => ({ ok: true, tool: 'comfyui' }))
}));

vi.mock('../../../services/novaFeedbackService', () => ({
  storeNovaScore: vi.fn(),
  getDecompositionHints: vi.fn(() => ({ hints: [], score: null }))
}));

vi.mock('../../../services/runtimeLedgerService', () => ({
  persistScopeRows: vi.fn(async () => undefined)
}));

vi.mock('../../../services/chromaDbService', () => ({
  addMemoryToChroma: vi.fn(async () => undefined),
  semanticSearchMemory: vi.fn(async () => []),
  isChromaHealthy: vi.fn(async () => false)
}));

vi.mock('../../../services/contentFactory/contentAgentExecutor', () => ({
  executeContentStepAssignment: vi.fn(async (assignment) => ({
    summary: `${assignment.agent} did ${assignment.stepId}`,
    resultState: 'completed',
    artifacts: [{ type: 'content_step_output', actionType: assignment.actionType, data: { ok: true }, raw: '{}' }],
    sources: [],
    contractAction: assignment.actionType,
  })),
}));

vi.mock('../../../services/codingAgentService', () => ({
  isCodingRequest: vi.fn(() => true),
  runCodingAgent: vi.fn(async () => ({ ok: true, content: 'code' })),
}));

import { runJoseCommandExecutionPipeline, stepCommandText } from '../../../services/joseExecutionEngineService';
import { runCodingAgent } from '../../../services/codingAgentService';
import { createJoseCommandRoute } from '../../../services/joseCommandRouterService';
import { executeContentStepAssignment } from '../../../services/contentFactory/contentAgentExecutor';
import { getStepOutput } from '../../../services/jose/joseStepOutputs';
import { getJoseRequest, createWaitingPlanRequest, claimPlanForRun, listJoseRequests } from '../../../services/jose/joseRequestStore';

function step(agent, actionType, extra = {}) {
  return {
    agent, actionType, title: `Step ${actionType}`, rationale: 'test', riskLevel: 'low',
    requiresApproval: false, commandPreview: 'Writes text only.', fragments: [],
    contentStep: { projectId: 'p1', step: actionType, task: 'x', prior: {} }, ...extra,
  };
}

function run(assignments) {
  return runJoseCommandExecutionPipeline({
    commandText: 'Step graph test', source: 'test', zeroCostMode: true, previewMode: false, assignments,
  });
}

describe('Jose runs plans as step graphs', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(executeContentStepAssignment).mockClear();
    vi.mocked(executeContentStepAssignment).mockImplementation(async (assignment) => ({
      summary: `${assignment.agent} did ${assignment.stepId}`,
      resultState: 'completed',
      artifacts: [{ type: 'content_step_output', actionType: assignment.actionType, data: { ok: true }, raw: '{}' }],
      sources: [],
      contractAction: assignment.actionType,
    }));
  });

  it('gives each step an id, its effects and what it needs', async () => {
    const command = await createJoseCommandRoute({
      commandText: 'x',
      assignments: [step('miya', 'creative_script'), step('miya', 'creative_script'), step('marcus', 'distribution_execution')],
    });
    expect(command.assignments.map((a) => a.stepId)).toEqual(['miya', 'miya-2', 'marcus']);
    expect(command.assignments[0].effects).toEqual(['write_own_work']);
    expect(command.assignments[2].requiresApproval).toBe(true);
  });

  it('runs two steps for the same agent, in order, and keeps both outputs', async () => {
    const result = await run([
      step('miya', 'creative_script', { stepId: 'script' }),
      step('miya', 'creative_script', { stepId: 'revise', needs: ['script'] }),
    ]);
    expect(result.ok).toBe(true);
    expect(result.failedCount).toBe(0);
    const order = vi.mocked(executeContentStepAssignment).mock.calls.map((c) => c[0].stepId);
    expect(order).toEqual(['script', 'revise']);
    expect(getStepOutput(result.commandId, 'script').summary).toBe('miya did script');
    expect(getStepOutput(result.commandId, 'revise').summary).toBe('miya did revise');
  });

  it('holds a step that publishes for approval and runs a read-only one', async () => {
    const result = await run([
      step('nova', 'analysis_market', { effects: ['read'] }),
      step('marcus', 'distribution_execution', { effects: ['publish_or_send'] }),
    ]);
    expect(result.pendingApprovalCount).toBe(1);
    const ran = vi.mocked(executeContentStepAssignment).mock.calls.map((c) => c[0].agent);
    expect(ran).toEqual(['nova']);
  });

  it('lets a step that runs code go ahead: its commands ask one by one', async () => {
    const result = await run([step('alphonso', 'local_operation', { effects: ['run'] })]);
    expect(result.pendingApprovalCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(vi.mocked(executeContentStepAssignment).mock.calls.map((c) => c[0].agent)).toEqual(['alphonso']);
  });

  it('refuses a plan whose steps wait for each other, and runs nothing', async () => {
    const result = await run([
      step('miya', 'creative_script', { stepId: 'a', needs: ['b'] }),
      step('miya', 'creative_script', { stepId: 'b', needs: ['a'] }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('plan_rejected');
    expect(result.problems.join(' ')).toMatch(/cycle/);
    expect(executeContentStepAssignment).not.toHaveBeenCalled();
  });

  it("saves the request with each step's final status", async () => {
    const result = await run([
      step('nova', 'analysis_market', { effects: ['read'] }),
      step('marcus', 'distribution_execution', { effects: ['publish_or_send'] }),
    ]);
    const request = getJoseRequest(`jose-request-${result.commandId}`);
    expect(request.steps.map((s) => [s.stepId, s.status])).toEqual([['nova', 'done'], ['marcus', 'waiting_approval']]);
    expect(request.status).toBe('waiting_approval');
  });

  it('does not run a step whose needed step is still waiting for approval', async () => {
    const result = await run([
      step('marcus', 'distribution_execution', { stepId: 'post', effects: ['publish_or_send'] }),
      step('nova', 'analysis_market', { stepId: 'measure', effects: ['read'], needs: ['post'] }),
    ]);
    expect(vi.mocked(executeContentStepAssignment)).not.toHaveBeenCalled();
    const request = getJoseRequest(`jose-request-${result.commandId}`);
    const measure = request.steps.find((s) => s.stepId === 'measure');
    expect(measure.status).toBe('not_run');
    expect(measure.error).toMatch(/post/);
  });

  it('does not run a step whose needed step failed', async () => {
    vi.mocked(executeContentStepAssignment).mockImplementation(async (assignment) => {
      if (assignment.stepId === 'script') throw new Error('model gave up');
      return { summary: 'ok', resultState: 'completed', artifacts: [], sources: [], contractAction: assignment.actionType };
    });
    const result = await run([
      step('miya', 'creative_script', { stepId: 'script' }),
      step('miya', 'creative_script', { stepId: 'revise', needs: ['script'] }),
    ]);
    expect(vi.mocked(executeContentStepAssignment).mock.calls.map((c) => c[0].stepId).every((id) => id === 'script')).toBe(true);
    expect(result.failedCount).toBe(1);
    const revise = getJoseRequest(`jose-request-${result.commandId}`).steps.find((s) => s.stepId === 'revise');
    expect(revise.status).toBe('not_run');
  });

  it("keeps today's order for free-text requests (Hector before Miya)", async () => {
    const result = await runJoseCommandExecutionPipeline({
      commandText: 'research the latest market and create a creative video script about it',
      source: 'user', zeroCostMode: true, previewMode: false,
    });
    const agents = result.executionReceipts.map((r) => r.agent);
    expect(agents.indexOf('hector')).toBeGreaterThanOrEqual(0);
    expect(agents.indexOf('hector')).toBeLessThan(agents.indexOf('miya'));
  });

  // Phase 2 (2026-10-23).
  it("saves a project-type plan as a project, with how it was planned", async () => {
    const result = await runJoseCommandExecutionPipeline({
      commandText: 'Build it', source: 'test', zeroCostMode: true, previewMode: false,
      assignments: [step('nova', 'analysis_market', { effects: ['read'] })],
      requestKind: 'project', planInfo: { source: 'template', templateId: 'build_app', note: '' },
    });
    const request = getJoseRequest(`jose-request-${result.commandId}`);
    expect(request.kind).toBe('project');
    expect(request.plan).toEqual({ source: 'template', templateId: 'build_app', note: '' });
  });

  it('no longer sends coding requests to the Claude shortcut (owner)', async () => {
    await runJoseCommandExecutionPipeline({ commandText: 'write a function that adds two numbers', source: 'user', zeroCostMode: true, previewMode: false });
    expect(runCodingAgent).not.toHaveBeenCalled();
  });

  it("gives a step its instruction, but Alphonso only the user's own words", () => {
    expect(stepCommandText({ agent: 'hector', instruction: 'Find the pricing.' }, 'Make a page')).toBe('Find the pricing.' + String.fromCharCode(10, 10) + 'The request: Make a page');
    expect(stepCommandText({ agent: 'hector' }, 'Make a page')).toBe('Make a page');
    // Model-written words must never count as what the user asked Alphonso to run.
    expect(stepCommandText({ agent: 'alphonso', instruction: 'run npm test and install everything' }, 'Make a page')).toBe('Make a page');
  });

  it('runs an approved plan on its own saved request', async () => {
    const plan = [{ stepId: 'm', agent: 'nova', actionType: 'analysis_market', effects: ['read'], needs: [] }];
    const waiting = createWaitingPlanRequest({ text: 'x', source: 'user', kind: 'normal', steps: plan, plan: { source: 'fresh', templateId: null, note: '' }, runOptions: { source: 'user' } });
    claimPlanForRun(waiting.id);
    const result = await runJoseCommandExecutionPipeline({
      commandText: 'x', source: 'user', zeroCostMode: true, previewMode: false,
      assignments: [step('nova', 'analysis_market', { stepId: 'm', effects: ['read'] })],
      existingRequestId: waiting.id,
    });
    expect(listJoseRequests()).toHaveLength(1);
    const request = getJoseRequest(waiting.id);
    expect(request.commandId).toBe(result.commandId);
    expect(request.status).toBe('done');
    expect(request.steps[0].status).toBe('done');
  });
});
