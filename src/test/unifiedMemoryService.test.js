import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
  isTauri: vi.fn().mockReturnValue(false)
}));

vi.mock('../services/agentActivityService', () => ({
  appendAgentActivity: vi.fn()
}));

vi.mock('../services/runtimeLedgerService', () => ({
  persistScopeRows: vi.fn()
}));

import '../lib/durableStore';

const {
  pushMemory,
  listMemory,
  listMemoryByNamespace,
  pushMemoryItem,
  listMemoryItems,
  pushMiyaMemory,
  listMiyaMemory,
  addMemoryItem,
  listEcosystemMemoryItems,
  pushWorkflowMemory,
  listWorkflowMemory,
  getNamespaceCount,
  getMemorySize,
  MEMORY_CATEGORIES,
  MEMORY_NAMESPACES,
  resetMemoryServiceState,
  clearExpiredMemory
} = await import('../services/unifiedMemoryService.js');

describe('unifiedMemoryService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    resetMemoryServiceState();
  });

  describe('MEMORY_CATEGORIES and MEMORY_NAMESPACES', () => {
    it('exports a non-empty MEMORY_CATEGORIES array', () => {
      expect(Array.isArray(MEMORY_CATEGORIES)).toBe(true);
      expect(MEMORY_CATEGORIES.length).toBeGreaterThan(0);
    });

    it('MEMORY_CATEGORIES includes cross-namespace categories', () => {
      expect(MEMORY_CATEGORIES).toContain('project_memory');
      expect(MEMORY_CATEGORIES).toContain('brand_memory');
      expect(MEMORY_CATEGORIES).toContain('agent_memory');
      expect(MEMORY_CATEGORIES).toContain('workflow_timeline_memory');
    });

    it('MEMORY_NAMESPACES includes all four namespaces', () => {
      expect(MEMORY_NAMESPACES).toEqual(['shared', 'miya', 'ecosystem', 'workflow']);
    });
  });

  describe('pushMemory (basic CRUD)', () => {
    it('creates a memory item with auto-generated id', () => {
      const item = pushMemory({ title: 'Test', content: 'data' });
      expect(item.id).toMatch(/^mem-\d+-[a-f0-9]+$/);
    });

    it('defaults namespace to shared', () => {
      const item = pushMemory({ title: 'Default ns' });
      expect(item.namespace).toBe('shared');
    });

    it('stores to the specified namespace', () => {
      pushMemory({ title: 'Miya item', namespace: 'miya' });
      const miyaItems = listMemoryByNamespace('miya');
      expect(miyaItems.length).toBe(1);
      expect(miyaItems[0].title).toBe('Miya item');
    });

    it('read returns item after write', () => {
      pushMemory({ title: 'Hello', content: 'world', namespace: 'shared' });
      const items = listMemory({ namespace: 'shared' });
      expect(items.length).toBe(1);
      expect(items[0].title).toBe('Hello');
      expect(items[0].content).toBe('world');
    });

    it('list returns empty array when no items exist', () => {
      const result = listMemory();
      expect(result).toEqual([]);
    });

    it('delete (clearExpiredMemory) removes expired items', () => {
      const past = Date.now() - 100_000;
      pushMemory({ title: 'Expired', namespace: 'shared', expiresAt: past });
      const future = Date.now() + 100_000;
      pushMemory({ title: 'Valid', namespace: 'shared', expiresAt: future });
      pushMemory({ title: 'No expiry', namespace: 'shared' });

      const result = clearExpiredMemory(Date.now());
      expect(result.removed).toBe(1);
      const remaining = listMemory({ namespace: 'shared' });
      expect(remaining.length).toBe(2);
    });
  });

  describe('namespace filters (query by namespace)', () => {
    it('filters listMemory results by namespace', () => {
      pushMemory({ title: 'Shared item', namespace: 'shared' });
      pushMemory({ title: 'Miya item', namespace: 'miya' });
      pushMemory({ title: 'Ecosystem item', namespace: 'ecosystem' });

      const sharedResults = listMemory({ namespace: 'shared' });
      expect(sharedResults.length).toBe(1);
      expect(sharedResults[0].title).toBe('Shared item');

      const miyaResults = listMemory({ namespace: 'miya' });
      expect(miyaResults.length).toBe(1);
      expect(miyaResults[0].title).toBe('Miya item');
    });

    it('listMemoryByNamespace returns only items from that namespace', () => {
      pushMemory({ title: 'Shared', namespace: 'shared' });
      pushMemory({ title: 'Miya A', namespace: 'miya' });
      pushMemory({ title: 'Miya B', namespace: 'miya' });

      const miyaItems = listMemoryByNamespace('miya');
      expect(miyaItems.length).toBe(2);
      miyaItems.forEach((item) => expect(item.namespace || 'miya').toBe('miya'));
    });

    it('getNamespaceCount returns correct item count per namespace', () => {
      pushMemory({ title: 'S1', namespace: 'shared' });
      pushMemory({ title: 'S2', namespace: 'shared' });
      pushMemory({ title: 'M1', namespace: 'miya' });

      expect(getNamespaceCount('shared')).toBe(2);
      expect(getNamespaceCount('miya')).toBe(1);
      expect(getNamespaceCount('ecosystem')).toBe(0);
    });
  });

  describe('cross-namespace reads', () => {
    it('listMemory without namespace filter returns items from all namespaces', () => {
      pushMemory({ title: 'Shared', namespace: 'shared' });
      pushMemory({ title: 'Miya', namespace: 'miya' });
      pushMemory({ title: 'Ecosystem', namespace: 'ecosystem' });
      pushMemory({ title: 'Workflow', namespace: 'workflow' });

      const all = listMemory();
      expect(all.length).toBe(4);
      const titles = all.map((i) => i.title);
      expect(titles).toContain('Shared');
      expect(titles).toContain('Miya');
      expect(titles).toContain('Ecosystem');
      expect(titles).toContain('Workflow');
    });

    it('reads from 2+ namespaces simultaneously via listMemory', () => {
      pushMemory({ title: 'Shared A', namespace: 'shared' });
      pushMemory({ title: 'Shared B', namespace: 'shared' });
      pushMemory({ title: 'Miya X', namespace: 'miya' });
      pushMemory({ title: 'Miya Y', namespace: 'miya' });

      const all = listMemory();
      const sharedFromAll = all.filter((i) => i.namespace === 'shared');
      const miyaFromAll = all.filter((i) => i.namespace === 'miya');

      expect(sharedFromAll.length).toBe(2);
      expect(miyaFromAll.length).toBe(2);
    });
  });

  describe('migration compatibility (old interface still works)', () => {
    it('pushMemoryItem writes to shared namespace', () => {
      const item = pushMemoryItem({ title: 'Legacy item', content: 'old api' });
      expect(item.namespace).toBe('shared');
      const sharedItems = listMemory({ namespace: 'shared' });
      expect(sharedItems.length).toBe(1);
      expect(sharedItems[0].title).toBe('Legacy item');
    });

    it('listMemoryItems returns only shared namespace items', () => {
      pushMemory({ title: 'Shared', namespace: 'shared' });
      pushMemory({ title: 'Miya', namespace: 'miya' });
      const items = listMemoryItems();
      expect(items.length).toBe(1);
      expect(items[0].title).toBe('Shared');
    });

    it('pushMiyaMemory writes to miya namespace', () => {
      const item = pushMiyaMemory({ title: 'Miya creative', content: 'brand ideas' });
      expect(item.namespace).toBe('miya');
      expect(item.sourceAgent).toBe('miya');
    });

    it('listMiyaMemory returns only miya namespace items', () => {
      pushMemory({ title: 'Shared', namespace: 'shared' });
      pushMiyaMemory({ title: 'Brand guide' });
      const miyaItems = listMiyaMemory();
      expect(miyaItems.length).toBe(1);
      expect(miyaItems[0].title).toBe('Brand guide');
    });

    it('addMemoryItem writes to ecosystem namespace', () => {
      const item = addMemoryItem({ title: 'Eco entry', agentId: 'system', projectId: 'proj-1', type: 'note' });
      expect(item.namespace).toBe('ecosystem');
    });

    it('listEcosystemMemoryItems returns only ecosystem items', () => {
      pushMemory({ title: 'Shared', namespace: 'shared' });
      addMemoryItem({ title: 'System health', agentId: 'monitor' });
      const ecoItems = listEcosystemMemoryItems();
      expect(ecoItems.length).toBe(1);
      expect(ecoItems[0].title).toBe('System health');
    });

    it('pushWorkflowMemory writes to workflow namespace', () => {
      const item = pushWorkflowMemory({ workflowId: 'wf-1', title: 'Build step', content: { step: 'deploy' } });
      expect(item.namespace).toBe('workflow');
      expect(item.workflowOwner).toBe('wf-1');
    });

    it('listWorkflowMemory returns workflow items in reverse order', () => {
      pushWorkflowMemory({ workflowId: 'wf-1', title: 'Step 1' });
      pushWorkflowMemory({ workflowId: 'wf-1', title: 'Step 2' });
      const steps = listWorkflowMemory('wf-1');
      expect(steps.length).toBe(2);
      expect(steps[0].title).toBe('Step 2');
      expect(steps[1].title).toBe('Step 1');
    });
  });

  describe('getMemorySize', () => {
    it('returns 0 for empty namespace', () => {
      expect(getMemorySize('shared')).toBe(0);
    });

    it('returns a positive number for a namespace with data', () => {
      pushMemory({ title: 'Data', content: 'test content', namespace: 'shared' });
      const size = getMemorySize('shared');
      expect(size).toBeGreaterThan(0);
    });
  });
});