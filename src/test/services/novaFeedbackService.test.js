import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NOVA_SCORE_SCOPE, storeNovaScore, getNovaScore, getDecompositionHints,
  listRecentScores, computeScoreTrend, clearNovaScores
} from '../../services/novaFeedbackService';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => {})
}));

vi.mock('../../services/trustModel', () => ({
  timestampMs: vi.fn(() => Date.now())
}));

vi.mock('../../services/runtimeLedgerService', () => ({
  persistScopeRows: vi.fn(async () => {})
}));

describe('novaFeedbackService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('NOVA_SCORE_SCOPE is defined', () => {
    expect(NOVA_SCORE_SCOPE).toBe('nova_scores_v1');
  });

  describe('storeNovaScore', () => {
    it('stores a score', () => {
      const entry = storeNovaScore('cmd-1', { opportunityScore: 80, riskScore: 20 });
      expect(entry).toBeTruthy();
      expect(entry.commandId).toBe('cmd-1');
      expect(entry.opportunityScore).toBe(80);
    });

    it('returns null for missing commandId', () => {
      expect(storeNovaScore(null, 50)).toBeNull();
    });

    it('returns null for NaN scores', () => {
      expect(storeNovaScore('cmd', { opportunityScore: NaN })).toBeNull();
    });

    it('updates existing score', () => {
      storeNovaScore('cmd-1', { opportunityScore: 80, riskScore: 20 });
      const updated = storeNovaScore('cmd-1', { opportunityScore: 90, riskScore: 10 });
      expect(updated.opportunityScore).toBe(90);
    });
  });

  describe('getNovaScore', () => {
    it('returns null for missing', () => {
      expect(getNovaScore('missing')).toBeNull();
    });

    it('returns stored score', () => {
      storeNovaScore('cmd-1', { opportunityScore: 80, riskScore: 20 });
      const score = getNovaScore('cmd-1');
      expect(score.opportunityScore).toBe(80);
    });
  });

  describe('getDecompositionHints', () => {
    it('returns empty for missing score', () => {
      const result = getDecompositionHints('missing');
      expect(result.hints.length).toBe(0);
    });

    it('generates hints for high opportunity', () => {
      storeNovaScore('cmd-1', { opportunityScore: 80, riskScore: 10 });
      const result = getDecompositionHints('cmd-1');
      expect(result.hints.some(h => h.type === 'opportunity_high')).toBe(true);
    });

    it('generates hints for high risk', () => {
      storeNovaScore('cmd-1', { opportunityScore: 50, riskScore: 80 });
      const result = getDecompositionHints('cmd-1');
      expect(result.hints.some(h => h.type === 'risk_high')).toBe(true);
    });

    it('generates favorable ratio hint', () => {
      storeNovaScore('cmd-1', { opportunityScore: 70, riskScore: 10 });
      const result = getDecompositionHints('cmd-1');
      expect(result.hints.some(h => h.type === 'favorable_ratio')).toBe(true);
    });
  });

  describe('listRecentScores', () => {
    it('returns scores in order', () => {
      storeNovaScore('cmd-1', { opportunityScore: 10, riskScore: 0 });
      storeNovaScore('cmd-2', { opportunityScore: 20, riskScore: 0 });
      const list = listRecentScores(2);
      expect(list.length).toBe(2);
    });

    it('respects count limit', () => {
      storeNovaScore('cmd-1', { opportunityScore: 10, riskScore: 0 });
      storeNovaScore('cmd-2', { opportunityScore: 20, riskScore: 0 });
      storeNovaScore('cmd-3', { opportunityScore: 30, riskScore: 0 });
      expect(listRecentScores(2).length).toBe(2);
    });
  });

  describe('computeScoreTrend', () => {
    it('returns stable for less than 2 scores', () => {
      const result = computeScoreTrend([{ score: 50 }]);
      expect(result.trend).toBe('stable');
    });

    it('detects improving trend', () => {
      const scores = [{ score: 20 }, { score: 30 }, { score: 40 }, { score: 50 }];
      const result = computeScoreTrend(scores);
      expect(result.trend).toBe('improving');
    });

    it('detects declining trend', () => {
      const scores = [{ score: 80 }, { score: 70 }, { score: 60 }, { score: 50 }];
      const result = computeScoreTrend(scores);
      expect(result.trend).toBe('declining');
    });

    it('detects stable trend', () => {
      const scores = [{ score: 50 }, { score: 50 }, { score: 50 }, { score: 50 }];
      const result = computeScoreTrend(scores);
      expect(result.trend).toBe('stable');
    });
  });

  describe('clearNovaScores', () => {
    it('clears all scores', () => {
      storeNovaScore('cmd-1', { opportunityScore: 80, riskScore: 20 });
      clearNovaScores();
      expect(listRecentScores().length).toBe(0);
    });
  });
});
