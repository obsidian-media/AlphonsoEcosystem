import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MemoryCache, cached, createCacheKey, globalCache, connectorCache, agentCache } from '../../services/cacheService';

describe('cacheService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('MemoryCache', () => {
    let cache: MemoryCache;

    beforeEach(() => {
      cache = new MemoryCache({ maxSize: 10, maxEntries: 5 });
    });

    it('stores and retrieves values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('returns null for missing keys', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('returns null for expired entries', () => {
      const now = 1700000000000;
      vi.spyOn(Date, 'now').mockReturnValue(now);
      cache.set('key1', 'value1', 1000); // 1s TTL

      vi.spyOn(Date, 'now').mockReturnValue(now + 2000); // 2s later
      expect(cache.get('key1')).toBeNull();
    });

    it('returns value within TTL', () => {
      const now = 1700000000000;
      vi.spyOn(Date, 'now').mockReturnValue(now);
      cache.set('key1', 'value1', 10000); // 10s TTL

      vi.spyOn(Date, 'now').mockReturnValue(now + 3000); // 3s later
      expect(cache.get('key1')).toBe('value1');
    });

    it('has() returns true for existing keys', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
    });

    it('has() returns false for missing keys', () => {
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('delete() removes entry', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeNull();
    });

    it('clear() removes all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.size).toBe(0);
    });

    it('size tracks entry count', () => {
      expect(cache.size).toBe(0);
      cache.set('key1', 'value1');
      expect(cache.size).toBe(1);
      cache.set('key2', 'value2');
      expect(cache.size).toBe(2);
    });

    it('keys() returns all keys', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      expect(cache.keys()).toContain('a');
      expect(cache.keys()).toContain('b');
    });

    it('evicts oldest entry when maxSize reached', () => {
      const smallCache = new MemoryCache({ maxSize: 3, maxEntries: 10 });
      smallCache.set('k1', 'v1');
      smallCache.set('k2', 'v2');
      smallCache.set('k3', 'v3');
      smallCache.set('k4', 'v4'); // should evict k1
      expect(smallCache.get('k1')).toBeNull();
      expect(smallCache.get('k4')).toBe('v4');
    });

    it('evicts oldest entry when maxEntries reached', () => {
      const smallCache = new MemoryCache({ maxSize: 100, maxEntries: 2 });
      smallCache.set('k1', 'v1');
      smallCache.set('k2', 'v2');
      smallCache.set('k3', 'v3'); // should evict k1
      expect(smallCache.get('k1')).toBeNull();
      expect(smallCache.get('k3')).toBe('v3');
    });

    it('overwrites existing key without increasing size', () => {
      cache.set('key1', 'old');
      cache.set('key1', 'new');
      expect(cache.size).toBe(1);
      expect(cache.get('key1')).toBe('new');
    });

    it('stores complex objects', () => {
      const obj = { nested: { arr: [1, 2, 3] } };
      cache.set('complex', obj);
      expect(cache.get('complex')).toEqual(obj);
    });
  });

  describe('cached()', () => {
    it('returns cached value on second call', async () => {
      const cache = new MemoryCache();
      let callCount = 0;
      const fetcher = async () => { callCount++; return 'fetched'; };

      const result1 = await cached(cache, 'key', fetcher);
      const result2 = await cached(cache, 'key', fetcher);

      expect(result1).toBe('fetched');
      expect(result2).toBe('fetched');
      expect(callCount).toBe(1); // fetcher called only once
    });

    it('calls fetcher when cache misses', async () => {
      const cache = new MemoryCache();
      const fetcher = async () => 'fresh';

      const result = await cached(cache, 'new-key', fetcher);
      expect(result).toBe('fresh');
    });

    it('respects custom TTL', async () => {
      const now = 1700000000000;
      vi.spyOn(Date, 'now').mockReturnValue(now);
      const cache = new MemoryCache();

      await cached(cache, 'key', async () => 'value', 1000);
      expect(cache.get('key')).toBe('value');

      vi.spyOn(Date, 'now').mockReturnValue(now + 2000);
      expect(cache.get('key')).toBeNull();
    });
  });

  describe('createCacheKey()', () => {
    it('joins parts with colon', () => {
      expect(createCacheKey('a', 'b', 'c')).toBe('a:b:c');
    });

    it('converts numbers to strings', () => {
      expect(createCacheKey('prefix', 42)).toBe('prefix:42');
    });

    it('converts booleans to strings', () => {
      expect(createCacheKey('flag', true)).toBe('flag:true');
    });

    it('handles single part', () => {
      expect(createCacheKey('only')).toBe('only');
    });
  });

  describe('pre-configured caches', () => {
    it('globalCache has maxSize 5000', () => {
      expect(globalCache).toBeInstanceOf(MemoryCache);
    });

    it('connectorCache has maxSize 1000', () => {
      expect(connectorCache).toBeInstanceOf(MemoryCache);
    });

    it('agentCache has maxSize 500', () => {
      expect(agentCache).toBeInstanceOf(MemoryCache);
    });
  });
});
