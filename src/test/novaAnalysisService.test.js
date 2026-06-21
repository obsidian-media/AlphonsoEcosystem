import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeOpportunityScores,
  classifyPriorityTier,
  buildNovaAnalysisPrompt,
  parseNovaAnalysisResponse,
  buildNovaFallbackAnalysis,
  runNovaAnalysis
} from '../services/novaAnalysisService';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../services/memoryService', () => ({ pushMemoryItem: vi.fn() }));
vi.mock('../services/sessionIntelligenceService', () => ({ appendSessionEvent: vi.fn() }));
vi.mock('../services/orchestrationReceiptService', () => ({ appendOrchestrationReceipt: vi.fn() }));
vi.mock('../services/novaFeedbackService', () => ({
  storeNovaScore: vi.fn(() => ({ commandId: 'test_cmd', score: 60 })),
  getDecompositionHints: vi.fn(() => ({ hints: [{ type: 'opportunity_high', message: 'High opportunity' }], score: null }))
}));
vi.mock('../lib/ollama', () => ({
  generateOllamaResponse: vi.fn(async () => ({
    response: JSON.stringify({
      valueScore: 72,
      riskScore: 15,
      timingScore: 80,
      effortScore: 60,
      priorityTier: 'high',
      recommendation: 'Prioritize Miya and Hector for this creative build.',
      summary: 'High-value, low-risk product opportunity.'
    }),
    done: true
  })),
  PREFERRED_MODEL: 'qwen2.5-coder:7b'
}));

// ── computeOpportunityScores ──────────────────────────────────────────────────

describe('computeOpportunityScores', () => {
  it('returns all required score fields', () => {
    const result = computeOpportunityScores('build a SaaS app', {});
    expect(result).toHaveProperty('opportunityScore');
    expect(result).toHaveProperty('riskScore');
    expect(result).toHaveProperty('timingScore');
    expect(result).toHaveProperty('effortScore');
    expect(result).toHaveProperty('valueScore');
  });

  it('scores high for product build with market signals', () => {
    const result = computeOpportunityScores('build a SaaS dashboard for customers with revenue model', {});
    expect(result.opportunityScore).toBeGreaterThan(30);
  });

  it('scores risk for delete + publish + credential signals', () => {
    const result = computeOpportunityScores('delete production database and publish api_key credentials', {});
    expect(result.riskScore).toBeGreaterThan(40);
  });

  it('bonus applied for completed Miya output', () => {
    const base = computeOpportunityScores('create content', {});
    const withMiya = computeOpportunityScores('create content', { miya: { resultState: 'completed' } });
    expect(withMiya.opportunityScore).toBeGreaterThan(base.opportunityScore);
  });

  it('bonus applied for completed Hector output', () => {
    const base = computeOpportunityScores('research topic', {});
    const withHector = computeOpportunityScores('research topic', { hector: { resultState: 'completed' } });
    expect(withHector.opportunityScore).toBeGreaterThan(base.opportunityScore);
  });

  it('risk score increases with failed prior agents', () => {
    const base = computeOpportunityScores('task', {});
    const withFailed = computeOpportunityScores('task', { hector: { resultState: 'failed' } });
    expect(withFailed.riskScore).toBeGreaterThan(base.riskScore);
  });

  it('clamps scores between 0 and 100', () => {
    const result = computeOpportunityScores('build create launch design research saas app platform market audience growth automation workflow revenue monetize ai machine learning', {});
    expect(result.opportunityScore).toBeLessThanOrEqual(100);
    expect(result.opportunityScore).toBeGreaterThanOrEqual(0);
    expect(result.riskScore).toBeLessThanOrEqual(100);
  });

  it('returns signal arrays', () => {
    const result = computeOpportunityScores('build a product', {});
    expect(Array.isArray(result.opportunitySignals)).toBe(true);
    expect(Array.isArray(result.riskSignals)).toBe(true);
  });

  it('valueScore is computed from opportunity and risk', () => {
    const result = computeOpportunityScores('safe research task', {});
    expect(typeof result.valueScore).toBe('number');
    expect(result.valueScore).toBeGreaterThanOrEqual(0);
    expect(result.valueScore).toBeLessThanOrEqual(100);
  });
});

// ── classifyPriorityTier ──────────────────────────────────────────────────────

describe('classifyPriorityTier', () => {
  it('returns critical for valueScore >= 75', () => {
    expect(classifyPriorityTier(80)).toBe('critical');
    expect(classifyPriorityTier(75)).toBe('critical');
  });

  it('returns high for 55-74', () => {
    expect(classifyPriorityTier(60)).toBe('high');
    expect(classifyPriorityTier(55)).toBe('high');
  });

  it('returns medium for 35-54', () => {
    expect(classifyPriorityTier(40)).toBe('medium');
    expect(classifyPriorityTier(35)).toBe('medium');
  });

  it('returns watchlist for < 35', () => {
    expect(classifyPriorityTier(20)).toBe('watchlist');
    expect(classifyPriorityTier(0)).toBe('watchlist');
  });
});

// ── buildNovaAnalysisPrompt ───────────────────────────────────────────────────

describe('buildNovaAnalysisPrompt', () => {
  it('returns a non-empty string', () => {
    const p = buildNovaAnalysisPrompt('build a SaaS app', {}, { opportunityScore: 60, riskScore: 20, timingScore: 70, effortScore: 80, valueScore: 52 });
    expect(typeof p).toBe('string');
    expect(p.length).toBeGreaterThan(50);
  });

  it('includes command text', () => {
    const p = buildNovaAnalysisPrompt('launch product today', {}, { opportunityScore: 50, riskScore: 10, timingScore: 60, effortScore: 70, valueScore: 44 });
    expect(p).toContain('launch product today');
  });

  it('references JSON output format', () => {
    const p = buildNovaAnalysisPrompt('x', {}, { opportunityScore: 0, riskScore: 0, timingScore: 0, effortScore: 0, valueScore: 0 });
    expect(p).toMatch(/json|valueScore|priorityTier/i);
  });

  it('includes deterministic scores in prompt', () => {
    const scores = { opportunityScore: 65, riskScore: 12, timingScore: 70, effortScore: 80, valueScore: 56 };
    const p = buildNovaAnalysisPrompt('x', {}, scores);
    expect(p).toContain('65');
  });
});

// ── parseNovaAnalysisResponse ─────────────────────────────────────────────────

describe('parseNovaAnalysisResponse', () => {
  it('parses valid JSON', () => {
    const text = JSON.stringify({ valueScore: 72, riskScore: 15, timingScore: 80, effortScore: 60, priorityTier: 'high', recommendation: 'Go for it', summary: 'Looks good' });
    const result = parseNovaAnalysisResponse(text);
    expect(result.valueScore).toBe(72);
    expect(result.priorityTier).toBe('high');
    expect(result.recommendation).toBe('Go for it');
  });

  it('extracts JSON from prose', () => {
    const text = 'Analysis result: {"valueScore":50,"riskScore":20,"timingScore":60,"effortScore":70,"priorityTier":"medium","recommendation":"ok","summary":"medium"} end';
    const result = parseNovaAnalysisResponse(text);
    expect(result.priorityTier).toBe('medium');
  });

  it('returns null on parse failure', () => {
    const result = parseNovaAnalysisResponse('not json at all');
    expect(result).toBeNull();
  });

  it('clamps valueScore to 0-100', () => {
    const text = JSON.stringify({ valueScore: 150, riskScore: -10, timingScore: 200, effortScore: -5, priorityTier: 'high', recommendation: 'x', summary: 'y' });
    const result = parseNovaAnalysisResponse(text);
    expect(result.valueScore).toBeLessThanOrEqual(100);
    expect(result.riskScore).toBeGreaterThanOrEqual(0);
  });

  it('normalizes unknown priorityTier to medium', () => {
    const text = JSON.stringify({ valueScore: 50, riskScore: 10, timingScore: 50, effortScore: 50, priorityTier: 'ultra_critical', recommendation: 'x', summary: 'y' });
    const result = parseNovaAnalysisResponse(text);
    expect(result.priorityTier).toBe('medium');
  });
});

// ── buildNovaFallbackAnalysis ─────────────────────────────────────────────────

describe('buildNovaFallbackAnalysis', () => {
  it('returns priorityTier from scores', () => {
    const result = buildNovaFallbackAnalysis({ valueScore: 80, riskScore: 10, timingScore: 70, effortScore: 80 });
    expect(result.priorityTier).toBe('critical');
  });

  it('returns a recommendation string', () => {
    const result = buildNovaFallbackAnalysis({ valueScore: 40, riskScore: 20, timingScore: 50, effortScore: 60 });
    expect(typeof result.recommendation).toBe('string');
    expect(result.recommendation.length).toBeGreaterThan(0);
  });

  it('returns a summary string', () => {
    const result = buildNovaFallbackAnalysis({ valueScore: 30, riskScore: 30, timingScore: 40, effortScore: 50 });
    expect(typeof result.summary).toBe('string');
  });

  it('returns all score fields', () => {
    const scores = { valueScore: 55, riskScore: 20, timingScore: 70, effortScore: 60 };
    const result = buildNovaFallbackAnalysis(scores);
    expect(result).toHaveProperty('valueScore');
    expect(result).toHaveProperty('riskScore');
    expect(result).toHaveProperty('timingScore');
    expect(result).toHaveProperty('effortScore');
  });
});

// ── runNovaAnalysis ───────────────────────────────────────────────────────────

describe('runNovaAnalysis', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns summary string', async () => {
    const result = await runNovaAnalysis('build a product', {}, {});
    expect(typeof result.summary).toBe('string');
  });

  it('returns artifacts array', async () => {
    const result = await runNovaAnalysis('build', {}, {});
    expect(Array.isArray(result.artifacts)).toBe(true);
  });

  it('includes opportunity_score artifact', async () => {
    const result = await runNovaAnalysis('build', {}, {});
    const types = result.artifacts.map((a) => a.type);
    expect(types).toContain('opportunity_score');
  });

  it('includes nova_opportunity_schema artifact', async () => {
    const result = await runNovaAnalysis('build', {}, {});
    const types = result.artifacts.map((a) => a.type);
    expect(types).toContain('nova_opportunity_schema');
  });

  it('schema includes opportunityId', async () => {
    const result = await runNovaAnalysis('build', {}, {});
    const schemaArtifact = result.artifacts.find((a) => a.type === 'nova_opportunity_schema');
    expect(schemaArtifact?.schema).toHaveProperty('opportunityId');
  });

  it('schema includes priorityTier', async () => {
    const result = await runNovaAnalysis('build', {}, {});
    const schemaArtifact = result.artifacts.find((a) => a.type === 'nova_opportunity_schema');
    expect(schemaArtifact?.schema).toHaveProperty('priorityTier');
  });

  it('schema includes recommendation', async () => {
    const result = await runNovaAnalysis('build a SaaS product', {}, {});
    const schemaArtifact = result.artifacts.find((a) => a.type === 'nova_opportunity_schema');
    expect(schemaArtifact?.schema).toHaveProperty('recommendation');
  });

  it('always returns completed resultState', async () => {
    const result = await runNovaAnalysis('any task', {}, {});
    expect(result.resultState).toBe('completed');
  });

  it('uses fallback when Ollama throws', async () => {
    const { generateOllamaResponse } = await import('../lib/ollama');
    generateOllamaResponse.mockRejectedValueOnce(new Error('Ollama offline'));
    const result = await runNovaAnalysis('build', {}, {});
    expect(result).toHaveProperty('summary');
    expect(Array.isArray(result.artifacts)).toBe(true);
  });

  it('handles null assignment gracefully', async () => {
    const result = await runNovaAnalysis('', null, {});
    expect(result).toHaveProperty('summary');
  });

  it('returns contractAction', async () => {
    const result = await runNovaAnalysis('analyze opportunity', { actionType: 'opportunity_analysis' }, {});
    expect(result).toHaveProperty('contractAction');
  });
});
