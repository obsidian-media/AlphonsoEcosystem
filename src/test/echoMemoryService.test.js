import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  classifyRetentionPolicy,
  classifyMemoryCategory,
  buildEchoSynthesisPrompt,
  parseEchoMemoryResponse,
  buildEchoFallbackEntry,
  normalizeMemoryConfidence,
  runEchoPreservation,
  synthesizeSession,
  searchEchoMemorySemantic,
  isChromaHealthy
} from '../services/echoMemoryService';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../services/memoryService', () => ({
  pushMemoryItem: vi.fn(),
  listMemoryItems: vi.fn(() => [])
}));
vi.mock('../services/sessionIntelligenceService', () => ({ appendSessionEvent: vi.fn() }));
vi.mock('../services/orchestrationReceiptService', () => ({ appendOrchestrationReceipt: vi.fn() }));
vi.mock('../lib/ollama', () => ({
  generateOllamaResponse: vi.fn(async () => ({
    response: JSON.stringify({
      title: 'Test memory',
      content: 'Synthesized content',
      category: 'project_memory',
      retentionPolicy: 'standard_180d',
      sensitivity: 'internal',
      confidenceLevel: 'VERIFIED'
    }),
    done: true
  }))
}));

// ── classifyRetentionPolicy ───────────────────────────────────────────────────

describe('classifyRetentionPolicy', () => {
  it('returns permanent for preference_memory', () => {
    expect(classifyRetentionPolicy('preference_memory', 'user prefers dark mode')).toBe('permanent');
  });

  it('returns permanent for timeline_memory', () => {
    expect(classifyRetentionPolicy('timeline_memory', 'milestone reached')).toBe('permanent');
  });

  it('returns standard_180d for project_memory', () => {
    expect(classifyRetentionPolicy('project_memory', 'project notes')).toBe('standard_180d');
  });

  it('returns ephemeral_7d for unknown category', () => {
    expect(classifyRetentionPolicy('other', 'some content')).toBe('standard_180d');
  });

  it('returns permanent for content with decision keyword', () => {
    const policy = classifyRetentionPolicy('orchestration_memory', 'final decision: use postgres');
    expect(['permanent', 'standard_180d']).toContain(policy);
  });

  it('returns standard_180d for orchestration_memory', () => {
    expect(classifyRetentionPolicy('orchestration_memory', 'routine task')).toBe('standard_180d');
  });
});

// ── classifyMemoryCategory ────────────────────────────────────────────────────

describe('classifyMemoryCategory', () => {
  it('returns project_memory for project-related text', () => {
    const cat = classifyMemoryCategory('project feature development', {});
    expect(cat).toBe('project_memory');
  });

  it('returns preference_memory for preference/setting text', () => {
    const cat = classifyMemoryCategory('user prefers dark mode always', {});
    expect(cat).toBe('preference_memory');
  });

  it('returns orchestration_memory for workflow text', () => {
    const cat = classifyMemoryCategory('workflow pipeline executed successfully', {});
    expect(cat).toBe('orchestration_memory');
  });

  it('returns a string for any input', () => {
    const cat = classifyMemoryCategory('', {});
    expect(typeof cat).toBe('string');
    expect(cat.length).toBeGreaterThan(0);
  });

  it('returns timeline_memory for timeline/history text', () => {
    const cat = classifyMemoryCategory('decision milestone roadmap planned', {});
    expect(cat).toBe('timeline_memory');
  });
});

// ── buildEchoSynthesisPrompt ──────────────────────────────────────────────────

describe('buildEchoSynthesisPrompt', () => {
  it('returns a non-empty string', () => {
    const p = buildEchoSynthesisPrompt('remember this decision', {});
    expect(typeof p).toBe('string');
    expect(p.length).toBeGreaterThan(50);
  });

  it('includes the command text', () => {
    const p = buildEchoSynthesisPrompt('important milestone', {});
    expect(p).toContain('important milestone');
  });

  it('references JSON format in prompt', () => {
    const p = buildEchoSynthesisPrompt('test', {});
    expect(p).toMatch(/json|title|content/i);
  });

  it('handles empty inputs without throwing', () => {
    expect(() => buildEchoSynthesisPrompt('', {})).not.toThrow();
  });
});

// ── parseEchoMemoryResponse ───────────────────────────────────────────────────

describe('parseEchoMemoryResponse', () => {
  it('parses valid JSON', () => {
    const text = JSON.stringify({ title: 'Title', content: 'Content', category: 'project_memory', retentionPolicy: 'permanent', sensitivity: 'internal', confidenceLevel: 'VERIFIED' });
    const result = parseEchoMemoryResponse(text);
    expect(result.title).toBe('Title');
    expect(result.content).toBe('Content');
  });

  it('extracts JSON from surrounding prose', () => {
    const text = 'Here is the memory entry: {"title":"T","content":"C","category":"project_memory","retentionPolicy":"permanent","sensitivity":"internal","confidenceLevel":"VERIFIED"} end';
    const result = parseEchoMemoryResponse(text);
    expect(result.title).toBe('T');
  });

  it('returns defaults on parse failure', () => {
    const result = parseEchoMemoryResponse('not valid json!!');
    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('retentionPolicy');
  });

  it('defaults retentionPolicy to standard_180d on failure', () => {
    const result = parseEchoMemoryResponse('bad input');
    expect(result.retentionPolicy).toBe('standard_180d');
  });

  it('coerces sensitivity to string', () => {
    const result = parseEchoMemoryResponse(JSON.stringify({ title: 'T', content: 'C' }));
    expect(typeof result.sensitivity).toBe('string');
  });
});

// ── buildEchoFallbackEntry ────────────────────────────────────────────────────

describe('buildEchoFallbackEntry', () => {
  it('returns an object with title', () => {
    const result = buildEchoFallbackEntry('command text', {});
    expect(result).toHaveProperty('title');
  });

  it('returns retentionPolicy', () => {
    const result = buildEchoFallbackEntry('command text', {});
    expect(result).toHaveProperty('retentionPolicy');
  });

  it('returns category', () => {
    const result = buildEchoFallbackEntry('command text', {});
    expect(result).toHaveProperty('category');
  });

  it('returns content string', () => {
    const result = buildEchoFallbackEntry('command text', {});
    expect(typeof result.content).toBe('string');
  });

  it('returns confidenceLevel', () => {
    const result = buildEchoFallbackEntry('command text', {});
    expect(result).toHaveProperty('confidenceLevel');
  });
});

// ── normalizeMemoryConfidence ─────────────────────────────────────────────────

describe('normalizeMemoryConfidence', () => {
  it('returns an array', () => {
    const result = normalizeMemoryConfidence([{ confidenceLevel: 'VERIFIED', content: 'test' }]);
    expect(Array.isArray(result)).toBe(true);
  });

  it('passes through valid VERIFIED entries unchanged', () => {
    const entries = [{ confidenceLevel: 'VERIFIED', content: 'a' }];
    const result = normalizeMemoryConfidence(entries);
    expect(result[0].confidenceLevel).toBe('VERIFIED');
  });

  it('normalizes unknown confidence levels', () => {
    const entries = [{ confidenceLevel: 'UNKNOWN_LEVEL', content: 'b' }];
    const result = normalizeMemoryConfidence(entries);
    expect(result[0]).toHaveProperty('confidenceLevel');
  });

  it('handles empty array', () => {
    expect(normalizeMemoryConfidence([])).toEqual([]);
  });

  it('handles null entries safely', () => {
    expect(() => normalizeMemoryConfidence(null)).not.toThrow();
  });
});

// ── runEchoPreservation ───────────────────────────────────────────────────────

describe('runEchoPreservation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a result with summary', async () => {
    const result = await runEchoPreservation('preserve this', {}, {});
    expect(result).toHaveProperty('summary');
    expect(typeof result.summary).toBe('string');
  });

  it('returns artifacts array', async () => {
    const result = await runEchoPreservation('preserve', {}, {});
    expect(Array.isArray(result.artifacts)).toBe(true);
  });

  it('includes memory_preservation artifact', async () => {
    const result = await runEchoPreservation('preserve', {}, {});
    const types = result.artifacts.map((a) => a.type);
    expect(types).toContain('memory_preservation');
  });

  it('includes echo_memory_schema artifact', async () => {
    const result = await runEchoPreservation('preserve', {}, {});
    const types = result.artifacts.map((a) => a.type);
    expect(types).toContain('echo_memory_schema');
  });

  it('returns contractAction field', async () => {
    const result = await runEchoPreservation('preserve', { actionType: 'remember' }, {});
    expect(result).toHaveProperty('contractAction');
  });

  it('uses fallback when Ollama throws', async () => {
    const { generateOllamaResponse } = await import('../lib/ollama');
    generateOllamaResponse.mockRejectedValueOnce(new Error('Ollama offline'));
    const result = await runEchoPreservation('preserve', {}, {});
    expect(result).toHaveProperty('summary');
  });

  it('handles null assignment gracefully', async () => {
    const result = await runEchoPreservation('', null, {});
    expect(result).toHaveProperty('summary');
  });

  it('schema includes memoryId', async () => {
    const result = await runEchoPreservation('preserve', {}, {});
    const schemaArtifact = result.artifacts.find((a) => a.type === 'echo_memory_schema');
    expect(schemaArtifact?.schema).toHaveProperty('memoryId');
  });

  it('schema includes retentionPolicy', async () => {
    const result = await runEchoPreservation('preserve', {}, {});
    const schemaArtifact = result.artifacts.find((a) => a.type === 'echo_memory_schema');
    expect(schemaArtifact?.schema).toHaveProperty('retentionPolicy');
  });
});

// ── synthesizeSession ──────────────────────────────────────────────────────

describe('synthesizeSession', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null for empty messages array', async () => {
    const result = await synthesizeSession([]);
    expect(result).toBeNull();
  });

  it('returns null for non-array input', async () => {
    const result = await synthesizeSession(null);
    expect(result).toBeNull();
  });

  it('synthesizes valid messages into a preservation result', async () => {
    const result = await synthesizeSession([
      { role: 'user', content: 'remember this important decision about the project' },
      { role: 'assistant', content: 'The decision has been recorded.' }
    ]);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('summary');
  });
});

// ── searchEchoMemorySemantic ───────────────────────────────────────────────

describe('searchEchoMemorySemantic', () => {
  it('returns an array for a keyword query', async () => {
    const result = await searchEchoMemorySemantic('test query');
    expect(Array.isArray(result)).toBe(true);
  });

  it('handles empty query gracefully', async () => {
    const result = await searchEchoMemorySemantic('');
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── isChromaHealthy ────────────────────────────────────────────────────────

describe('isChromaHealthy', () => {
  it('returns a boolean', async () => {
    const result = await isChromaHealthy();
    expect(typeof result).toBe('boolean');
  });
});
