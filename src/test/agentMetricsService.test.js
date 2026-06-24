import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  recordAgentExecution,
  getAgentMetrics,
  getPerAgentBreakdown,
  getTopCommands,
  getSevenDayTrend
} from '../services/agentMetricsService';

vi.mock('../services/unifiedMemoryService', () => ({ listMemory: vi.fn(() => []) }));
vi.mock('../services/trustModel', () => ({
  timestampMs: vi.fn(() => Date.now())
}));

beforeEach(() => {
  localStorage.clear();
});

// ── recordAgentExecution ──────────────────────────────────────────────────────

describe('recordAgentExecution', () => {
  it('returns an entry with an id', () => {
    const entry = recordAgentExecution({ agent: 'hector', command: 'research AI trends', success: true, confidence: 80 });
    expect(entry).toHaveProperty('id');
  });

  it('records success correctly', () => {
    const entry = recordAgentExecution({ agent: 'miya', command: 'write script', success: true });
    expect(entry.success).toBe(true);
  });

  it('records failure correctly', () => {
    const entry = recordAgentExecution({ agent: 'jose', command: 'route task', success: false, error: 'timeout' });
    expect(entry.success).toBe(false);
    expect(entry.error).toBe('timeout');
  });

  it('defaults agent to alphonso if not provided', () => {
    const entry = recordAgentExecution({ command: 'some task', success: true });
    expect(entry.agent).toBe('alphonso');
  });

  it('truncates long commands to 200 chars', () => {
    const longCmd = 'x'.repeat(300);
    const entry = recordAgentExecution({ agent: 'jose', command: longCmd, success: true });
    expect(entry.command.length).toBeLessThanOrEqual(200);
  });

  it('defaults confidence to 50 if not provided', () => {
    const entry = recordAgentExecution({ agent: 'hector', command: 'task', success: true });
    expect(entry.confidence).toBe(50);
  });

  it('persists to localStorage', () => {
    recordAgentExecution({ agent: 'maria', command: 'audit', success: true });
    const raw = localStorage.getItem('alphonso_agent_metrics_v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  it('accumulates multiple entries', () => {
    recordAgentExecution({ agent: 'hector', command: 'task1', success: true });
    recordAgentExecution({ agent: 'miya', command: 'task2', success: false });
    const raw = JSON.parse(localStorage.getItem('alphonso_agent_metrics_v1'));
    expect(raw.length).toBe(2);
  });
});

// ── getAgentMetrics ───────────────────────────────────────────────────────────

describe('getAgentMetrics', () => {
  beforeEach(() => {
    recordAgentExecution({ agent: 'hector', command: 'research', success: true, confidence: 90, filesWritten: 2, validationPassed: true, iterations: 3, durationMs: 1200 });
    recordAgentExecution({ agent: 'hector', command: 'scan', success: false, confidence: 40, filesWritten: 0, validationPassed: false, iterations: 1, durationMs: 500 });
    recordAgentExecution({ agent: 'miya', command: 'script', success: true, confidence: 75, filesWritten: 1, validationPassed: true, iterations: 2, durationMs: 800 });
  });

  it('returns totalExecutions count', () => {
    const metrics = getAgentMetrics();
    expect(metrics.totalExecutions).toBe(3);
  });

  it('filters by agent', () => {
    const metrics = getAgentMetrics({ agent: 'hector' });
    expect(metrics.totalExecutions).toBe(2);
  });

  it('computes successRate as percentage', () => {
    const metrics = getAgentMetrics({ agent: 'hector' });
    expect(metrics.successRate).toBe(50);
  });

  it('computes avgConfidence', () => {
    const metrics = getAgentMetrics({ agent: 'hector' });
    expect(metrics.avgConfidence).toBe(65); // (90+40)/2
  });

  it('returns topCommands array', () => {
    const metrics = getAgentMetrics();
    expect(Array.isArray(metrics.topCommands)).toBe(true);
  });

  it('returns errorPatterns array', () => {
    const metrics = getAgentMetrics();
    expect(Array.isArray(metrics.errorPatterns)).toBe(true);
  });

  it('returns zero metrics for empty dataset', () => {
    localStorage.clear();
    const metrics = getAgentMetrics();
    expect(metrics.totalExecutions).toBe(0);
    expect(metrics.successRate).toBe(0);
  });

  it('returns validationPassRate', () => {
    const metrics = getAgentMetrics();
    expect(typeof metrics.validationPassRate).toBe('number');
  });
});

// ── getPerAgentBreakdown ──────────────────────────────────────────────────────

describe('getPerAgentBreakdown', () => {
  beforeEach(() => {
    recordAgentExecution({ agent: 'sentinel', command: 'scan', success: true, confidence: 80 });
    recordAgentExecution({ agent: 'nova', command: 'score', success: true, confidence: 70 });
    recordAgentExecution({ agent: 'sentinel', command: 'audit', success: false, confidence: 30 });
  });

  it('returns an object keyed by agent', () => {
    const breakdown = getPerAgentBreakdown();
    expect(breakdown).toHaveProperty('sentinel');
    expect(breakdown).toHaveProperty('nova');
  });

  it('counts executions per agent correctly', () => {
    const breakdown = getPerAgentBreakdown();
    expect(breakdown.sentinel.total).toBe(2);
    expect(breakdown.nova.total).toBe(1);
  });

  it('computes per-agent successRate', () => {
    const breakdown = getPerAgentBreakdown();
    expect(breakdown.sentinel.successRate).toBe(50);
    expect(breakdown.nova.successRate).toBe(100);
  });
});

// ── getTopCommands ────────────────────────────────────────────────────────────

describe('getTopCommands', () => {
  beforeEach(() => {
    for (let i = 0; i < 3; i++) recordAgentExecution({ agent: 'hector', command: 'research AI', success: true });
    recordAgentExecution({ agent: 'miya', command: 'write script', success: true });
    recordAgentExecution({ agent: 'miya', command: 'write script', success: true });
    recordAgentExecution({ agent: 'jose', command: 'route task', success: true });
  });

  it('returns an array', () => {
    expect(Array.isArray(getTopCommands())).toBe(true);
  });

  it('orders commands by frequency descending', () => {
    const top = getTopCommands(3);
    expect(top[0].command).toBe('research ai');
    expect(top[0].count).toBe(3);
  });

  it('respects the limit parameter', () => {
    const top = getTopCommands(1);
    expect(top.length).toBe(1);
  });
});

// ── getSevenDayTrend ──────────────────────────────────────────────────────────

describe('getSevenDayTrend', () => {
  it('returns an array', () => {
    const trend = getSevenDayTrend();
    expect(Array.isArray(trend)).toBe(true);
  });

  it('returns 7 entries', () => {
    const trend = getSevenDayTrend();
    expect(trend.length).toBe(7);
  });

  it('each entry has a date and count', () => {
    recordAgentExecution({ agent: 'hector', command: 'task', success: true });
    const trend = getSevenDayTrend();
    expect(trend[6]).toHaveProperty('date');
    expect(trend[6]).toHaveProperty('executions');
  });
});
