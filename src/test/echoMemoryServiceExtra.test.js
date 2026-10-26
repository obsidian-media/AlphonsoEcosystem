// echoMemoryService is a compatibility module since agent phase 7: Echo's work lives in
// src/services/echo/. It re-exports that API for older imports.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../services/memoryGraphService', () => ({ addNode: vi.fn(async () => null), addEdge: vi.fn(async () => null) }));

import * as compat from '../services/echoMemoryService';
import { addDecision as direct } from '../services/echo/decisions';

beforeEach(() => localStorage.clear());

describe('echoMemoryService (compatibility)', () => {
  it("re-exports Echo's decision API", () => {
    expect(compat.addDecision).toBe(direct);
    expect(typeof compat.listDecisions).toBe('function');
    expect(typeof compat.searchDecisions).toBe('function');
    expect(typeof compat.decisionsFor).toBe('function');
    expect(typeof compat.runEchoStep).toBe('function');
    expect(typeof compat.isChromaHealthy).toBe('function');
  });

  it('the old note-per-request and keyword helpers are gone', () => {
    for (const name of ['runEchoPreservation', 'buildEchoFallbackEntry', 'classifyRetentionPolicy', 'classifyMemoryCategory', 'normalizeMemoryConfidence', 'synthesizeSession']) {
      expect(compat[name]).toBeUndefined();
    }
  });

  it('searching through it finds what was saved', async () => {
    compat.addDecision({ kind: 'decision', text: 'The launch is on Friday.', topics: ['launch'], source: { surface: 'chat', by: 'you' } });
    expect((await compat.searchDecisions('launch')).map((d) => d.text)).toEqual(['The launch is on Friday.']);
  });
});
