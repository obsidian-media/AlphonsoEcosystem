import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/approval/approvalService', () => ({
  listPendingApprovals: vi.fn(() => [{ id: 'a1' }, { id: 'a2' }])
}));

vi.mock('../services/memory/ecosystemMemoryService', () => ({
  listMemoryItems: vi.fn(() => [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }])
}));

vi.mock('../services/agentWorkshop/traceabilityService', () => ({
  listTraceEvents: vi.fn(() => [
    { generatedBy: 'jose', executionResult: 'failed', verificationState: 'failed', reason: 'dependency conflict' },
    { generatedBy: 'alphonso', executionResult: 'executed', verificationState: 'verified', reason: 'ok' },
    { generatedBy: 'jose', executionResult: 'executed', verificationState: 'verified', reason: 'ok' }
  ])
}));

vi.mock('../services/agentWorkshop/diffProposalService', () => ({
  listDiffProposals: vi.fn(() => [
    { id: 'p1', status: 'proposed' },
    { id: 'p2', status: 'approved' }
  ])
}));

vi.mock('../services/agentBusService', () => ({
  listAgentPackets: vi.fn(() => [
    { status: 'failed' },
    { status: 'ready' }
  ])
}));

vi.mock('../services/orchestrationQueueService', () => ({
  getOrchestrationQueueSnapshot: vi.fn(() => ({
    queued: 3,
    executing: 1,
    pendingApproval: 2,
    failed: 0,
    deadLetter: 0
  }))
}));

import {
  setLastBuildStatus,
  getLastBuildStatus,
  getSystemHealthSummary
} from '../services/systemHealth/systemHealthService';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('setLastBuildStatus / getLastBuildStatus', () => {
  it('defaults to unknown', () => {
    const status = getLastBuildStatus();
    expect(status.status).toBe('unknown');
    expect(status.message).toBe('');
    expect(status.updatedAt).toBeNull();
  });

  it('persists build status', () => {
    setLastBuildStatus({ status: 'passing', message: 'All tests green' });
    const status = getLastBuildStatus();
    expect(status.status).toBe('passing');
    expect(status.message).toBe('All tests green');
    expect(status.updatedAt).toBeTruthy();
  });

  it('defaults missing fields', () => {
    setLastBuildStatus({});
    const status = getLastBuildStatus();
    expect(status.status).toBe('unknown');
    expect(status.message).toBe('');
  });

  it('handles corrupted localStorage', () => {
    localStorage.setItem('alphonso_last_build_status_v1', 'not-json');
    const status = getLastBuildStatus();
    expect(status.status).toBe('unknown');
  });
});

describe('getSystemHealthSummary', () => {
  it('aggregates all health metrics', () => {
    const summary = getSystemHealthSummary();
    expect(summary.pendingApprovals).toBe(2);
    expect(summary.memoryLoad).toBe(3);
    expect(summary.orchestrationQueue).toBe(6); // 3+1+2+0+0
    expect(summary.openProposals).toBe(1);
  });

  it('counts failed tasks from traces and packets', () => {
    const summary = getSystemHealthSummary();
    expect(summary.failedAgentTasks).toBe(2); // 1 trace failed + 1 packet failed
  });

  it('counts dependency conflicts from traces', () => {
    const summary = getSystemHealthSummary();
    expect(summary.dependencyConflicts).toBe(1);
  });

  it('returns degraded verification when failures exist', () => {
    const summary = getSystemHealthSummary();
    expect(summary.verificationStatus).toBe('degraded');
  });

  it('counts active agents from traces', () => {
    const summary = getSystemHealthSummary();
    expect(summary.agentActivity).toBe(2); // jose + alphonso
  });

  it('includes build status', () => {
    setLastBuildStatus({ status: 'passing', message: 'ok' });
    const summary = getSystemHealthSummary();
    expect(summary.buildStatus.status).toBe('passing');
  });
});
