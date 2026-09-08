import { describe, it, expect } from 'vitest';

import { WORKFLOW_MEMORY_CATEGORIES, appendWorkflowMemory, listWorkflowMemory, pushMemory, listMemory, MEMORY_CATEGORIES, MEMORY_NAMESPACES } from '../../services/workflowMemoryService';

describe('workflowMemoryService', () => {
  it('exports WORKFLOW_MEMORY_CATEGORIES as array', () => {
    expect(Array.isArray(WORKFLOW_MEMORY_CATEGORIES)).toBe(true);
  });
  it('WORKFLOW_MEMORY_CATEGORIES contains expected categories', () => {
    expect(WORKFLOW_MEMORY_CATEGORIES).toContain('workflow_timeline_memory');
    expect(WORKFLOW_MEMORY_CATEGORIES).toContain('workflow_artifact_memory');
    expect(WORKFLOW_MEMORY_CATEGORIES).toContain('workflow_governance_memory');
    expect(WORKFLOW_MEMORY_CATEGORIES).toContain('workflow_receipt_memory');
  });
  it('re-exports appendWorkflowMemory (aliased from pushWorkflowMemory)', () => {
    expect(typeof appendWorkflowMemory).toBe('function');
  });
  it('re-exports listWorkflowMemory', () => { expect(typeof listWorkflowMemory).toBe('function'); });
  it('re-exports pushMemory', () => { expect(typeof pushMemory).toBe('function'); });
  it('re-exports listMemory', () => { expect(typeof listMemory).toBe('function'); });
  it('re-exports MEMORY_CATEGORIES', () => { expect(Array.isArray(MEMORY_CATEGORIES)).toBe(true); });
  it('re-exports MEMORY_NAMESPACES', () => { expect(typeof MEMORY_NAMESPACES).toBe('object'); });
});
