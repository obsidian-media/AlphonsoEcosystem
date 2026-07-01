import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getAgentDashboard, getAllAgentsDashboard, getPerformanceSummary,
  snapshotAgentPerformance, listPerformanceSnapshots, getPerformanceTrend,
  recordAgentExecutionWithPerformance
} from '../../services/agentPerformanceService';

vi.mock('../../services/trustModel', () => ({
  TRUST_STATES: { VERIFIED: 'verified', INFERRED: 'inferred', TEMPORARY: 'temporary', PENDING: 'pending', UNVERIFIED: 'unverified', FAILED: 'failed' },
  timestampMs: vi.fn(() => Date.now())
}));

vi.mock('../../services/agentMetricsService', () => ({
  getAgentMetrics: vi.fn(() => ({ totalExecutions: 0, successRate: 0, avgConfidence: 0, byAgent: {} })),
  getAgentSuccessRate: vi.fn(() => ({ ok: true, successRate: 100, total: 10, successful: 10, failed: 0 })),
  getAgentLatency: vi.fn(() => ({ ok: true, avgDurationMs: 100, medianDurationMs: 90, minDurationMs: 50, maxDurationMs: 200, samples: 10 })),
  getAgentApprovalRate: vi.fn(() => ({ ok: true, approvalRate: 90, approved: 9, approvalRequired: 10, pending: 1 })),
  recordAgentExecution: vi.fn(() => ({ id: 'test-entry' }))
}));

vi.mock('../../services/orchestrationGovernanceService', () => ({
  listGovernanceDecisions: vi.fn(() => [])
}));

describe('agentPerformanceService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('getAgentDashboard returns ok with valid name', () => {
    const result = getAgentDashboard('alphonso');
    expect(result.ok).toBe(true);
    expect(result.agentName).toBe('alphonso');
    expect(result.dashboard).toBeDefined();
  });

  it('getAgentDashboard rejects without name', () => {
    expect(getAgentDashboard().ok).toBe(false);
    expect(getAgentDashboard('').ok).toBe(false);
    expect(getAgentDashboard(123).ok).toBe(false);
  });

  it('getAgentDashboard includes all dashboard fields', () => {
    const result = getAgentDashboard('jose');
    const d = result.dashboard;
    expect(d).toHaveProperty('successRate');
    expect(d).toHaveProperty('totalExecutions');
    expect(d).toHaveProperty('avgDurationMs');
    expect(d).toHaveProperty('approvalRate');
    expect(d).toHaveProperty('avgConfidence');
    expect(d).toHaveProperty('topCommands');
    expect(d).toHaveProperty('trend');
  });

  it('getAllAgentsDashboard returns all 9 agents', () => {
    const result = getAllAgentsDashboard();
    expect(result.ok).toBe(true);
    expect(result.totalAgents).toBe(9);
    expect(result.agents).toHaveProperty('alphonso');
    expect(result.agents).toHaveProperty('jose');
    expect(result.agents).toHaveProperty('hector');
    expect(result.agents).toHaveProperty('miya');
    expect(result.agents).toHaveProperty('maria');
    expect(result.agents).toHaveProperty('marcus');
    expect(result.agents).toHaveProperty('echo');
    expect(result.agents).toHaveProperty('sentinel');
    expect(result.agents).toHaveProperty('nova');
  });

  it('getPerformanceSummary returns ok with summary', () => {
    const result = getPerformanceSummary();
    expect(result.ok).toBe(true);
    expect(result.summary).toBeDefined();
    expect(result.summary).toHaveProperty('totalExecutions');
    expect(result.summary).toHaveProperty('overallSuccessRate');
  });

  it('snapshotAgentPerformance creates a snapshot', () => {
    const result = snapshotAgentPerformance();
    expect(result.ok).toBe(true);
    expect(result.snapshot).toBeDefined();
    expect(result.snapshot.id).toContain('perf-snap-');
  });

  it('listPerformanceSnapshots returns array', () => {
    snapshotAgentPerformance();
    const list = listPerformanceSnapshots();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(1);
  });

  it('listPerformanceSnapshots respects limit', () => {
    snapshotAgentPerformance();
    snapshotAgentPerformance();
    const list = listPerformanceSnapshots(1);
    expect(list.length).toBe(1);
  });

  it('getPerformanceTrend returns trend data', () => {
    snapshotAgentPerformance();
    const result = getPerformanceTrend('alphonso', 30);
    expect(result.ok).toBe(true);
    expect(result.trend).toBeDefined();
    expect(Array.isArray(result.trend)).toBe(true);
  });

  it.skip('recordAgentExecutionWithPerformance calls recordAgentExecution', () => {
    const { recordAgentExecution } = require('../../services/agentMetricsService');
    const result = recordAgentExecutionWithPerformance({ agent: 'alphonso', command: 'test' });
    expect(recordAgentExecution).toHaveBeenCalled();
  });
});
