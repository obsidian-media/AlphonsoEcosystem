import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isChromaHealthy, addMemoryToChroma, semanticSearchMemory } from '../services/chromaDbService.js';

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isChromaHealthy', () => {
  it('returns true when heartbeat responds ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    expect(await isChromaHealthy()).toBe(true);
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:8000/api/v1/heartbeat', expect.any(Object));
  });

  it('returns false when fetch throws (offline)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('connection refused'));
    expect(await isChromaHealthy()).toBe(false);
  });

  it('returns false when response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
    expect(await isChromaHealthy()).toBe(false);
  });
});

describe('addMemoryToChroma', () => {
  it('sends document with title and content to collection', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    await addMemoryToChroma({ id: 'mem-1', title: 'Test memory', content: 'Some content', category: 'project_memory' });
    const calls = fetch.mock.calls.map(c => c[0]);
    expect(calls.some(url => url.includes('/add'))).toBe(true);
  });

  it('does not throw when ChromaDB is offline', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(addMemoryToChroma({ id: 'x', title: 'test', content: '' })).resolves.not.toThrow();
  });
});

describe('semanticSearchMemory', () => {
  it('returns null when ChromaDB is offline', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    const result = await semanticSearchMemory('test query');
    expect(result).toBeNull();
  });

  it('returns mapped results when ChromaDB is healthy and query succeeds', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true }) // heartbeat
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) }) // ensureCollection
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ids: [['mem-1', 'mem-2']],
          distances: [[0.1, 0.3]],
          metadatas: [[{ category: 'project_memory' }, { category: 'timeline_memory' }]],
        }),
      });

    const results = await semanticSearchMemory('AI research', 5);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('mem-1');
    expect(results[0].score).toBe(0.1);
  });

  it('returns null when query fetch fails', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true }) // heartbeat
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) }) // collection
      .mockResolvedValueOnce({ ok: false }); // query fails
    expect(await semanticSearchMemory('query')).toBeNull();
  });
});
