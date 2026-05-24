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
});

