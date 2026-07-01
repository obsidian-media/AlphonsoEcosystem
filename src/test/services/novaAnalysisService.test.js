import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeOpportunityScores, classifyPriorityTier, buildNovaAnalysisPrompt,
  parseNovaAnalysisResponse, buildNovaFallbackAnalysis, setAlertThreshold,
  getAlertThreshold, getOpportunityHistory
} from '../../services/novaAnalysisService';

vi.mock('../../services/trustModel', () => ({
  TRUST_STATES: { VERIFIED: 'verified', INFERRED: 'inferred' },
  timestampMs: vi.fn(() => Date.now())
}));

vi.mock('../../services/memoryService', () => ({ pushMemoryItem: vi.fn() }));
vi.mock('../../services/sessionIntelligenceService', () => ({ appendSessionEvent: vi.fn() }));
vi.mock('../../services/orchestrationReceiptService', () => ({ appendOrchestrationReceipt: vi.fn() }));
vi.mock('../../services/novaFeedbackService', () => ({
  storeNovaScore: vi.fn(),
  getDecompositionHints: vi.fn(() => ({ hints: [] }))
}));
vi.mock('../../lib/durableStore', () => ({
  durableGet: vi.fn(() => null),
  durableSet: vi.fn()
}));
vi.mock('../../services/notificationService', () => ({ appendNotification: vi.fn() }));

describe('novaAnalysisService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('computeOpportunityScores', () => {
    it('returns scores for empty input', () => {
      const scores = computeOpportunityScores('', {});
      expect(scores.opportunityScore).toBe(0);
      expect(scores.riskScore).toBe(0);
      expect(typeof scores.valueScore).toBe('number');
    });

    it('detects execution intent signals', () => {
      const scores = computeOpportunityScores('build and launch the app', {});
      expect(scores.opportunityScore).toBeGreaterThan(0);
      expect(scores.opportunitySignals).toContain('execution_intent');
    });

    it('detects risk signals', () => {
      const scores = computeOpportunityScores('delete the database', {});
      expect(scores.riskScore).toBeGreaterThan(0);
      expect(scores.riskSignals).toContain('destructive_action');
    });

    it('adds bonus for completed prior agents', () => {
      const scores = computeOpportunityScores('test', { miya: { resultState: 'completed' } });
      expect(scores.opportunitySignals).toContain('miya_creative_ready');
    });
  });

  describe('classifyPriorityTier', () => {
    it('returns critical for high scores', () => {
      expect(classifyPriorityTier(80)).toBe('critical');
    });

    it('returns high for medium-high scores', () => {
      expect(classifyPriorityTier(60)).toBe('high');
    });

    it('returns medium for medium scores', () => {
      expect(classifyPriorityTier(40)).toBe('medium');
    });

    it('returns watchlist for low scores', () => {
      expect(classifyPriorityTier(20)).toBe('watchlist');
    });
  });

  describe('buildNovaAnalysisPrompt', () => {
    it('returns prompt with scores', () => {
      const prompt = buildNovaAnalysisPrompt('test', {}, { opportunityScore: 50, riskScore: 20, timingScore: 60, effortScore: 70, valueScore: 55 });
      expect(prompt).toContain('Nova');
      expect(prompt).toContain('test');
    });
  });

  describe('parseNovaAnalysisResponse', () => {
    it('parses valid JSON', () => {
      const json = JSON.stringify({ valueScore: 80, riskScore: 20, timingScore: 60, effortScore: 70, priorityTier: 'high', recommendation: 'Go for it', summary: 'Great opportunity' });
      const result = parseNovaAnalysisResponse(json);
      expect(result.valueScore).toBe(80);
      expect(result.priorityTier).toBe('high');
    });

    it('returns null for invalid JSON', () => {
      expect(parseNovaAnalysisResponse('not json')).toBeNull();
    });
  });

  describe('buildNovaFallbackAnalysis', () => {
    it('creates fallback for high value', () => {
      const result = buildNovaFallbackAnalysis({ valueScore: 80, riskScore: 10, timingScore: 60, effortScore: 70 });
      expect(result.priorityTier).toBe('critical');
      expect(result.recommendation).toContain('High-value');
    });

    it('creates fallback for low value', () => {
      const result = buildNovaFallbackAnalysis({ valueScore: 20, riskScore: 10, timingScore: 60, effortScore: 70 });
      expect(result.priorityTier).toBe('watchlist');
    });
  });

  describe('threshold management', () => {
    it('getAlertThreshold returns default', () => {
      expect(getAlertThreshold()).toBe(75);
    });

    it('setAlertThreshold stores value', () => {
      setAlertThreshold(80);
      expect(getAlertThreshold()).toBe(80);
    });

    it('setAlertThreshold clamps to 0-100', () => {
      setAlertThreshold(150);
      expect(getAlertThreshold()).toBe(100);
      setAlertThreshold(-10);
      expect(getAlertThreshold()).toBe(0);
    });
  });

  describe('getOpportunityHistory', () => {
    it('returns empty when nothing stored', () => {
      expect(getOpportunityHistory()).toEqual([]);
    });
  });
});
