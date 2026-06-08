// memoryService.js — re-exports from unifiedMemoryService for backward compatibility
export {
  pushMemoryItem,
  listMemoryItems,
  hydrateMemoryFromDurable,
  pushMemory,
  listMemory,
  listMemoryByNamespace,
  hydrateFromDurable,
  getDurableMemoryStatus,
  listDurableMemoryRecords,
  upsertDurableMemoryRecords,
  normalizeMemoryRecord,
  clearExpiredMemory,
  getMemorySummary,
  MEMORY_CATEGORIES,
  MEMORY_NAMESPACES
} from './unifiedMemoryService';
