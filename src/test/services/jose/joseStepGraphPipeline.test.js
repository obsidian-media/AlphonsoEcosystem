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

// Marcus's connectors (agent phase 5): nothing leaves the test.
vi.mock('../../../services/connectors/slackConnector', () => ({ sendMessage: vi.fn(async () => ({ ts: '1.2' })) }));
vi.mock('../../../services/connectors/discordConnector', () => ({ sendMessage: vi.fn(async () => ({ id: 'M' })), listGuildChannels: vi.fn(async () => [{ id: 'C', name: 'news' }]) }));

vi.mock('../../../lib/ollama', () => ({
  generateOllamaResponse: vi.fn(async () => ({
    response: JSON.stringify({ title: 'mock', hook: 'mock', script: 'mock', scenes: [], prompts: [] })
  })),
  fetchOllamaModels: vi.fn(async () => ({ models: [] })),
  PREFERRED_MODEL: 'llama3.2:3b',
  getConfiguredOllamaModel: () => 'llama3.2:3b',
  // Review verdicts (phase 4): a queue the tests fill; anything else gets a plain answer.
  generateAgentLlmResponse: vi.fn(async (_agent, { prompt }) => {
    // Alphonso's writing for Marcus's sends (agent phase 5): a queue the tests fill.
    if (_agent === 'alphonso' && (globalThis.__alphonsoTexts || []).length) return { response: globalThis.__alphonsoTexts.shift() };
    if (/Did your review ask for changes/.test(prompt)) {
      const verdict = (globalThis.__joseVerdicts || []).shift() || 'pass';
      return { response: JSON.stringify({ verdict, findings: verdict === 'fix' ? ['The hook is weak.'] : [] }) };
    }
    // Maria's two reviews (agent phase 3): the work, or the plan.
    if (_agent === 'maria' && /You are Maria/.test(prompt)) {
      return /The work to review/.test(prompt)
        ? { response: JSON.stringify({ verdict: 'pass', summary: 'Ready to use.', findings: [] }) }
        : globalThis.__mariaAsksApproval
          ? { response: JSON.stringify({ risk: 'medium', why: 'It emails customers.', rules: [], points: ['Emailing all customers needs their permission.'], needsApproval: true, approvalReasons: ['Emailing all customers needs their permission.'], offer: '' }) }
          : { response: JSON.stringify({ risk: 'low', why: 'Nothing is sent.', rules: [], points: ['Nothing leaves this computer.'], needsApproval: false, approvalReasons: [], offer: '' }) };
    }
    // Sentinel's check (agent phase 4).
    if (_agent === 'sentinel' && /You are Sentinel/.test(prompt)) {
      return globalThis.__sentinelUnsafe
        ? { response: JSON.stringify({ verdict: 'unsafe', summary: 'A fake login.', findings: [{ what: 'A fake PayPal login', where: 'Step graph test', severity: 'high', fix: 'Remove the link.' }] }) }
        : { response: JSON.stringify({ verdict: 'safe', summary: 'Nothing risky.', findings: [] }) };
    }
    // Nova's ranked verdict (agent phase 2).
    if (_agent === 'nova' && /You are Nova/.test(prompt)) {
      return { response: JSON.stringify({ doFirst: 'the first option', options: [{ name: 'The first option', rank: 1, why: 'it is ready', value: 'high', effort: 'low', risk: 'low' }] }) };
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

vi.mock('../../../services/contentFactory/contentStepRecorder', () => ({
  recordContentStepResult: vi.fn(async () => 'saved'),
  beginContentStep: vi.fn(),
}));
vi.mock('../../../services/codingAgentService', () => ({
  isCodingRequest: vi.fn(() => true),
  runCodingAgent: vi.fn(async () => ({ ok: true, content: 'code' })),
}));

import { runJoseCommandExecutionPipeline, stepCommandText, executeApprovedPackets, approveRequestStep, carryOnRequest, rejectRequestStep } from '../../../services/joseExecutionEngineService';
import { createAgentPacket, updatePacketStatus, approvePacket, getPacketById } from '../../../services/agentBusService';
import { fetchOllamaModels } from '../../../lib/ollama';
import { runCodingAgent } from '../../../services/codingAgentService';
import { createJoseCommandRoute, listJoseCommands } from '../../../services/joseCommandRouterService';
import { executeContentStepAssignment } from '../../../services/contentFactory/contentAgentExecutor';
import { getStepOutput } from '../../../services/jose/joseStepOutputs';
import { recordContentStepResult } from '../../../services/contentFactory/contentStepRecorder';
import { setPlanAdapterForTests } from '../../../services/jose/joseAdapt';
import { getJoseRequest, createWaitingPlanRequest, claimPlanForRun, listJoseRequests, setJoseRequestStatus, findRequestByPacket, updateJoseStep } from '../../../services/jose/joseRequestStore';

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
    // His code steps build their own prompt from your request (agent phase 6).
    expect(stepCommandText({ agent: 'alphonso', actionType: 'local_operation', instruction: 'run npm test and install everything' }, 'Make a page')).toBe('Make a page');
    // His answering and writing steps get the instruction and the HELP line like everyone else.
    const writing = stepCommandText({ agent: 'alphonso', actionType: 'assistant_write', instruction: 'Write the email.' }, 'Email my landlord');
    expect(writing.startsWith('Write the email.')).toBe(true);
    expect(writing).toMatch(/HELP:/);
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
    // Agent phase 7: Echo notes what he remembered, that nothing was new, or why he couldn't.
    // Echo saves in the background, after the result.
    await vi.waitFor(() => expect((getJoseRequest(request.id).changeLog || []).map((c) => c.text).some((t) => /^Echo (remembered|found nothing new|couldn't save)/.test(t))).toBe(true));
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

  // Phase 5: a request the app was closed on can be carried on.
  describe('carrying on an interrupted request', () => {
    const cutOff = (requestId, stepId) => {
      updateJoseStep(requestId, stepId, { status: 'running' });
      setJoseRequestStatus(requestId, 'interrupted');
    };
    const ran = () => vi.mocked(executeContentStepAssignment).mock.calls.map((c) => c[0].stepId);

    it('runs the steps not done, keeps the done ones, and ends done', async () => {
      const first = await run([
        step('hector', 'research_report', { stepId: 'a', effects: ['read'] }),
        step('nova', 'analysis_x', { stepId: 'b', effects: ['read'], needs: ['a'] }),
      ]);
      const requestId = `jose-request-${first.commandId}`;
      cutOff(requestId, 'b');
      vi.mocked(executeContentStepAssignment).mockClear();
      const result = await carryOnRequest(requestId);
      expect(result.ok).toBe(true);
      expect(ran()).toEqual(['b']);
      expect(getJoseRequest(requestId).status).toBe('done');
    });

    it('asks again for a step that needs approval', async () => {
      const first = await run([
        step('hector', 'research_report', { stepId: 'a', effects: ['read'] }),
        step('marcus', 'distribution_execution', { stepId: 'post', effects: ['publish_or_send'], needs: ['a'] }),
      ]);
      const requestId = `jose-request-${first.commandId}`;
      const packetId = listJoseCommands().find((c) => c.id === first.commandId).assignments.find((a) => a.stepId === 'post').packetId;
      approvePacket(packetId, 'operator');
      updatePacketStatus(packetId, 'interrupted');
      cutOff(requestId, 'post');
      vi.mocked(executeContentStepAssignment).mockClear();
      await carryOnRequest(requestId);
      expect(ran()).toEqual([]);
      expect(getJoseRequest(requestId).status).toBe('waiting_approval');
    });

    it('does nothing for a request that is not interrupted', async () => {
      const first = await run([step('hector', 'research_report', { stepId: 'a', effects: ['read'] })]);
      vi.mocked(executeContentStepAssignment).mockClear();
      const result = await carryOnRequest(`jose-request-${first.commandId}`);
      expect(result.ok).toBe(false);
      expect(ran()).toEqual([]);
    });
  });

  // Phase 5: Echo saves once, when a request is done (not while it waits).
  it('does not have Echo save while a request waits for approval', async () => {
    const result = await run([
      step('hector', 'research_report', { stepId: 'a', effects: ['read'] }),
      step('marcus', 'distribution_execution', { stepId: 'post', effects: ['publish_or_send'], needs: ['a'] }),
    ]);
    const request = getJoseRequest(`jose-request-${result.commandId}`);
    expect(request.status).toBe('waiting_approval');
    expect((request.changeLog || []).map((c) => c.text)).not.toContain('Echo saved what was decided.');
  });

  // Phase 5: rejecting a waiting step cancels its request.
  it('rejecting a waiting step cancels the request, with a note', async () => {
    const first = await run([
      step('hector', 'research_report', { stepId: 'a', effects: ['read'] }),
      step('marcus', 'distribution_execution', { stepId: 'post', effects: ['publish_or_send'], needs: ['a'] }),
    ]);
    const requestId = `jose-request-${first.commandId}`;
    const result = rejectRequestStep(requestId, 'post');
    expect(result.ok).toBe(true);
    const request = getJoseRequest(requestId);
    expect(request.status).toBe('cancelled');
    expect(request.steps.find((s) => s.stepId === 'post').status).toBe('rejected');
    expect(request.changeLog.map((c) => c.text)).toContain("You rejected Marcus's step.");
    expect(rejectRequestStep(requestId, 'post').ok).toBe(false);
  });

  it("rejecting a step also clears the request's other waiting steps from the queue", async () => {
    const first = await run([
      step('marcus', 'distribution_execution', { stepId: 'post', effects: ['publish_or_send'] }),
      step('marcus', 'distribution_execution', { stepId: 'post2', effects: ['publish_or_send'] }),
    ]);
    const requestId = `jose-request-${first.commandId}`;
    const packetOf = (id) => listJoseCommands().find((c) => c.id === first.commandId).assignments.find((a) => a.stepId === id).packetId;
    rejectRequestStep(requestId, 'post');
    expect(getPacketById(packetOf('post2')).status).toBe('rejected');
  });

  // Phase 6a: a schedule never gets a paid retry, also after an approval.
  it('adds no paid retry when the request allows no paid models', async () => {
    globalThis.__josePaid = { ok: true };
    localStorage.setItem('alphonso_settings', JSON.stringify({ zeroCostMode: false, paidModels: { allowed: true, provider: 'claude', model: 'm', inputPerMillionUsd: 3, outputPerMillionUsd: 15 } }));
    vi.mocked(executeContentStepAssignment).mockImplementation(async () => { throw new Error('nothing usable'); });
    const result = await runJoseCommandExecutionPipeline({
      commandText: 'x', source: 'schedule', zeroCostMode: true, previewMode: false, allowPaidModels: false,
      assignments: [step('miya', 'creative_script', { stepId: 'a', effects: ['write_own_work'] })],
    });
    globalThis.__josePaid = undefined;
    const request = getJoseRequest(`jose-request-${result.commandId}`);
    expect(request.steps.map((s) => s.stepId)).toEqual(['a']);
    expect(request.runOptions.allowPaidModels).toBe(false);
  });

  // Phase 6a: Boardroom's Conclude reads Maria's verdict from her step's output.
  it("keeps a step's structured result (Maria's review) in its output", async () => {
    const result = await runJoseCommandExecutionPipeline({
      commandText: 'Boardroom discussion: launch plan', source: 'boardroom', zeroCostMode: true, previewMode: false,
      // Maria's own executor (no contentStep): her plan review from the mocked model.
      assignments: [step('maria', 'audit_governance', { stepId: 'maria', effects: ['read'], contentStep: undefined })],
    });
    const output = getStepOutput(result.commandId, 'maria');
    expect(output.schema.riskLevel).toBeTruthy();
  });

  // Agent phase 4: a serious Sentinel finding holds the steps after his.
  it('holds the steps after Sentinel when he finds something serious, and carries on once approved', async () => {
    globalThis.__sentinelUnsafe = true;
    try {
      const result = await run([
        step('sentinel', 'security_review', { stepId: 'check', effects: ['read'], contentStep: undefined }),
        step('alphonso', 'assistant_write', { stepId: 'email', effects: ['read'], needs: ['check'], contentStep: undefined }),
      ]);
      const requestId = `jose-request-${result.commandId}`;
      expect(getJoseRequest(requestId).steps.find((s) => s.stepId === 'email').status).toBe('waiting_approval');
      const receipt = result.executionReceipts.find((r) => r.agent === 'alphonso');
      expect(receipt.reason).toContain('Sentinel asks for your approval:');
      expect(receipt.reason).toContain('A fake PayPal login');
      globalThis.__sentinelUnsafe = false;
      await approveRequestStep(requestId, 'email');
      expect(getJoseRequest(requestId).steps.find((s) => s.stepId === 'email').status).toBe('done');
    } finally {
      globalThis.__sentinelUnsafe = false;
    }
  });

  // Agent phase 3: when Maria asks for your approval, the steps after hers wait with her reasons.
  it('holds the steps after Maria when she asks for approval, and carries on once approved', async () => {
    globalThis.__mariaAsksApproval = true;
    try {
      const result = await run([
        step('maria', 'governance_audit', { stepId: 'review', effects: ['read'], contentStep: undefined }),
        step('alphonso', 'assistant_write', { stepId: 'email', effects: ['read'], needs: ['review'], contentStep: undefined }),
      ]);
      const requestId = `jose-request-${result.commandId}`;
      const email = getJoseRequest(requestId).steps.find((s) => s.stepId === 'email');
      expect(email.status).toBe('waiting_approval');
      const receipt = result.executionReceipts.find((r) => r.agent === 'alphonso');
      expect(receipt.reason).toContain('Maria asks for your approval: Emailing all customers needs their permission.');
      globalThis.__mariaAsksApproval = false;
      await approveRequestStep(requestId, 'email');
      expect(getJoseRequest(requestId).steps.find((s) => s.stepId === 'email').status).toBe('done');
    } finally {
      globalThis.__mariaAsksApproval = false;
    }
  });

  // Phase 6b: a step can wait for you for a reason of its own (Miya Studio's review approval).
  it('a step with a wait reason waits for approval even when its effects do not', async () => {
    const result = await run([
      step('nova', 'analysis_x', { stepId: 'a', effects: ['read'] }),
      step('miya', 'creative_y', { stepId: 'b', effects: ['write_own_work'], needs: ['a'], waitFor: 'Approve the review in Miya Studio first.' }),
    ]);
    const request = getJoseRequest(`jose-request-${result.commandId}`);
    expect(request.status).toBe('waiting_approval');
    expect(request.steps.find((s) => s.stepId === 'a').status).toBe('done');
    expect(request.steps.find((s) => s.stepId === 'b').status).toBe('waiting_approval');
    // Saved on the request, so Miya Studio's Approve finds the step (real app, 2026-10-23).
    expect(request.steps.find((s) => s.stepId === 'b').waitFor).toBe('Approve the review in Miya Studio first.');
    // The content data stays on the command, not in every saved request.
    expect(request.steps.find((s) => s.stepId === 'b').contentStep).toBeUndefined();
  });

  // Phase 6b: the factory saves each step as it finishes, however the request runs.
  it('a finished content step is handed to the factory', async () => {
    const result = await run([step('miya', 'creative_script', { stepId: 'script', effects: ['write_own_work'], contentStep: { projectId: 'p1', step: 'script', task: 'x', prior: {} } })]);
    expect(recordContentStepResult).toHaveBeenCalledWith({ projectId: 'p1', step: 'script', agent: 'miya', data: { ok: true }, commandId: result.commandId });
  });

  // Real app (2026-10-23): a review-loop revision of a content step lost its
  // content data, so Miya's rewrite ran without the project.
  it("a review-loop revision of a content step keeps the step's content data", async () => {
    globalThis.__joseVerdicts = ['fix'];
    const contentStep = { projectId: 'p1', step: 'script', task: 'x', prior: {} };
    const result = await run([
      step('miya', 'creative_script', { stepId: 'script', effects: ['write_own_work'], contentStep }),
      step('nova', 'analysis_content_review', { stepId: 'review_value', effects: ['read'], needs: ['script'], reviewOf: 'script', contentStep: { ...contentStep, step: 'review' } }),
    ]);
    globalThis.__joseVerdicts = [];
    const command = listJoseCommands().find((c) => c.id === result.commandId);
    expect(command.assignments.find((a) => a.stepId === 'script-fix-1').contentStep).toEqual(contentStep);
    expect(command.assignments.find((a) => a.stepId === 'review_value-r1').contentStep).toEqual({ ...contentStep, step: 'review' });
  });
});

// Agent roles Part A (2026-10-24): a step whose owner can't work waits for setup.
describe('a step whose owner needs setting up', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(executeContentStepAssignment).mockClear();
  });

  it('is tried once, waits with the reason, and is never handed to another agent', async () => {
    vi.mocked(executeContentStepAssignment).mockImplementation(async (assignment) => (
      assignment.stepId === 'voice'
        ? { summary: 'Install Kokoro in Runtime Hub.', resultState: 'setup_required', artifacts: [], sources: [], contractAction: assignment.actionType }
        : { summary: 'ok', resultState: 'completed', artifacts: [], sources: [], contractAction: assignment.actionType }
    ));
    const result = await run([
      step('miya', 'creative_voice', { stepId: 'voice' }),
      step('miya', 'creative_music', { stepId: 'mix', needs: ['voice'] }),
    ]);
    const calls = vi.mocked(executeContentStepAssignment).mock.calls.map((c) => c[0].stepId);
    expect(calls).toEqual(['voice']);
    const request = getJoseRequest(`jose-request-${result.commandId}`);
    expect(request.status).toBe('waiting_setup');
    const voice = request.steps.find((s) => s.stepId === 'voice');
    expect(voice.status).toBe('setup_needed');
    expect(voice.error).toBe('Install Kokoro in Runtime Hub.');
    expect(request.steps.find((s) => s.stepId === 'mix').status).toBe('not_run');
    expect(request.steps.map((s) => s.stepId)).toEqual(['voice', 'mix']);
  });

  it('carries on once it is set up', async () => {
    let ready = false;
    vi.mocked(executeContentStepAssignment).mockImplementation(async (assignment) => (
      assignment.stepId === 'voice' && !ready
        ? { summary: 'Install Kokoro in Runtime Hub.', resultState: 'setup_required', artifacts: [], sources: [], contractAction: assignment.actionType }
        : { summary: 'ok', resultState: 'completed', artifacts: [], sources: [], contractAction: assignment.actionType }
    ));
    const result = await run([step('miya', 'creative_voice', { stepId: 'voice' }), step('miya', 'creative_music', { stepId: 'mix', needs: ['voice'] })]);
    ready = true;
    await carryOnRequest(`jose-request-${result.commandId}`);
    const request = getJoseRequest(`jose-request-${result.commandId}`);
    expect(request.status).toBe('done');
    expect(request.steps.every((s) => s.status === 'done')).toBe(true);
  });
});

describe('the closing summary (agent roles Part A)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(executeContentStepAssignment).mockClear();
    vi.mocked(executeContentStepAssignment).mockImplementation(async (assignment) => ({
      summary: `${assignment.stepId} finished. Details follow.`, resultState: 'completed', artifacts: [], sources: [], contractAction: assignment.actionType,
    }));
  });

  it('ends a request with one line per step and the board, not "Jose merged"', async () => {
    const result = await run([step('miya', 'creative_script', { stepId: 'script' }), step('miya', 'creative_scenes', { stepId: 'scenes', needs: ['script'] })]);
    const command = listJoseCommands().find((c) => c.id === result.commandId);
    expect(command.userReport.summary).toBe('Miya: script finished.\nMiya: scenes finished.\nOpen on the board.');
  });
});

describe('a step that runs on Hermes (agent roles Part A)', () => {
  beforeEach(() => localStorage.clear());

  it('is marked on the board when the agent may not run things', async () => {
    localStorage.setItem('alphonso_agent_provider_v1', JSON.stringify({ hector: { provider: 'hermes' } }));
    const result = await run([{ agent: 'hector', actionType: 'research_report', stepId: 'facts', title: 'Facts', rationale: 'test', riskLevel: 'low', requiresApproval: false, commandPreview: 'Reads.', fragments: [] }]);
    const facts = getJoseRequest(`jose-request-${result.commandId}`).steps.find((s) => s.stepId === 'facts');
    expect(facts.note).toBe('Runs on Hermes, which can use its own tools.');
  });

  it('is not marked on Ollama', async () => {
    const result = await run([{ agent: 'hector', actionType: 'research_report', stepId: 'facts', title: 'Facts', rationale: 'test', riskLevel: 'low', requiresApproval: false, commandPreview: 'Reads.', fragments: [] }]);
    expect(getJoseRequest(`jose-request-${result.commandId}`).steps.find((s) => s.stepId === 'facts').note).toBeUndefined();
  });
});

describe('every step runs with its skill (agent roles Part B)', () => {
  const plain = (agent, actionType, extra = {}) => ({
    agent, actionType, title: `Step ${actionType}`, rationale: 'test', riskLevel: 'low',
    requiresApproval: false, commandPreview: 'Writes text only.', fragments: [], ...extra,
  });
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(executeContentStepAssignment).mockClear();
  });

  it("a Maria review's prompt carries her skill, and each step saves its skill and reason", async () => {
    const { generateAgentLlmResponse } = await import('../../../lib/ollama');
    vi.mocked(generateAgentLlmResponse).mockClear();
    const result = await run([
      plain('miya', 'creative_package', { stepId: 'draft' }),
      plain('maria', 'audit_quality', { stepId: 'check', needs: ['draft'], reviewOf: 'draft', effects: ['read'] }),
    ]);
    const prompts = vi.mocked(generateAgentLlmResponse).mock.calls.filter((c) => c[0] === 'maria').map((c) => String(c[1].prompt));
    const reviewPrompt = prompts.find((p) => p.includes('The work to review'));
    expect(reviewPrompt).toContain('Your skill: Claim check');
    const steps = getJoseRequest(`jose-request-${result.commandId}`).steps;
    expect(steps.find((s) => s.stepId === 'draft')).toMatchObject({ skill: 'Creative package', skillReason: 'The only skill for this task.' });
    expect(steps.find((s) => s.stepId === 'check')).toMatchObject({ skill: 'Claim check', skillReason: "Matches this step's task." });
  });

  // Agent roles Part C1: each finished step's result is recorded with its skill.
  it("records each finished step's result with its skill, and the review's verdict on the reviewed step", async () => {
    const { listSkillOutcomes } = await import('../../../services/skills/skillOutcomes');
    const result = await run([
      plain('miya', 'creative_package', { stepId: 'draft' }),
      plain('maria', 'audit_quality', { stepId: 'check', needs: ['draft'], reviewOf: 'draft', effects: ['read'] }),
    ]);
    const request = getJoseRequest(`jose-request-${result.commandId}`);
    const mine = listSkillOutcomes().filter((o) => o.requestId === request.id);
    expect(mine.find((o) => o.stepId === 'draft')).toMatchObject({ agent: 'miya', skill: 'Creative package', outcome: 'done' });
    expect(mine.find((o) => o.stepId === 'check')).toMatchObject({ agent: 'maria', skill: 'Claim check' });
    const verdict = request.steps.find((s) => s.stepId === 'check').verdict;
    if (verdict) expect(mine.find((o) => o.stepId === 'draft').verdict).toBe(verdict);
  });

  it("a content step records its skill but its prompt carries the ask only once", async () => {
    const result = await run([step('miya', 'creative_script', { stepId: 'script' })]);
    const options = vi.mocked(executeContentStepAssignment).mock.calls[0][1];
    expect(options.stepInput?.skill ?? null).toBeNull();
    expect(getJoseRequest(`jose-request-${result.commandId}`).steps[0]).toMatchObject({ skill: 'Write the script', skillReason: "This step's format needs it." });
  });

  it('a Jose step gets no skill', async () => {
    const result = await run([plain('jose', 'cost_policy_enforcement', { stepId: 'gate', effects: ['read'] })]);
    expect(getJoseRequest(`jose-request-${result.commandId}`).steps[0].skill).toBeUndefined();
  });
});

describe("Hector's research question (agent roles Part B review)", () => {
  beforeEach(() => localStorage.clear());

  it('never carries his skill text or earlier work into the search (agent phase 1: only the words of the request)', async () => {
    const hector = await import('../../../services/hectorResearchService');
    vi.mocked(hector.createResearchDraft).mockClear();
    const result = await run([
      { agent: 'miya', actionType: 'creative_package', stepId: 'draft', needs: [], title: 'Draft', rationale: 'test', riskLevel: 'low', requiresApproval: false, commandPreview: 'Writes.', fragments: [] },
      { agent: 'hector', actionType: 'research_report', stepId: 'facts', needs: ['draft'], title: 'Facts', rationale: 'test', riskLevel: 'low', requiresApproval: false, commandPreview: 'Reads.', fragments: [] },
    ]);
    const question = String(vi.mocked(hector.createResearchDraft).mock.calls[0][0].researchQuestion);
    expect(question).not.toContain('Your skill');
    expect(question).not.toContain("From Miya's step");
    expect(question).toBe('Step graph test');
  });
});

// Agent phase 5: a Marcus send is prepared before it asks you; the approval shows the exact text
// and destination, and after you approve it is sent once.
describe('Marcus sends what you approved', () => {
  const writeStep = (extra = {}) => ({
    agent: 'alphonso', actionType: 'assistant_write', stepId: 'write', title: 'Write', rationale: 'test', riskLevel: 'low',
    requiresApproval: false, commandPreview: 'Writes text only.', fragments: [], effects: ['write_own_work'], needs: [], ...extra,
  });
  const sendStep = (extra = {}) => ({
    agent: 'marcus', actionType: 'distribution_execution', stepId: 'marcus', title: 'Send', rationale: 'test', riskLevel: 'high',
    requiresApproval: false, commandPreview: 'Sends.', fragments: [], effects: ['publish_or_send'], needs: ['write'], reviewOf: 'write',
    payload: { connector: 'slack', target: '#news' }, ...extra,
  });
  const runPlan = (assignments, commandText = 'Write a note and post it to Slack #news') =>
    runJoseCommandExecutionPipeline({ commandText, source: 'test', zeroCostMode: true, previewMode: false, assignments });

  beforeEach(async () => {
    localStorage.clear();
    globalThis.__alphonsoTexts = [];
    const { saveConnectorCredential } = await import('../../../services/connectors/connectorAuth');
    saveConnectorCredential('slack', 'SLACK_BOT_TOKEN', 'xoxb-1');
    saveConnectorCredential('discord', 'DISCORD_BOT_TOKEN', 'd-1');
    saveConnectorCredential('discord', 'DISCORD_GUILD_ID', 'G');
    saveConnectorCredential('telegram', 'TELEGRAM_BOT_TOKEN', '');
    const slack = await import('../../../services/connectors/slackConnector');
    vi.mocked(slack.sendMessage).mockClear();
  });

  it('a Marcus send step is prepared before its gate and waits with the preview', async () => {
    globalThis.__alphonsoTexts = ['Open Saturday.'];
    const result = await runPlan([writeStep(), sendStep()]);
    const request = getJoseRequest(`jose-request-${result.commandId}`);
    const marcus = request.steps.find((s) => s.stepId === 'marcus');
    expect(marcus.status).toBe('waiting_approval');
    expect(marcus.sendPreview).toMatchObject({ connector: 'slack', target: '#news', text: 'Open Saturday.', sourceStepId: 'write' });
    const { listAgentPackets } = await import('../../../services/agentBusService');
    const packet = listAgentPackets().find((p) => p.payload?.joseCommandId === result.commandId && p.toAgent === 'marcus');
    expect(packet.policyReason).toBe('Waiting for your approval: Send to Slack #news: “Open Saturday.”');
  });

  // The desktop run (2026-10-26): Chat runs with preview on, which used to catch the step first.
  it('with preview on, the send is still prepared and waits with its text', async () => {
    globalThis.__alphonsoTexts = ['Open Saturday.'];
    const result = await runJoseCommandExecutionPipeline({ commandText: 'Write a note and post it to Slack #news', source: 'test', zeroCostMode: true, assignments: [writeStep(), sendStep()] });
    const marcus = getJoseRequest(`jose-request-${result.commandId}`).steps.find((s) => s.stepId === 'marcus');
    expect(marcus.status).toBe('waiting_approval');
    expect(marcus.sendPreview).toMatchObject({ connector: 'slack', target: '#news', text: 'Open Saturday.' });
    const { listAgentPackets } = await import('../../../services/agentBusService');
    const packet = listAgentPackets().find((p) => p.payload?.joseCommandId === result.commandId && p.toAgent === 'marcus');
    expect(packet.policyReason).toBe('Waiting for your approval: Send to Slack #news: “Open Saturday.”');
  });

  it('after approval it sends once', async () => {
    globalThis.__alphonsoTexts = ['Open Saturday.'];
    const result = await runPlan([writeStep(), sendStep()]);
    const requestId = `jose-request-${result.commandId}`;
    await approveRequestStep(requestId, 'marcus');
    await approveRequestStep(requestId, 'marcus');
    const slack = await import('../../../services/connectors/slackConnector');
    expect(slack.sendMessage).toHaveBeenCalledTimes(1);
    expect(vi.mocked(slack.sendMessage).mock.calls[0][2]).toBe('Open Saturday.');
    expect(getStepOutput(result.commandId, 'marcus').summary).toBe('Sent to Slack #news.');
  });

  it('nothing to send ends the step failed without asking', async () => {
    const result = await runPlan([sendStep({ needs: [], reviewOf: undefined })]);
    expect(result.pendingApprovalCount).toBe(0);
    const marcus = getJoseRequest(`jose-request-${result.commandId}`).steps.find((s) => s.stepId === 'marcus');
    expect(marcus.status).toBe('failed');
  });

  it('not set up → setup_needed without asking', async () => {
    globalThis.__alphonsoTexts = ['Meeting moved to 3pm.'];
    const result = await runPlan([writeStep(), sendStep({ payload: { connector: 'telegram', target: 'team' } })], 'Tell my team on Telegram');
    expect(result.pendingApprovalCount).toBe(0);
    const request = getJoseRequest(`jose-request-${result.commandId}`);
    expect(request.steps.find((s) => s.stepId === 'marcus').status).toBe('setup_needed');
    expect(request.status).toBe('waiting_setup');
  });

  it('too long → a fix round revises the writer and prepares again', async () => {
    globalThis.__alphonsoTexts = ['x'.repeat(2413), 'Short enough.'];
    const result = await runPlan([writeStep(), sendStep({ payload: { connector: 'discord', target: '#news' } })], 'Write a note and post it to Discord #news');
    const request = getJoseRequest(`jose-request-${result.commandId}`);
    const ids = request.steps.map((s) => s.stepId);
    expect(ids).toContain('write-fix-1');
    expect(ids).toContain('marcus-r1');
    const again = request.steps.find((s) => s.stepId === 'marcus-r1');
    expect(again.status).toBe('waiting_approval');
    expect(again.sendPreview.text).toBe('Short enough.');
    expect(getStepOutput(result.commandId, 'marcus').summary).toBe('Too long for Discord #news: 2,413 characters; the limit is 2,000.');
  });

  it('a readiness step is not held in preview mode either', async () => {
    globalThis.__alphonsoTexts = ['Open Saturday.'];
    const result = await runJoseCommandExecutionPipeline({
      commandText: 'Is my note ready to post on Slack #news?', source: 'test', zeroCostMode: true, previewMode: true,
      assignments: [writeStep(), sendStep({ actionType: 'distribution_readiness', effects: ['read'], reviewOf: undefined })],
    });
    expect(result.pendingApprovalCount).toBe(0);
  });

  it('a readiness step never waits', async () => {
    globalThis.__alphonsoTexts = ['Open Saturday.'];
    const result = await runPlan([writeStep(), sendStep({ actionType: 'distribution_readiness', effects: ['read'], reviewOf: undefined })], 'Is my note ready to post on Slack #news?');
    expect(result.pendingApprovalCount).toBe(0);
    const marcus = getJoseRequest(`jose-request-${result.commandId}`).steps.find((s) => s.stepId === 'marcus');
    expect(marcus.status).toBe('done');
    expect(getStepOutput(result.commandId, 'marcus').summary).toMatch(/^(Ready\.|Not ready:)/);
  });
});
