import { describe, it, expect } from 'vitest';

import {
  pushMiyaMemory, listMiyaMemory, upsertBrandKit,
  pushMemory, listMemory, listMemoryByNamespace, tickExpiry,
  getMemorySize, getAllMemorySizes, checkQuota,
  deduplicateMemory, deduplicateAllNamespaces, autoTagMemoryItem,
  exportMemoryItems, importMemoryItems, clearContentHashCache,
  MEMORY_CATEGORIES, MEMORY_NAMESPACES
} from '../../services/miyaMemoryService';

describe('miyaMemoryService', () => {
  it('re-exports pushMiyaMemory', () => { expect(typeof pushMiyaMemory).toBe('function'); });
  it('re-exports listMiyaMemory', () => { expect(typeof listMiyaMemory).toBe('function'); });
  it('re-exports upsertBrandKit', () => { expect(typeof upsertBrandKit).toBe('function'); });
  it('re-exports pushMemory', () => { expect(typeof pushMemory).toBe('function'); });
  it('re-exports listMemory', () => { expect(typeof listMemory).toBe('function'); });
  it('re-exports listMemoryByNamespace', () => { expect(typeof listMemoryByNamespace).toBe('function'); });
  it('re-exports tickExpiry', () => { expect(typeof tickExpiry).toBe('function'); });
  it('re-exports getMemorySize', () => { expect(typeof getMemorySize).toBe('function'); });
  it('re-exports getAllMemorySizes', () => { expect(typeof getAllMemorySizes).toBe('function'); });
  it('re-exports checkQuota', () => { expect(typeof checkQuota).toBe('function'); });
  it('re-exports deduplicateMemory', () => { expect(typeof deduplicateMemory).toBe('function'); });
  it('re-exports deduplicateAllNamespaces', () => { expect(typeof deduplicateAllNamespaces).toBe('function'); });
  it('re-exports autoTagMemoryItem', () => { expect(typeof autoTagMemoryItem).toBe('function'); });
  it('re-exports exportMemoryItems', () => { expect(typeof exportMemoryItems).toBe('function'); });
  it('re-exports importMemoryItems', () => { expect(typeof importMemoryItems).toBe('function'); });
  it('re-exports clearContentHashCache', () => { expect(typeof clearContentHashCache).toBe('function'); });
  it('re-exports MEMORY_CATEGORIES', () => {
    expect(Array.isArray(MEMORY_CATEGORIES)).toBe(true);
    expect(MEMORY_CATEGORIES.length).toBeGreaterThan(0);
  });
  it('re-exports MEMORY_NAMESPACES', () => {
    expect(typeof MEMORY_NAMESPACES).toBe('object');
  });
});
