import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn().mockResolvedValue(null);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => invoke(...args)
}));

const {
  pushMemoryItem,
  listMemoryItems,
  hydrateMemoryFromDurable,
  MEMORY_CATEGORIES
} = await import('../services/memoryService.js');

describe('memoryService', () => {
  beforeEach(() => {
    localStorage.clear();
    invoke.mockReset();
  });

  describe('MEMORY_CATEGORIES', () => {
    it('exports a non-empty array of categories', () => {
      expect(Array.isArray(MEMORY_CATEGORIES)).toBe(true);
      expect(MEMORY_CATEGORIES.length).toBeGreaterThan(0);
    });

    it('includes expected core categories', () => {
      expect(MEMORY_CATEGORIES).toContain('project_memory');
      expect(MEMORY_CATEGORIES).toContain('task_memory');
      expect(MEMORY_CATEGORIES).toContain('timeline_memory');
      expect(MEMORY_CATEGORIES).toContain('research_memory');
    });
  });

  describe('pushMemoryItem', () => {
    it('creates a memory item with auto-generated id', () => {
      const item = pushMemoryItem({ title: 'Test memory', content: 'hello' });
      expect(item.id).toMatch(/^mem-\d+-[a-f0-9]+$/);
    });

    it('stores title from partial', () => {
      const item = pushMemoryItem({ title: 'My title', content: '' });
      expect(item.title).toBe('My title');
    });

    it('defaults title to "Untitled memory"', () => {
      const item = pushMemoryItem({ content: 'content' });
      expect(item.title).toBe('Untitled memory');
    });

    it('stores content from partial', () => {
      const item = pushMemoryItem({ title: 't', content: 'some content' });
      expect(item.content).toBe('some content');
    });

    it('defaults category to timeline_memory', () => {
      const item = pushMemoryItem({ title: 't', content: '' });
      expect(item.category).toBe('timeline_memory');
    });

    it('uses provided category', () => {
      const item = pushMemoryItem({ title: 't', content: '', category: 'project_memory' });
      expect(item.category).toBe('project_memory');
    });

    it('defaults sourceAgent to alphonso', () => {
      const item = pushMemoryItem({ title: 't', content: '' });
      expect(item.sourceAgent).toBe('alphonso');
    });

    it('uses provided agent alias', () => {
      const item = pushMemoryItem({ title: 't', content: '', agent: 'hector' });
      expect(item.sourceAgent).toBe('hector');
    });

    it('sets timestampMs to a positive number', () => {
      const item = pushMemoryItem({ title: 't', content: '' });
      expect(item.timestampMs).toBeGreaterThan(0);
    });

    it('defaults confidence to unverified', () => {
      const item = pushMemoryItem({ title: 't', content: '' });
      expect(item.confidence).toBe('unverified');
    });

    it('stores expiresAt when provided', () => {
      const future = Date.now() + 100_000;
      const item = pushMemoryItem({ title: 't', content: '', expiresAt: future });
      expect(item.expiresAt).toBe(future);
    });

    it('defaults expiresAt to null', () => {
      const item = pushMemoryItem({ title: 't', content: '' });
      expect(item.expiresAt).toBeNull();
    });

    it('persists to localStorage', () => {
      pushMemoryItem({ title: 't', content: 'c' });
      const raw = localStorage.getItem('alphonso_memory_items_v1');
      expect(raw).toBeTruthy();
      const items = JSON.parse(raw);
      expect(items.length).toBe(1);
    });

    it('appends multiple items', () => {
      pushMemoryItem({ title: 'first', content: 'a' });
      pushMemoryItem({ title: 'second', content: 'b' });
      const raw = localStorage.getItem('alphonso_memory_items_v1');
      const items = JSON.parse(raw);
      expect(items.length).toBe(2);
    });

    it('stores sensitivity and retentionPolicy', () => {
      const item = pushMemoryItem({ title: 't', content: '', sensitivity: 'confidential', retentionPolicy: 'long' });
      expect(item.sensitivity).toBe('confidential');
      expect(item.retentionPolicy).toBe('long');
    });
  });

  describe('listMemoryItems', () => {
    it('returns empty array when no items exist', () => {
      const items = listMemoryItems();
      expect(items).toEqual([]);
    });

    it('returns all stored items', () => {
      pushMemoryItem({ title: 'a', content: '1' });
      pushMemoryItem({ title: 'b', content: '2' });
      const items = listMemoryItems();
      expect(items.length).toBe(2);
    });

    it('returns items with correct structure', () => {
      pushMemoryItem({ title: 'test', content: 'data', category: 'research_memory' });
      const items = listMemoryItems();
      const item = items[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('title');
      expect(item).toHaveProperty('content');
      expect(item).toHaveProperty('category');
      expect(item).toHaveProperty('timestampMs');
      expect(item).toHaveProperty('confidence');
      expect(item).toHaveProperty('source');
    });

    it('returns items in insertion order', () => {
      pushMemoryItem({ title: 'first', content: '1' });
      pushMemoryItem({ title: 'second', content: '2' });
      const items = listMemoryItems();
      expect(items[0].title).toBe('first');
      expect(items[1].title).toBe('second');
    });

    it('applies expiry state to items past their expiresAt', () => {
      const past = Date.now() - 100_000;
      pushMemoryItem({ title: 'expired', content: '', expiresAt: past });
      const items = listMemoryItems();
      expect(items[0].confidence).toBe('expired');
      expect(items[0].verificationState).toBe('expired');
    });

    it('does not modify confidence for non-expired items', () => {
      const future = Date.now() + 100_000;
      pushMemoryItem({ title: 'valid', content: '', expiresAt: future });
      const items = listMemoryItems();
      expect(items[0].confidence).toBe('unverified');
    });
  });

  describe('memory expiry', () => {
    it('marks item as expired when expiresAt is in the past', () => {
      pushMemoryItem({ title: 'old', content: '', expiresAt: 1 });
      const items = listMemoryItems();
      expect(items[0].confidence).toBe('expired');
      expect(items[0].verificationState).toBe('expired');
    });

    it('keeps item as unverified when expiresAt is in the future', () => {
      pushMemoryItem({ title: 'new', content: '', expiresAt: Date.now() + 1_000_000 });
      const items = listMemoryItems();
      expect(items[0].confidence).toBe('unverified');
    });

    it('keeps item unverified when expiresAt is null', () => {
      pushMemoryItem({ title: 'no-expiry', content: '' });
      const items = listMemoryItems();
      expect(items[0].confidence).toBe('unverified');
    });

    it('does not double-expire an already expired item', () => {
      pushMemoryItem({ title: 'expired-once', content: '', expiresAt: 1 });
      listMemoryItems();
      const items = listMemoryItems();
      expect(items[0].confidence).toBe('expired');
      expect(items[0].verificationState).toBe('expired');
    });
  });

  describe('memory deletion via filtering', () => {
    it('allows filtering by category', () => {
      pushMemoryItem({ title: 'a', content: '', category: 'project_memory' });
      pushMemoryItem({ title: 'b', content: '', category: 'task_memory' });
      const all = listMemoryItems();
      const filtered = all.filter((i) => i.category === 'project_memory');
      expect(filtered.length).toBe(1);
      expect(filtered[0].title).toBe('a');
    });

    it('allows filtering by title', () => {
      pushMemoryItem({ title: 'keep-this', content: '' });
      pushMemoryItem({ title: 'remove-this', content: '' });
      const all = listMemoryItems();
      const filtered = all.filter((i) => i.title !== 'remove-this');
      expect(filtered.length).toBe(1);
      expect(filtered[0].title).toBe('keep-this');
    });

    it('returns empty when filtering by non-matching criteria', () => {
      pushMemoryItem({ title: 'a', content: '' });
      const all = listMemoryItems();
      const filtered = all.filter((i) => i.category === 'nonexistent_category');
      expect(filtered.length).toBe(0);
    });
  });

  describe('hydrateMemoryFromDurable', () => {
    it('returns local items when durable memory is unavailable', async () => {
      invoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_memory_store_status') return { available: false };
        return null;
      });

      pushMemoryItem({ title: 'local', content: '' });
      const items = await hydrateMemoryFromDurable();
      expect(items.length).toBe(1);
      expect(items[0].title).toBe('local');
    });

    it('merges durable records with local records', async () => {
      invoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_memory_store_status') return { available: true };
        if (cmd === 'list_memory_records') {
          return [
            {
              id: 'durable-1',
              title: 'from durable',
              content: { value: 'data' },
              category: 'research_memory',
              sourceAgent: 'hector',
              timestampMs: 1000
            }
          ];
        }
        return null;
      });

      pushMemoryItem({ title: 'local-only', content: '' });
      const items = await hydrateMemoryFromDurable();
      expect(items.length).toBe(2);
      const titles = items.map((i) => i.title);
      expect(titles).toContain('local-only');
      expect(titles).toContain('from durable');
    });

    it('deduplicates by id when durable and local share same id', async () => {
      invoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_memory_store_status') return { available: true };
        if (cmd === 'list_memory_records') {
          return [
            {
              id: 'shared-id',
              title: 'from durable',
              content: { value: 'durable-data' },
              category: 'task_memory',
              timestampMs: 2000
            }
          ];
        }
        return null;
      });

      localStorage.setItem('alphonso_memory_items_v1', JSON.stringify([
        { id: 'shared-id', title: 'from local', content: 'local-data', category: 'task_memory', timestampMs: 1000 }
      ]));

      const items = await hydrateMemoryFromDurable();
      const match = items.find((i) => i.id === 'shared-id');
      expect(match.title).toBe('from durable');
    });

    it('returns local items when durable memory list call fails', async () => {
      invoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_memory_store_status') return { available: true };
        if (cmd === 'list_memory_records') throw new Error('IPC failure');
        return null;
      });

      pushMemoryItem({ title: 'fallback', content: '' });
      const items = await hydrateMemoryFromDurable();
      expect(items.length).toBe(1);
      expect(items[0].title).toBe('fallback');
    });
  });

  describe('localStorage capacity', () => {
    it('caps stored items at 1000', () => {
      for (let i = 0; i < 1005; i++) {
        pushMemoryItem({ title: `item-${i}`, content: '' });
      }
      const raw = localStorage.getItem('alphonso_memory_items_v1');
      const stored = JSON.parse(raw);
      expect(stored.length).toBe(1000);
    });

    it('keeps the most recent items when cap is exceeded', () => {
      for (let i = 0; i < 1005; i++) {
        pushMemoryItem({ title: `item-${i}`, content: '' });
      }
      const items = listMemoryItems();
      expect(items[0].title).toBe('item-5');
      expect(items[items.length - 1].title).toBe('item-1004');
    });
  });
});
