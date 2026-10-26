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

import { runJoseCommandExecutionPipeline } from '../../../services/joseExecutionEngineService';
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
});
