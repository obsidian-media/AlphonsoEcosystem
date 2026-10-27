import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/runtimeLedgerService', () => ({
  persistScopeRows: vi.fn(async () => undefined)
}));

import {
  storeNovaScore,
  getNovaScore,
  getDecompositionHints,
  listRecentScores,
  computeScoreTrend,
  clearNovaScores,
  NOVA_SCORE_SCOPE
} from '../services/novaFeedbackService';

beforeEach(() => {
  localStorage.clear();
  clearNovaScores();
});

describe('storeNovaScore', () => {
  it('stores a numeric score for a command', () => {
    const entry = storeNovaScore('cmd-1', 75);
    expect(entry).toBeTruthy();
    expect(entry.commandId).toBe('cmd-1');
    expect(entry.score).toBe(75);
    expect(entry.timestampMs).toBeTruthy();
  });

  it('stores an object score extracting opportunityScore and riskScore', () => {
    const entry = storeNovaScore('cmd-2', { opportunityScore: 80, riskScore: 20 });
    expect(entry.opportunityScore).toBe(80);
    expect(entry.riskScore).toBe(20);
    expect(entry.score).toBe(80);
  });

  it('returns null for missing commandId', () => {
    expect(storeNovaScore(null, 50)).toBeNull();
    expect(storeNovaScore('', 50)).toBeNull();
  });

  it('returns null for missing score', () => {
    expect(storeNovaScore('cmd-3', null)).toBeNull();
    expect(storeNovaScore('cmd-3', undefined)).toBeNull();
  });

  it('returns null for NaN score', () => {
    expect(storeNovaScore('cmd-4', 'not-a-number')).toBeNull();
  });

  it('overwrites existing score for the same commandId', () => {
    storeNovaScore('cmd-dup', 30);
    const updated = storeNovaScore('cmd-dup', 90);
    expect(updated.score).toBe(90);
    const retrieved = getNovaScore('cmd-dup');
    expect(retrieved.score).toBe(90);
  });
});

describe('getNovaScore', () => {
  it('returns null for unknown command', () => {
    expect(getNovaScore('unknown')).toBeNull();
  });

  it('returns null for missing commandId', () => {
    expect(getNovaScore(null)).toBeNull();
    expect(getNovaScore('')).toBeNull();
  });

  it('retrieves a stored score', () => {
    storeNovaScore('cmd-10', 65);
    const result = getNovaScore('cmd-10');
    expect(result).toBeTruthy();
    expect(result.commandId).toBe('cmd-10');
    expect(result.score).toBe(65);
  });
});

describe('getDecompositionHints', () => {
  it('returns empty hints for unknown command', () => {
    const result = getDecompositionHints('unknown');
    expect(result.hints).toHaveLength(0);
    expect(result.score).toBeNull();
  });

  it('returns high opportunity hint for scores >= 70', () => {
    storeNovaScore('cmd-hi', { opportunityScore: 85, riskScore: 10 });
    const result = getDecompositionHints('cmd-hi');
    expect(result.hints.length).toBeGreaterThanOrEqual(1);
    const oppHint = result.hints.find((h) => h.type === 'opportunity_high');
    expect(oppHint).toBeTruthy();
    expect(oppHint.message).toContain('creative agents');
  });

  it('returns low opportunity hint for scores <= 30', () => {
    storeNovaScore('cmd-lo', { opportunityScore: 20, riskScore: 10 });
    const result = getDecompositionHints('cmd-lo');
    const loHint = result.hints.find((h) => h.type === 'opportunity_low');
    expect(loHint).toBeTruthy();
    expect(loHint.message).toContain('minimal agent delegation');
  });

  it('returns high risk hint for riskScore >= 70', () => {
    storeNovaScore('cmd-risk', { opportunityScore: 50, riskScore: 80 });
    const result = getDecompositionHints('cmd-risk');
    const riskHint = result.hints.find((h) => h.type === 'risk_high');
    expect(riskHint).toBeTruthy();
    expect(riskHint.message).toContain('Sentinel');
  });

  it('returns moderate risk hint for riskScore 40-69', () => {
    storeNovaScore('cmd-mod', { opportunityScore: 50, riskScore: 50 });
    const result = getDecompositionHints('cmd-mod');
    const modHint = result.hints.find((h) => h.type === 'risk_moderate');
    expect(modHint).toBeTruthy();
    expect(modHint.message).toContain('Maria governance');
  });

  it('returns favorable ratio hint when opportunity high and risk low', () => {
    storeNovaScore('cmd-fav', { opportunityScore: 80, riskScore: 10 });
    const result = getDecompositionHints('cmd-fav');
    const favHint = result.hints.find((h) => h.type === 'favorable_ratio');
    expect(favHint).toBeTruthy();
    expect(favHint.message).toContain('delegate broadly');
  });

  it('returns unfavorable ratio hint when risk high and opportunity low', () => {
    storeNovaScore('cmd-unfav', { opportunityScore: 20, riskScore: 80 });
    const result = getDecompositionHints('cmd-unfav');
    const unfavHint = result.hints.find((h) => h.type === 'unfavorable_ratio');
    expect(unfavHint).toBeTruthy();
    expect(unfavHint.message).toContain('pre-gates');
  });
});

describe('listRecentScores', () => {
  it('returns empty array when no scores stored', () => {
    expect(listRecentScores()).toHaveLength(0);
  });

  it('returns up to count scores', () => {
    storeNovaScore('cmd-1', 10);
    storeNovaScore('cmd-2', 20);
    storeNovaScore('cmd-3', 30);
    const recent = listRecentScores(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].commandId).toBe('cmd-2');
    expect(recent[1].commandId).toBe('cmd-3');
  });

  it('defaults to 10 when no count provided', () => {
    for (let i = 0; i < 15; i++) {
      storeNovaScore(`cmd-${i}`, i * 10);
    }
    const recent = listRecentScores();
    expect(recent).toHaveLength(10);
  });

  it('clamps count to valid range', () => {
    storeNovaScore('cmd-a', 5);
    const recent = listRecentScores(0);
    expect(recent).toHaveLength(1);
  });
});

describe('computeScoreTrend', () => {
  it('returns stable for empty array', () => {
    const result = computeScoreTrend([]);
    expect(result.trend).toBe('stable');
    expect(result.dataPoints).toBe(0);
  });

  it('returns stable for single data point', () => {
    const result = computeScoreTrend([{ score: 50 }]);
    expect(result.trend).toBe('stable');
    expect(result.dataPoints).toBe(1);
  });

  it('returns improving when second half averages higher', () => {
    const scores = [
      { score: 20 },
      { score: 20 },
      { score: 30 },
      { score: 80 },
      { score: 80 },
      { score: 90 }
    ];
    const result = computeScoreTrend(scores);
    expect(result.trend).toBe('improving');
    expect(result.delta).toBeGreaterThan(5);
  });

  it('returns declining when second half averages lower', () => {
    const scores = [
      { score: 90 },
      { score: 85 },
      { score: 80 },
      { score: 30 },
      { score: 25 },
      { score: 20 }
    ];
    const result = computeScoreTrend(scores);
    expect(result.trend).toBe('declining');
    expect(result.delta).toBeLessThan(-5);
  });

  it('returns stable when delta is within threshold', () => {
    const scores = [
      { score: 50 },
      { score: 52 },
      { score: 48 },
      { score: 51 }
    ];
    const result = computeScoreTrend(scores);
    expect(result.trend).toBe('stable');
  });

  it('handles entries with opportunityScore instead of score', () => {
    const scores = [
      { opportunityScore: 10 },
      { opportunityScore: 15 },
      { opportunityScore: 20 },
      { opportunityScore: 80 }
    ];
    const result = computeScoreTrend(scores);
    expect(result.trend).toBe('improving');
  });
});

describe('clearNovaScores', () => {
  it('clears all stored scores', () => {
    storeNovaScore('cmd-1', 50);
    storeNovaScore('cmd-2', 60);
    expect(listRecentScores()).toHaveLength(2);
    clearNovaScores();
    expect(listRecentScores()).toHaveLength(0);
  });

  it('returns null for getNovaScore after clear', () => {
    storeNovaScore('cmd-cleared', 40);
    clearNovaScores();
    expect(getNovaScore('cmd-cleared')).toBeNull();
  });
});

describe('NOVA_SCORE_SCOPE constant', () => {
  it('exports the scope constant', () => {
    expect(NOVA_SCORE_SCOPE).toBe('nova_scores_v1');
  });
});
