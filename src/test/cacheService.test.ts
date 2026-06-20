import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryCache, cached, createCacheKey } from '../services/cacheService';

describe('cacheService', () => {
  describe('MemoryCache', () => {
    let cache: MemoryCache<string>;

    beforeEach(() => {
      cache = new MemoryCache<string>();
    });

    it('stores and retrieves values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('returns null for missing keys', () => {
      expect(cache.get('missing')).toBeNull();
    });

    it('expires entries after TTL', async () => {
      cache.set('key1', 'value1', 100); // 100ms TTL
      expect(cache.get('key1')).toBe('value1');

      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(cache.get('key1')).toBeNull();
    });

    it('evicts oldest entries when max size reached', () => {
      const smallCache = new MemoryCache<string>({ maxSize: 3 });
      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');
      smallCache.set('key4', 'value4');

      expect(smallCache.get('key1')).toBeNull();
      expect(smallCache.get('key4')).toBe('value4');
    });

    it('deletes entries', () => {
      cache.set('key1', 'value1');
      cache.delete('key1');
      expect(cache.get('key1')).toBeNull();
    });

    it('clears all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.size).toBe(0);
    });

    it('reports correct size', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      expect(cache.size).toBe(2);
    });

    it('checks if key exists', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('missing')).toBe(false);
    });
  });

  describe('cached function', () => {
    it('returns cached value on subsequent calls', async () => {
      const cache = new MemoryCache<number>();
      const fetcher = vi.fn().mockResolvedValue(42);

      const result1 = await cached(cache, 'key', fetcher);
      const result2 = await cached(cache, 'key', fetcher);

      expect(result1).toBe(42);
      expect(result2).toBe(42);
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('calls fetcher when cache is empty', async () => {
      const cache = new MemoryCache<number>();
      const fetcher = vi.fn().mockResolvedValue(42);

      await cached(cache, 'key', fetcher);
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
  });

  describe('createCacheKey', () => {
    it('joins parts with colon', () => {
      expect(createCacheKey('github', 'issues', 123)).toBe('github:issues:123');
    });

    it('handles boolean values', () => {
      expect(createCacheKey('key', true, false)).toBe('key:true:false');
    });
  });
});
