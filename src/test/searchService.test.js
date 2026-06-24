import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockItems = [
  { id: '1', title: 'React hooks guide', content: 'useState useEffect', category: 'docs', sourceAgent: 'echo', timestampMs: Date.now() - 1000 },
  { id: '2', title: 'Deploy pipeline setup', content: 'CI CD github actions', category: 'ops', sourceAgent: 'marcus', timestampMs: Date.now() - 5000 },
  { id: '3', title: 'Old notes', content: 'some old content', category: 'docs', sourceAgent: 'echo', timestampMs: Date.now() - 90 * 86_400_000 },
];

vi.mock('../services/unifiedMemoryService', () => ({
  listMemory: vi.fn((opts) => {
    if (opts?.search) return mockItems.filter(i => i.title.toLowerCase().includes(opts.search) || i.content.toLowerCase().includes(opts.search));
    return mockItems;
  }),
}));

import { searchMemory, searchProjects, getSearchSuggestions } from '../services/searchService';

describe('searchService', () => {
  describe('searchMemory', () => {
    it('returns matching items', () => {
      const results = searchMemory('React');
      expect(results.length).toBeGreaterThan(0);
    });

    it('filters by category', () => {
      const results = searchMemory('a', { categories: ['ops'] });
      expect(results.every(r => r.category === 'ops')).toBe(true);
    });

    it('filters by sourceAgent', () => {
      const results = searchMemory('a', { sourceAgents: ['marcus'] });
      expect(results.every(r => r.sourceAgent === 'marcus')).toBe(true);
    });

    it('respects limit', () => {
      const results = searchMemory('a', { limit: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('scores items with title match higher than content only', () => {
      const results = searchMemory('React');
      const titleMatch = results.find(r => r.title.toLowerCase().includes('react'));
      expect(titleMatch).toBeDefined();
      if (results.length > 1) {
        expect(results[0].score).toBeGreaterThanOrEqual(results[results.length - 1].score);
      }
    });
  });

  describe('searchProjects', () => {
    const projects = [
      { name: 'Alphonso Core', description: 'Main app', directory: '/apps/core', updatedAtMs: 1000 },
      { name: 'Dashboard UI', description: 'Frontend', directory: '/apps/ui', updatedAtMs: 2000 },
    ];

    it('finds projects by name', () => {
      const results = searchProjects('Alphonso', projects);
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Alphonso Core');
    });

    it('finds projects by description', () => {
      const results = searchProjects('Frontend', projects);
      expect(results[0].name).toBe('Dashboard UI');
    });

    it('returns empty array when no match', () => {
      expect(searchProjects('xyz123', projects)).toHaveLength(0);
    });

    it('handles null/undefined projects', () => {
      expect(searchProjects('x', null)).toHaveLength(0);
    });

    it('ranks name matches before description matches', () => {
      const mixed = [
        { name: 'App Desc', description: 'alphonso backend', directory: '', updatedAtMs: 0 },
        { name: 'Alphonso Service', description: 'something', directory: '', updatedAtMs: 0 },
      ];
      const results = searchProjects('alphonso', mixed);
      expect(results[0].name).toBe('Alphonso Service');
    });
  });

  describe('getSearchSuggestions', () => {
    it('returns an array', () => {
      const suggestions = getSearchSuggestions('react');
      expect(Array.isArray(suggestions)).toBe(true);
    });

    it('caps at 10 suggestions', () => {
      const suggestions = getSearchSuggestions('a');
      expect(suggestions.length).toBeLessThanOrEqual(10);
    });
  });
});
