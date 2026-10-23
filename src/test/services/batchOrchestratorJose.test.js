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
