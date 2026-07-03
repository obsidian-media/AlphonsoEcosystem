// workflowMemoryService.ts — re-exports from unifiedMemoryService for backward compatibility
// Alias: appendWorkflowMemory → pushWorkflowMemory (unified)
export { pushWorkflowMemory as appendWorkflowMemory, listWorkflowMemory, pushMemory, listMemory, tickExpiry, getMemorySize, getAllMemorySizes, checkQuota, deduplicateMemory, deduplicateAllNamespaces, autoTagMemoryItem, exportMemoryItems, importMemoryItems, clearContentHashCache, MEMORY_CATEGORIES, MEMORY_NAMESPACES } from './unifiedMemoryService';

export const WORKFLOW_MEMORY_CATEGORIES = [
  'workflow_timeline_memory', 'workflow_artifact_memory',
  'workflow_governance_memory', 'workflow_receipt_memory'
];
