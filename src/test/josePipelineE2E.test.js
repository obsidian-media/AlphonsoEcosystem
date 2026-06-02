import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/verificationService', () => ({
  verifyOllamaRuntimeProof: vi.fn(async () => ({
    id: 'runtime-proof-test',
    payload: { reachable: true }
  })),
  verifyProcessProof: vi.fn(async () => ({
    id: 'process-proof-test',
    payload: [{ running: true }]
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

import { runJoseCommandExecutionPipeline } from '../services/joseExecutionEngineService';
import { listOrchestrationReceipts } from '../services/orchestrationReceiptService';

describe('jose execution pipeline e2e', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('decomposes, executes safe assignments, and emits merge report receipts', async () => {
    const result = await runJoseCommandExecutionPipeline({
      commandText: 'ask jose: create a launch script and verify local runtime package',
      source: 'shayan',
      zeroCostMode: true
    });

    expect(result.ok).toBe(true);
    expect(result.commandId).toBeTruthy();
    expect(result.executedCount).toBeGreaterThan(0);
    expect(result.command?.shayanReport?.summary).toContain('Jose merged');

    const receipts = listOrchestrationReceipts({ commandId: result.commandId });
    const types = receipts.map((item) => item.eventType);
    expect(types).toContain('assignment_created');
    expect(types).toContain('pipeline_completed');
    expect(types).toContain('jose_merge_confirm_reported');
  });

  it('executes low-risk specialist agents without noisy approval or contract failures', async () => {
    const result = await runJoseCommandExecutionPipeline({
      commandText: 'ask jose: research launch positioning, create a campaign image prompt, audit approval policy, check security permissions, remember this decision, and score the opportunity priority',
      source: 'shayan',
      zeroCostMode: true
    });

    expect(result.ok).toBe(true);
    expect(result.failedCount).toBe(0);
    expect(result.pendingApprovalCount).toBe(0);
    expect(result.executedCount).toBeGreaterThanOrEqual(6);

    const summaries = result.command?.shayanReport?.assignmentSummaries || [];
    expect(summaries.map((item) => item.agent)).toEqual(expect.arrayContaining([
      'hector', 'miya', 'maria', 'sentinel', 'echo', 'nova'
    ]));
    expect(summaries.every((item) => item.reportStatus !== 'not_reported')).toBe(true);
    expect(result.command?.shayanReport?.contractFailures || []).toHaveLength(0);
  });
});

