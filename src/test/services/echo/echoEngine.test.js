// Agent phase 7: the engine sends each Echo task type to his own step, and a step that waits
// keeps what it waits with (the buttons' choices) on the request step.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/ollama', () => ({
  generateOllamaResponse: vi.fn(async () => ({ response: '{}' })),
  fetchOllamaModels: vi.fn(async () => ({ models: [] })),
  PREFERRED_MODEL: 'llama3.2:3b',
  getConfiguredOllamaModel: () => 'llama3.2:3b',
  getConfiguredOllamaEndpoint: () => 'http://127.0.0.1:11434',
  generateAgentLlmResponse: vi.fn(async () => ({ response: '{"decisions": []}' })),
  withAgentModel: async (_a, _m, fn) => fn(),
  getAgentModelOverride: () => null,
}));
const outcomes = [];
vi.mock('../../../services/echo/echoSteps', async (orig) => ({
  ...(await orig()),
  runEchoStep: vi.fn(async (assignment) => outcomes.shift() || { summary: `ran ${assignment.actionType}`, resultState: 'completed', resultUrl: null, artifacts: [], sources: [], contractAction: assignment.actionType }),
}));

vi.mock('../../../services/jose/joseFinish', () => ({ saveRequestDecisions: vi.fn(async () => ({ saved: true, note: '' })) }));

import { runJoseCommandExecutionPipeline, rejectRequestStep } from '../../../services/joseExecutionEngineService';
import { saveRequestDecisions } from '../../../services/jose/joseFinish';
import { createJoseRequest, setJoseRequestStatus, updateJoseStep } from '../../../services/jose/joseRequestStore';
import { runEchoStep } from '../../../services/echo/echoSteps';
import { getJoseRequest } from '../../../services/jose/joseRequestStore';

const echoStep = (actionType) => ({
  agent: 'echo', actionType, stepId: 'echo', title: 'Echo', rationale: 't', riskLevel: 'low',
  requiresApproval: false, commandPreview: '', fragments: [], effects: actionType === 'memory_recall' ? ['read'] : ['write_own_work'], needs: [],
});
const run = (text, actionType) => runJoseCommandExecutionPipeline({ commandText: text, source: 'telegram', zeroCostMode: true, assignments: [echoStep(actionType)] });

beforeEach(() => {
  localStorage.clear();
  outcomes.length = 0;
  vi.mocked(runEchoStep).mockClear();
  vi.mocked(saveRequestDecisions).mockClear();
});

describe("Echo's steps in the engine", () => {
  it('a recall goes to his recall, with where the request came from', async () => {
    await run('What did we decide about the launch?', 'memory_recall');
    const [assignment, , ctx] = vi.mocked(runEchoStep).mock.calls[0];
    expect(assignment.actionType).toBe('memory_recall');
    expect(ctx).toMatchObject({ surface: 'telegram' });
    expect(ctx.requestId).toMatch(/^jose-request-/);
  });

  it('a step that waits keeps its choices on the request step', async () => {
    outcomes.push({ summary: 'Which one should I forget?', resultState: 'setup_required', resultUrl: null, artifacts: [], sources: [], contractAction: 'memory_forget', stepFields: { decisionChoices: [{ id: 'd1', text: 'A' }, { id: 'd2', text: 'B' }] } });
    const result = await run('Forget the launch decision', 'memory_forget');
    const step = getJoseRequest(`jose-request-${result.commandId}`).steps.find((s) => s.stepId === 'echo');
    expect(step.status).toBe('setup_needed');
    expect(step.decisionChoices).toEqual([{ id: 'd1', text: 'A' }, { id: 'd2', text: 'B' }]);
  });

  // Agent phase 7, Task 4: decisions are saved from a failed request and a rejected step too.
  it('a failed request still has its decisions saved', async () => {
    // Every attempt fails (a failed step is retried).
    for (let i = 0; i < 6; i += 1) outcomes.push({ summary: 'It broke.', resultState: 'failed', resultUrl: null, artifacts: [], sources: [], contractAction: 'memory_recall' });
    const result = await run('What did we decide about the launch?', 'memory_recall');
    expect(getJoseRequest(`jose-request-${result.commandId}`).status).toBe('failed');
    expect(saveRequestDecisions).toHaveBeenCalledTimes(1);
  });

  it('rejecting a step saves what was decided, with the rejection in the change log', async () => {
    const request = createJoseRequest({ commandId: 'c-rej', source: 'user', text: 'Post the launch', kind: 'normal',
      steps: [{ stepId: 'post', agent: 'marcus', actionType: 'distribution_execution', effects: ['publish_or_send'], needs: [] }] });
    updateJoseStep(request.id, 'post', { status: 'waiting_approval' });
    setJoseRequestStatus(request.id, 'waiting_approval');
    rejectRequestStep(request.id, 'post');
    await new Promise((r) => setTimeout(r, 0));
    const saved = vi.mocked(saveRequestDecisions).mock.calls[0][0];
    expect(saved.id).toBe(request.id);
    expect(saved.changeLog.map((c) => c.text)).toContain("You rejected Marcus's step.");
  });
});
