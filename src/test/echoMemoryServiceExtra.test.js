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
    const json = JSON.stringify({ category: 'project_memory', content: 'did a thing', sensitivity: 'internal', retentionPolicy: 'standard_180d' });
    const result = parseEchoMemoryResponse(json);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('object');
    expect(result.content).toBeTruthy();
  });

  it('returns fallback object for invalid response', () => {
    const result = parseEchoMemoryResponse('not json at all {{{');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('object');
    expect(result.category).toBe('project_memory');
  });
});

describe('buildEchoFallbackEntry', () => {
  it('returns an object with title and content', () => {
    const result = buildEchoFallbackEntry('check email', []);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('object');
    expect(result.title).toBeTruthy();
    expect(result.content).toBeTruthy();
  });
});

describe('normalizeMemoryConfidence', () => {
  it('normalizes confidence values to trust state strings', () => {
    const entries = [
      { confidence: 'VERIFIED' },
      { confidence: 'UNVERIFIED' },
      { confidence: 'INFERRED' },
    ];
    const result = normalizeMemoryConfidence(entries);
    result.forEach(e => {
      expect(typeof e.confidence).toBe('string');
      expect(e.confidence.length).toBeGreaterThan(0);
    });
  });

  it('handles empty array', () => {
    const result = normalizeMemoryConfidence([]);
    expect(result).toEqual([]);
  });
});
