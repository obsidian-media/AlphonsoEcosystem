import { beforeEach, describe, expect, it, vi } from 'vitest';

let runtimeReachable = true;

vi.mock('../services/runtimeLedgerService', () => ({
  persistScopeRows: vi.fn(async () => undefined)
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

import { getDLQ, isJoseIntakeCommand, retryDLQ, runJoseCommandExecutionPipeline } from '../services/joseExecutionEngineService';

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
    expect(dlq[0].error).toContain('failed');

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
