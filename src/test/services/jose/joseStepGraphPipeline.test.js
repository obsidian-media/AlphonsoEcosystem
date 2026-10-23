import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  PREFERRED_MODEL: 'llama3.2:3b',
  getConfiguredOllamaModel: () => 'llama3.2:3b',
  // Review verdicts (phase 4): a queue the tests fill; anything else gets a plain answer.
  generateAgentLlmResponse: vi.fn(async (_agent, { prompt }) => {
    if (/Did your review ask for changes/.test(prompt)) {
      const verdict = (globalThis.__joseVerdicts || []).shift() || 'pass';
      return { response: JSON.stringify({ verdict, findings: verdict === 'fix' ? ['The hook is weak.'] : [] }) };
    }
    return { response: JSON.stringify({ summary: 'done', title: 'x', hook: 'x', script: 'x', scenes: [], prompts: [] }) };
  }),
  getConfiguredOllamaEndpoint: () => globalThis.__joseEndpoint || 'http://127.0.0.1:11434',
  // The per-step model in force, for the escalation tests (phase 4).
  withAgentModel: vi.fn(async (_agent, model, fn) => {
    globalThis.__joseStepModel = model;
    try { return await fn(); } finally { globalThis.__joseStepModel = null; }
  }),
}));

vi.mock('../../../services/jose/joseModels', async (importOriginal) => ({
  ...(await importOriginal()),
  listInstalledModels: vi.fn(async () => globalThis.__joseInstalledModels || []),
}));

// Paid models (phase 4): whether one is available is set per test.
vi.mock('../../../services/jose/joseSpend', async (importOriginal) => ({
  ...(await importOriginal()),
  paidModelAvailable: () => globalThis.__josePaid || { ok: false, reason: 'Paid models are off in Settings.' },
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

import { runJoseCommandExecutionPipeline, stepCommandText, executeApprovedPackets, approveRequestStep } from '../../../services/joseExecutionEngineService';
import { createAgentPacket } from '../../../services/agentBusService';
import { fetchOllamaModels } from '../../../lib/ollama';
import { runCodingAgent } from '../../../services/codingAgentService';
import { createJoseCommandRoute, listJoseCommands } from '../../../services/joseCommandRouterService';
import { executeContentStepAssignment } from '../../../services/contentFactory/contentAgentExecutor';
import { getStepOutput } from '../../../services/jose/joseStepOutputs';
import { setPlanAdapterForTests } from '../../../services/jose/joseAdapt';
import { getJoseRequest, createWaitingPlanRequest, claimPlanForRun, listJoseRequests, setJoseRequestStatus, findRequestByPacket } from '../../../services/jose/joseRequestStore';

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
    const text = stepCommandText({ agent: 'hector', instruction: 'Find the pricing.' }, 'Make a page');
    expect(text.startsWith('Find the pricing.' + String.fromCharCode(10, 10) + 'The request: Make a page')).toBe(true);
    // Phase 4: a planned step is told how to ask for help.
    expect(text).toMatch(/HELP:/);
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

  // Phase 4: retry, then the same agent with a larger installed model.
  it('tries a larger installed model when a step keeps failing', async () => {
    globalThis.__joseInstalledModels = ['llama3.2:3b', 'qwen2.5:7b'];
    vi.mocked(executeContentStepAssignment).mockImplementation(async (assignment) => {
      if (globalThis.__joseStepModel !== 'qwen2.5:7b') throw new Error('small model gave up');
      return { summary: 'done with the larger model', resultState: 'completed', artifacts: [], sources: [], contractAction: assignment.actionType };
    });
    const result = await run([step('nova', 'analysis_market', { stepId: 'value', effects: ['read'] })]);
    globalThis.__joseInstalledModels = [];
    expect(result.failedCount).toBe(0);
    expect(result.executionReceipts[0]).toMatchObject({ status: 'executed', escalatedTo: 'qwen2.5:7b' });
  });

  it('says what it tried when no larger model helps', async () => {
    globalThis.__joseInstalledModels = ['llama3.2:3b'];
    vi.mocked(executeContentStepAssignment).mockImplementation(async () => { throw new Error('model gave up'); });
    const result = await run([step('nova', 'analysis_market', { stepId: 'value', effects: ['read'] })]);
    globalThis.__joseInstalledModels = [];
    expect(result.failedCount).toBe(1);
    expect(String(result.executionReceipts[0].reason)).toMatch(/^Tried \d+ times; it still failed: model gave up\. Tell me how to go on\.$/);
  });

  it('runs a step with the model Jose chose for it', async () => {
    const seen = [];
    vi.mocked(executeContentStepAssignment).mockImplementation(async (assignment) => {
      seen.push(globalThis.__joseStepModel);
      return { summary: 'ok', resultState: 'completed', artifacts: [], sources: [], contractAction: assignment.actionType };
    });
    await run([step('nova', 'analysis_market', { stepId: 'value', effects: ['read'], model: 'qwen2.5:7b' })]);
    expect(seen).toEqual(['qwen2.5:7b']);
  });

  it('does not escalate an agent that runs on a cloud provider', async () => {
    const { setAgentProvider } = await import('../../../services/modelSelectionService');
    setAgentProvider('nova', { provider: 'gemini' });
    globalThis.__joseInstalledModels = ['llama3.2:3b', 'qwen2.5:7b'];
    vi.mocked(executeContentStepAssignment).mockImplementation(async () => { throw new Error('model gave up'); });
    const result = await run([step('nova', 'analysis_market', { stepId: 'value', effects: ['read'] })]);
    globalThis.__joseInstalledModels = [];
    setAgentProvider('nova', { provider: 'ollama' });
    expect(result.failedCount).toBe(1);
    expect(String(result.executionReceipts[0].reason)).not.toMatch(/and with/);
  });

  // Phase 4: the plan can grow while it runs.
  describe('a plan that grows while it runs', () => {
    afterEach(() => setPlanAdapterForTests(null));

    it('runs a step added after another step finished, and logs why', async () => {
      let added = false;
      setPlanAdapterForTests(async ({ justRan }) => {
        if (added || !justRan.includes('a')) return [];
        added = true;
        return [{ add: [{ stepId: 'extra', agent: 'nova', actionType: 'analysis_extra', effects: ['read'], needs: ['a'], instruction: 'Check one more thing.' }], reason: 'Nova checks one more thing.' }];
      });
      const result = await run([step('hector', 'research_report', { stepId: 'a', effects: ['read'] })]);
      // The added step has no content-factory payload, so Nova's own executor runs it.
      expect(result.executionReceipts.map((r) => [r.agent, r.status])).toEqual([['hector', 'executed'], ['nova', 'executed']]);
      const request = getJoseRequest(`jose-request-${result.commandId}`);
      expect(request.steps.map((s) => [s.stepId, s.status])).toEqual([['a', 'done'], ['extra', 'done']]);
      expect(request.changeLog.map((c) => c.text)).toContain('Nova checks one more thing.');
    });

    it('refuses a change that breaks the rules, and still finishes', async () => {
      setPlanAdapterForTests(async ({ justRan }) => (justRan.includes('a')
        ? [{ add: [{ stepId: 'bad', agent: 'miya', actionType: 'creative_x', effects: ['run'], needs: ['a'] }], reason: 'Miya runs something.' }]
        : []));
      const result = await run([step('hector', 'research_report', { stepId: 'a', effects: ['read'] })]);
      const request = getJoseRequest(`jose-request-${result.commandId}`);
      expect(request.steps.map((s) => s.stepId)).toEqual(['a']);
      expect(request.changeLog.map((c) => c.text).join(' ')).toMatch(/^Not added: .*only Alphonso/);
      expect(request.status).toBe('done');
    });

    it('refuses growth past the step limit', async () => {
      setPlanAdapterForTests(async ({ justRan }) => (justRan.includes('a')
        ? [{ add: Array.from({ length: 50 }, (_, i) => ({ stepId: `n${i}`, agent: 'nova', actionType: 'analysis_x', effects: ['read'], needs: ['a'] })), reason: 'Too many.' }]
        : []));
      const result = await run([step('hector', 'research_report', { stepId: 'a', effects: ['read'] })]);
      const request = getJoseRequest(`jose-request-${result.commandId}`);
      expect(request.steps).toHaveLength(1);
      expect(request.changeLog.map((c) => c.text).join(' ')).toMatch(/Not added: .*50/);
    });
  });

  // Phase 4: a review that finds problems sends the work back.
  it('runs the revision and the re-review before the steps after the review', async () => {
    globalThis.__joseVerdicts = ['fix', 'pass'];
    const result = await run([
      step('miya', 'creative_script', { stepId: 'script', effects: ['write_own_work'] }),
      step('nova', 'analysis_content_review', { stepId: 'review_value', effects: ['read'], needs: ['script'], reviewOf: 'script' }),
      step('miya', 'creative_campaign', { stepId: 'campaign', effects: ['write_own_work'], needs: ['review_value'] }),
      step('nova', 'analysis_x', { stepId: 'uses_script', effects: ['read'], needs: ['script', 'campaign'] }),
    ]);
    globalThis.__joseVerdicts = [];
    const request = getJoseRequest(`jose-request-${result.commandId}`);
    const command = listJoseCommands().find((c) => c.id === result.commandId);
    const stepOf = Object.fromEntries(command.assignments.map((a) => [a.packetId, a.stepId]));
    const order = result.executionReceipts.map((r) => stepOf[r.packetId]);
    expect(order[0]).toBe('script');
    expect(order.indexOf('script-fix-1')).toBeGreaterThan(order.indexOf('review_value'));
    expect(order.indexOf('review_value-r1')).toBeGreaterThan(order.indexOf('script-fix-1'));
    expect(order.indexOf('campaign')).toBeGreaterThan(order.indexOf('review_value-r1'));
    // Steps after the review use the revised work and wait for its re-review.
    expect(request.steps.find((s) => s.stepId === 'campaign').needs).toEqual(['script-fix-1', 'review_value-r1']);
    expect(request.steps.find((s) => s.stepId === 'uses_script').needs).toEqual(['campaign', 'script-fix-1', 'review_value-r1']);
    // Each review's verdict is recorded on its step and in the change log.
    expect(request.steps.find((s) => s.stepId === 'review_value').verdict).toBe('fix');
    expect(request.steps.find((s) => s.stepId === 'review_value-r1').verdict).toBe('pass');
    const log = request.changeLog.map((c) => c.text);
    expect(log).toContain("Nova's review: asked for changes.");
    expect(log).toContain("Nova's review: no changes needed.");
    expect(result.planNote || '').not.toMatch(/review: no changes needed/);
  });

  // Phase 4: an agent asks for help through Jose.
  it('adds a helper and runs the asking step again before the steps after it', async () => {
    vi.mocked(executeContentStepAssignment).mockImplementation(async (assignment) => ({
      summary: assignment.stepId === 'script' ? 'Draft done.' + String.fromCharCode(10) + 'HELP: facts about the launch date' : 'ok',
      resultState: 'completed', artifacts: [], sources: [], contractAction: assignment.actionType,
    }));
    const result = await run([
      step('miya', 'creative_script', { stepId: 'script', effects: ['write_own_work'] }),
      step('miya', 'creative_campaign', { stepId: 'campaign', effects: ['write_own_work'], needs: ['script'] }),
    ]);
    const command = listJoseCommands().find((c) => c.id === result.commandId);
    const stepOf = Object.fromEntries(command.assignments.map((a) => [a.packetId, a.stepId]));
    expect(result.executionReceipts.map((r) => stepOf[r.packetId])).toEqual(['script', 'script-help', 'script-again', 'campaign']);
    const request = getJoseRequest(`jose-request-${result.commandId}`);
    expect(request.steps.find((s) => s.stepId === 'script-help').agent).toBe('hector');
    expect(request.steps.find((s) => s.stepId === 'campaign').needs).toEqual(['script-again']);
  });

  // Phase 4: approving a waiting step carries the request on.
  describe('after you approve a step', () => {
    const waitingPlan = () => run([
      step('nova', 'analysis_x', { stepId: 'facts', effects: ['read'] }),
      step('marcus', 'distribution_execution', { stepId: 'post', effects: ['publish_or_send'], needs: ['facts'] }),
      step('maria', 'audit_quality', { stepId: 'check', effects: ['read'], needs: ['post'] }),
    ]);
    const packetOf = (commandId, stepId) => listJoseCommands().find((c) => c.id === commandId).assignments.find((a) => a.stepId === stepId).packetId;
    const ranSteps = () => vi.mocked(executeContentStepAssignment).mock.calls.map((c) => c[0].stepId);

    it('runs the approved step, then the steps that needed it, and the request ends done', async () => {
      const first = await waitingPlan();
      const requestId = `jose-request-${first.commandId}`;
      expect(getJoseRequest(requestId).status).toBe('waiting_approval');
      expect(findRequestByPacket(packetOf(first.commandId, 'post')).id).toBe(requestId);
      vi.mocked(executeContentStepAssignment).mockClear();
      const result = await executeApprovedPackets([packetOf(first.commandId, 'post')]);
      expect(result.ok).toBe(true);
      expect(ranSteps()).toEqual(['post', 'check']);
      const request = getJoseRequest(requestId);
      expect(request.steps.map((s) => [s.stepId, s.status])).toEqual([['facts', 'done'], ['post', 'done'], ['check', 'done']]);
      expect(request.status).toBe('done');
    });

    it('runs an approved step once when it is approved twice', async () => {
      const first = await waitingPlan();
      vi.mocked(executeContentStepAssignment).mockClear();
      const packetId = packetOf(first.commandId, 'post');
      const [a, b] = await Promise.all([executeApprovedPackets([packetId]), executeApprovedPackets([packetId])]);
      expect(ranSteps().filter((id) => id === 'post')).toHaveLength(1);
      expect([a.ok, b.ok].sort()).toEqual([false, true]);
      expect(getJoseRequest(`jose-request-${first.commandId}`).status).toBe('done');
      await executeApprovedPackets([packetId]);
      expect(ranSteps().filter((id) => id === 'post')).toHaveLength(1);
    });

    it('does not resume a cancelled or finished request', async () => {
      const done = await waitingPlan();
      setJoseRequestStatus(`jose-request-${done.commandId}`, 'done');
      vi.mocked(executeContentStepAssignment).mockClear();
      expect((await executeApprovedPackets([packetOf(done.commandId, 'post')])).ok).toBe(false);
      expect(ranSteps()).toEqual([]);
      const first = await waitingPlan();
      setJoseRequestStatus(`jose-request-${first.commandId}`, 'cancelled');
      vi.mocked(executeContentStepAssignment).mockClear();
      const result = await executeApprovedPackets([packetOf(first.commandId, 'post')]);
      expect(ranSteps()).toEqual([]);
      expect(result.ok).toBe(false);
      expect(getJoseRequest(`jose-request-${first.commandId}`).status).toBe('cancelled');
    });

    it('approves a waiting step by request and step (the board button)', async () => {
      const first = await waitingPlan();
      vi.mocked(executeContentStepAssignment).mockClear();
      const result = await approveRequestStep(`jose-request-${first.commandId}`, 'post');
      expect(result.ok).toBe(true);
      expect(ranSteps()).toEqual(['post', 'check']);
      expect(getJoseRequest(`jose-request-${first.commandId}`).status).toBe('done');
      expect((await approveRequestStep(`jose-request-${first.commandId}`, 'nope')).ok).toBe(false);
    });

    it('uses the Ollama address from Settings when the board resumes a request', async () => {
      const first = await waitingPlan();
      globalThis.__joseEndpoint = 'http://192.168.1.5:11434';
      vi.mocked(fetchOllamaModels).mockClear();
      await approveRequestStep(`jose-request-${first.commandId}`, 'post');
      globalThis.__joseEndpoint = undefined;
      expect(vi.mocked(fetchOllamaModels).mock.calls.map((c) => c[0])).toContain('http://192.168.1.5:11434');
    });

    it('keeps the old one-packet path for a packet made outside a request', async () => {
      const packet = createAgentPacket({
        fromAgent: 'jose', toAgent: 'nova', title: 'x', packetType: 'assignment', source: 'test',
        payload: { originalCommand: 'x', assignment: step('nova', 'analysis_x', { stepId: 'solo', effects: ['read'] }) },
      });
      expect(findRequestByPacket(packet.id)).toBeNull();
      vi.mocked(executeContentStepAssignment).mockClear();
      const result = await executeApprovedPackets([packet.id]);
      expect(result.ok).toBe(true);
      expect(ranSteps()).toEqual(['solo']);
    });
  });

  it('reports the request id before the first step runs', async () => {
    const events = [];
    const result = await runJoseCommandExecutionPipeline({
      commandText: 'Step graph test', source: 'test', zeroCostMode: true, previewMode: false,
      assignments: [step('nova', 'analysis_x', { stepId: 'a', effects: ['read'] })],
      onProgress: (event) => events.push(event),
    });
    const stages = events.map((e) => e.stage);
    expect(stages.indexOf('request_started')).toBeGreaterThanOrEqual(0);
    expect(stages.indexOf('request_started')).toBeLessThan(stages.indexOf('wave_start'));
    expect(events.find((e) => e.stage === 'request_started').requestId).toBe(`jose-request-${result.commandId}`);
  });

  it('has Echo save what a finished request decided', async () => {
    const result = await run([step('nova', 'analysis_x', { stepId: 'a', effects: ['read'] })]);
    const request = getJoseRequest(`jose-request-${result.commandId}`);
    expect(request.status).toBe('done');
    expect((request.changeLog || []).map((c) => c.text)).toContain('Echo saved what was decided.');
  });

  // Phase 4: a step that keeps failing can be tried by a paid model you approve.
  describe('a paid retry', () => {
    afterEach(() => { globalThis.__josePaid = undefined; });
    const failingPlan = () => {
      vi.mocked(executeContentStepAssignment).mockImplementation(async (assignment) => {
        if (assignment.stepId === 'a') throw new Error('the model gave nothing usable');
        return { summary: 'ok', resultState: 'completed', artifacts: [], sources: [], contractAction: assignment.actionType };
      });
      return run([
        step('miya', 'creative_script', { stepId: 'a', effects: ['write_own_work'] }),
        step('nova', 'analysis_x', { stepId: 'b', effects: ['read'], needs: ['a'] }),
      ]);
    };

    it('adds a paid step that waits for approval, with what it would cost', async () => {
      globalThis.__josePaid = { ok: true };
      localStorage.setItem('alphonso_settings', JSON.stringify({ zeroCostMode: false, paidModels: { allowed: true, provider: 'claude', model: 'claude-haiku-5-5', inputPerMillionUsd: 3, outputPerMillionUsd: 15 } }));
      const result = await failingPlan();
      const request = getJoseRequest(`jose-request-${result.commandId}`);
      const paid = request.steps.find((s) => s.stepId === 'a-paid');
      expect(paid).toMatchObject({ agent: 'miya', actionType: 'creative_script', model: 'claude:claude-haiku-5-5', replaces: 'a', status: 'waiting_approval' });
      expect(paid.effects).toEqual(expect.arrayContaining(['write_own_work', 'spend']));
      expect(request.steps.find((s) => s.stepId === 'b').needs).toEqual(['a-paid']);
      const waiting = result.executionReceipts.find((r) => r.status === 'approval_required');
      expect(waiting.reason).toMatch(/Spend money \(about \$\d+\.\d\d\)/);
      expect(request.status).toBe('waiting_approval');
    });

    it('adds nothing when paid models are not available', async () => {
      const result = await failingPlan();
      const request = getJoseRequest(`jose-request-${result.commandId}`);
      expect(request.steps.map((s) => s.stepId)).toEqual(['a', 'b']);
      expect(request.status).toBe('failed');
    });
  });

  it('does not have Echo save when the caller says so (the content factory saves its own lessons)', async () => {
    const result = await runJoseCommandExecutionPipeline({
      commandText: 'Content factory: script', source: 'content-factory', zeroCostMode: true, previewMode: false,
      assignments: [step('nova', 'analysis_x', { stepId: 'a', effects: ['read'] })],
      saveDecisions: false,
    });
    const request = getJoseRequest(`jose-request-${result.commandId}`);
    expect((request.changeLog || []).map((c) => c.text)).not.toContain('Echo saved what was decided.');
  });
});
