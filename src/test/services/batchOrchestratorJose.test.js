import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => null) }));
vi.mock('../../lib/ollama', () => ({
  generateOllamaResponse: vi.fn(),
  fetchOllamaModels: vi.fn(async () => []),
  getConfiguredOllamaModel: vi.fn(() => 'llama3.2:3b'),
  normalizeEndpoint: vi.fn((e) => e),
}));
vi.mock('../../services/jose/joseInbound', () => ({ answerOrPlan: vi.fn() }));

import { answerOrPlan } from '../../services/jose/joseInbound';
import { createProjectGoal, generateBatch, executeBatch, getBatchById } from '../../services/batchOrchestratorService';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('a batch task goes to Jose (phase 6a)', () => {
  it('asks Jose by name, with the suggested agent, and never shows the plan first', async () => {
    const goal = createProjectGoal('Analytics dashboard', 'A dashboard');
    const batch = await generateBatch(goal.id);
    vi.mocked(answerOrPlan).mockResolvedValue({ kind: 'request', requestId: 'r', waitingForPlan: false, result: { ok: true, executionReceipts: [] } });
    await executeBatch(batch.id, { endpoint: 'http://e', zeroCostMode: true });
    const [text, options] = vi.mocked(answerOrPlan).mock.calls[0];
    expect(text).toMatch(/^Ask Jose: /);
    expect(text).toContain(batch.tasks[0].title);
    expect(text).toContain(`Suggested agent: ${batch.tasks[0].agent}.`);
    expect(options).toEqual({ source: 'batch', endpoint: 'http://e', zeroCostMode: true, showPlanFirst: 'never', onProgress: undefined });
    expect(getBatchById(batch.id).tasks.every((t) => t.status === 'completed')).toBe(true);
  });

  it('a task whose request failed, or was only answered, is failed', async () => {
    const goal = createProjectGoal('Analytics dashboard', 'A dashboard');
    const batch = await generateBatch(goal.id);
    vi.mocked(answerOrPlan)
      .mockResolvedValueOnce({ kind: 'request', requestId: 'r', waitingForPlan: false, result: { ok: false } })
      .mockResolvedValueOnce({ kind: 'answer', text: 'just words' })
      .mockResolvedValue({ kind: 'request', requestId: 'r', waitingForPlan: false, result: { ok: true } });
    await executeBatch(batch.id, {});
    const statuses = getBatchById(batch.id).tasks.map((t) => t.status);
    expect(statuses.slice(0, 2)).toEqual(['failed', 'failed']);
    expect(statuses[2]).toBe('completed');
  });
});

// Jose phase 7: the batch is planned in one call; planned tasks run their steps, the rest as before.
describe('a batch planned in one call', () => {
  it('runs planned tasks as given steps and the others through answerOrPlan', async () => {
    const planner = await import('../../services/jose/josePlanner');
    const submit = await import('../../services/jose/submitToJose');
    const steps = [{ stepId: 'facts', agent: 'hector', actionType: 'research_report', effects: ['read'], needs: [] }];
    const goal = createProjectGoal('Analytics dashboard', 'A dashboard');
    const batch = await generateBatch(goal.id);
    const spyPlan = vi.spyOn(planner, 'planBatch').mockResolvedValue(batch.tasks.map((_t, i) => (i === 0 ? steps : null)));
    const spySubmit = vi.spyOn(submit, 'submitStepsToJose').mockResolvedValue({ ok: true, executionReceipts: [] });
    vi.mocked(answerOrPlan).mockResolvedValue({ kind: 'request', requestId: 'r', waitingForPlan: false, result: { ok: true, executionReceipts: [] } });
    await executeBatch(batch.id, { endpoint: 'http://e', zeroCostMode: true });
    expect(spyPlan).toHaveBeenCalledTimes(1);
    expect(spySubmit).toHaveBeenCalledTimes(1);
    expect(spySubmit.mock.calls[0][0]).toMatchObject({ source: 'batch', label: 'Steps planned for a batch.', steps });
    expect(vi.mocked(answerOrPlan)).toHaveBeenCalledTimes(batch.tasks.length - 1);
    expect(getBatchById(batch.id).tasks.every((t) => t.status === 'completed')).toBe(true);
    spyPlan.mockRestore();
    spySubmit.mockRestore();
  });
});
