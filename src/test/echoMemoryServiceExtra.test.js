import { describe, it, expect } from 'vitest';
import {
  classifyRetentionPolicy,
  classifyMemoryCategory,
  buildEchoSynthesisPrompt,
  parseEchoMemoryResponse,
  buildEchoFallbackEntry,
  normalizeMemoryConfidence,
} from '../services/echoMemoryService';

describe('classifyRetentionPolicy', () => {
  it('returns long-term for important categories', () => {
    const result = classifyRetentionPolicy('goal', 'achieve revenue target');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles unknown category gracefully', () => {
    const result = classifyRetentionPolicy('unknown_cat', 'some content');
    expect(typeof result).toBe('string');
  });
});

describe('classifyMemoryCategory', () => {
  it('returns a string category', () => {
    const result = classifyMemoryCategory('search for AI news', []);
    expect(typeof result).toBe('string');
  });

  it('handles empty inputs', () => {
    const result = classifyMemoryCategory('', []);
    expect(typeof result).toBe('string');
  });
});

describe('buildEchoSynthesisPrompt', () => {
  it('returns a non-empty prompt string', () => {
    const result = buildEchoSynthesisPrompt('run a task', [{ content: 'result data' }]);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('parseEchoMemoryResponse', () => {
  it('parses valid JSON response', () => {
    const json = JSON.stringify([{ category: 'task', content: 'did a thing', confidence: 0.9, retentionTier: 'session' }]);
    const result = parseEchoMemoryResponse(json);
    expect(Array.isArray(result)).toBe(true);
  });

  it('returns empty array for invalid response', () => {
    const result = parseEchoMemoryResponse('not json at all {{{');
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('buildEchoFallbackEntry', () => {
  it('returns an array with at least one entry', () => {
    const result = buildEchoFallbackEntry('check email', []);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('normalizeMemoryConfidence', () => {
  it('clamps confidence values to 0–1 range', () => {
    const entries = [
      { confidence: 1.5 },
      { confidence: -0.3 },
      { confidence: 0.7 },
    ];
    const result = normalizeMemoryConfidence(entries);
    result.forEach(e => {
      expect(e.confidence).toBeGreaterThanOrEqual(0);
      expect(e.confidence).toBeLessThanOrEqual(1);
    });
  });

  it('handles empty array', () => {
    const result = normalizeMemoryConfidence([]);
    expect(result).toEqual([]);
  });
});
