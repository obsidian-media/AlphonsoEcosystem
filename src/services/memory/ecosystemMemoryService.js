// ecosystemMemoryService.js — re-exports from unifiedMemoryService for backward compatibility
// Re-export listMemoryItems as-is for backward compat (consumers import this name)
export { addMemoryItem, addFailureMemory, listMemoryItems, clearExpiredMemory, MEMORY_CATEGORIES as ECOSYSTEM_MEMORY_CATEGORIES, MEMORY_NAMESPACES } from '../unifiedMemoryService';

// Also export unified API for new consumers
export { listMemory, pushMemory } from '../unifiedMemoryService';

// Legacy constant — kept for backward compat with ecosystem consumers
export const MEMORY_CONFIDENCE = Object.freeze([
  'verified', 'inferred', 'temporary', 'outdated', 'unverified'
]);
