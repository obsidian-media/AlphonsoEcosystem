import { describe, it, expect, beforeEach } from 'vitest';
import { saveBookmark, getBookmarks, deleteBookmark, exportBookmarks, getStats } from '../../services/hectorBookmarkService';

describe('hectorBookmarkService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saveBookmark creates a bookmark with id', () => {
    const bm = saveBookmark({ title: 'Test', url: 'https://example.com' });
    expect(bm.id).toContain('bm_');
    expect(bm.title).toBe('Test');
    expect(bm.url).toBe('https://example.com');
  });

  it('saveBookmark truncates long title', () => {
    const longTitle = 'x'.repeat(500);
    const bm = saveBookmark({ title: longTitle });
    expect(bm.title.length).toBeLessThanOrEqual(300);
  });

  it('saveBookmark normalizes tags', () => {
    const bm = saveBookmark({ title: 'Test', tags: [' AI ', 'Research'] });
    expect(bm.tags).toContain('ai');
    expect(bm.tags).toContain('research');
  });

  it('getBookmarks returns all bookmarks newest first', () => {
    saveBookmark({ title: 'First', url: 'https://a.com' });
    saveBookmark({ title: 'Second', url: 'https://b.com' });
    const list = getBookmarks();
    expect(list.length).toBe(2);
    expect(list[0].title).toBe('Second');
  });

  it('getBookmarks filters by tag', () => {
    saveBookmark({ title: 'AI Book', url: 'https://a.com', tags: ['ai'] });
    saveBookmark({ title: 'Other', url: 'https://b.com', tags: ['other'] });
    const list = getBookmarks({ tag: 'ai' });
    expect(list.length).toBe(1);
    expect(list[0].title).toBe('AI Book');
  });

  it('getBookmarks filters by search', () => {
    saveBookmark({ title: 'React Guide', url: 'https://react.com' });
    saveBookmark({ title: 'Vue Guide', url: 'https://vue.com' });
    const list = getBookmarks({ search: 'React' });
    expect(list.length).toBe(1);
  });

  it('getBookmarks respects limit', () => {
    saveBookmark({ title: 'A', url: 'https://a.com' });
    saveBookmark({ title: 'B', url: 'https://b.com' });
    saveBookmark({ title: 'C', url: 'https://c.com' });
    const list = getBookmarks({ limit: 2 });
    expect(list.length).toBe(2);
  });

  it('deleteBookmark removes by id', () => {
    const bm = saveBookmark({ title: 'Test', url: 'https://test.com' });
    deleteBookmark(bm.id);
    expect(getBookmarks().length).toBe(0);
  });

  it('exportBookmarks returns JSON string', () => {
    saveBookmark({ title: 'Test', url: 'https://test.com' });
    const json = exportBookmarks();
    const parsed = JSON.parse(json);
    expect(parsed.length).toBe(1);
  });

  it('getStats returns correct counts', () => {
    saveBookmark({ title: 'A', url: 'https://a.com', tags: ['ai', 'ml'] });
    saveBookmark({ title: 'B', url: 'https://b.com', tags: ['ai'] });
    const stats = getStats();
    expect(stats.total).toBe(2);
    expect(stats.byTag.ai).toBe(2);
    expect(stats.byTag.ml).toBe(1);
    expect(stats.recentCount).toBe(2);
  });
});
