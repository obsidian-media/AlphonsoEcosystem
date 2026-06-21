export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

export interface CacheOptions {
  ttl?: number;
  maxSize?: number;
  maxEntries?: number;
}

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_SIZE = 1000;
const DEFAULT_MAX_ENTRIES = 500;

export class MemoryCache<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private maxEntries: number;

  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize || DEFAULT_MAX_SIZE;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key: string, value: T, ttl: number = DEFAULT_TTL): void {
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl,
    });

    while (this.cache.size > this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
      else break;
    }
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }
}

export async function cached<T>(
  cache: MemoryCache<T>,
  key: string,
  fetcher: () => Promise<T>,
  ttl?: number
): Promise<T> {
  const cached = cache.get(key);
  if (cached !== null) return cached;

  const value = await fetcher();
  cache.set(key, value, ttl);
  return value;
}

export function createCacheKey(...parts: (string | number | boolean)[]): string {
  return parts.map(String).join(':');
}

export const globalCache = new MemoryCache({ maxSize: 5000 });

export const connectorCache = new MemoryCache({ maxSize: 1000 });

export const agentCache = new MemoryCache({ maxSize: 500 });
