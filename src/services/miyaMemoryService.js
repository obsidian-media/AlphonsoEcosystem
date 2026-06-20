// miyaMemoryService.js — re-exports from unifiedMemoryService for backward compatibility
export {
  pushMiyaMemory,
  listMiyaMemory,
  upsertBrandKit,
  pushMemory,
  listMemory,
  listMemoryByNamespace,
  tickExpiry,
  getMemorySize,
  getAllMemorySizes,
  checkQuota,
  deduplicateMemory,
  deduplicateAllNamespaces,
  autoTagMemoryItem,
  exportMemoryItems,
  importMemoryItems,
  clearContentHashCache,
  MEMORY_CATEGORIES,
  MEMORY_NAMESPACES
} from './unifiedMemoryService';
