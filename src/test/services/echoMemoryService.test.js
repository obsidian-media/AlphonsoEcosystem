import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  classifyRetentionPolicy, classifyMemoryCategory, buildEchoSynthesisPrompt,
  parseEchoMemoryResponse, buildEchoFallbackEntry, normalizeMemoryConfidence
} from '../../services/echoMemoryService';

vi.mock('../../services/trustModel', () => ({
  TRUST_STATES: { VERIFIED: 'verified', INFERRED: 'inferred', TEMPORARY: 'temporary', PENDING: 'pending', UNVERIFIED: 'unverified', FAILED: 'failed' },
  timestampMs: vi.fn(() => Date.now())
}));

vi.mock('../../services/memoryService', () => ({
  pushMemoryItem: vi.fn(),
  listMemoryItems: vi.fn(() => [])
}));

vi.mock('../../services/chromaDbService.js', () => ({
  addMemoryToChroma: vi.fn(),
  semanticSearchMemory: vi.fn(async () => []),
  isChromaHealthy: vi.fn(() => true)
}));

vi.mock('../../services/sessionIntelligenceService', () => ({
  appendSessionEvent: vi.fn()
}));

describe('echoMemoryService', () => {
  describe('classifyRetentionPolicy', () => {
    it('returns permanent for decision keywords', () => {
      expect(classifyRetentionPolicy('decision', 'approved')).toBe('permanent');
    });

    it('returns ephemeral_7d for debug keywords', () => {
      expect(classifyRetentionPolicy('debug', 'test')).toBe('ephemeral_7d');
    });

    it('returns standard_180d as default', () => {
      expect(classifyRetentionPolicy('unknown', 'something')).toBe('standard_180d');
    });

    it('returns standard_180d for research keywords', () => {
      expect(classifyRetentionPolicy('research', 'findings')).toBe('standard_180d');
    });
  });

  describe('classifyMemoryCategory', () => {
    it('returns timeline_memory for decision keywords', () => {
      expect(classifyMemoryCategory('approved the plan')).toBe('timeline_memory');
    });

    it('returns preference_memory for preference keywords', () => {
      expect(classifyMemoryCategory('always use dark mode')).toBe('preference_memory');
    });

    it('returns orchestration_memory for orchestration keywords', () => {
      expect(classifyMemoryCategory('orchestrate the pipeline')).toBe('orchestration_memory');
    });

    it('returns orchestration_memory for jose agent', () => {
      expect(classifyMemoryCategory('test', { jose: {} })).toBe('orchestration_memory');
    });

    it('returns project_memory as default', () => {
      expect(classifyMemoryCategory('build something')).toBe('project_memory');
    });
  });

  describe('buildEchoSynthesisPrompt', () => {
    it('returns a prompt with command text', () => {
      const prompt = buildEchoSynthesisPrompt('test command', {});
      expect(prompt).toContain('Echo');
      expect(prompt).toContain('test command');
    });

    it('includes agent outputs', () => {
      const prompt = buildEchoSynthesisPrompt('cmd', { hector: { summary: 'research done' } });
      expect(prompt).toContain('hector');
      expect(prompt).toContain('research done');
    });
  });

  describe('parseEchoMemoryResponse', () => {
    it('parses valid JSON', () => {
      const json = JSON.stringify({ title: 'Test', content: 'Content here', category: 'project_memory', sensitivity: 'internal', retentionPolicy: 'standard_180d' });
      const result = parseEchoMemoryResponse(json);
      expect(result.title).toBe('Test');
      expect(result.content).toBe('Content here');
    });

    it('returns defaults for invalid JSON', () => {
      const result = parseEchoMemoryResponse('not json');
      expect(result.title).toBe('Echo memory entry');
      expect(result.category).toBe('project_memory');
    });

    it('sanitizes invalid categories', () => {
      const json = JSON.stringify({ title: 'T', content: 'C', category: 'invalid' });
      const result = parseEchoMemoryResponse(json);
      expect(result.category).toBe('project_memory');
    });
  });

  describe('buildEchoFallbackEntry', () => {
    it('creates fallback with command text', () => {
      const entry = buildEchoFallbackEntry('test command', {});
      expect(entry.title).toContain('test command');
      expect(entry.confidenceLevel).toBe('UNVERIFIED');
    });

    it('includes agent summaries', () => {
      const entry = buildEchoFallbackEntry('cmd', { hector: { summary: 'done' } });
      expect(entry.content).toContain('hector');
    });
  });

  describe('normalizeMemoryConfidence', () => {
    it('returns empty for empty input', () => {
      expect(normalizeMemoryConfidence([])).toEqual([]);
    });

  it('normalizes confidence levels', () => {
    const entries = [{ confidence: 'verified' }, { confidence: 'pending' }];
    const result = normalizeMemoryConfidence(entries);
    expect(result[0].confidence).toBe('verified');
    expect(result[1].confidence).toBeDefined();
  });
  });
});
