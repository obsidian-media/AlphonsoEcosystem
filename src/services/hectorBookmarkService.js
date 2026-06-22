const STORAGE_KEY = 'alphonso_hector_bookmarks_v1';
const MAX_BOOKMARKS = 200;

// ── Storage helpers ────────────────────────────────────────────────────────────

function loadBookmarks() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}

function saveBookmarks(bookmarks) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks)); } catch { /* localStorage unavailable */ }
}

function makeId() {
  return `bm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function saveBookmark({ title, url, summary = '', tags = [], sourceAgent = 'hector' } = {}) {
  const bookmarks = loadBookmarks();
  const bookmark = {
    id: makeId(),
    title: String(title || '').slice(0, 300),
    url: String(url || '').slice(0, 2000),
    summary: String(summary || '').slice(0, 1000),
    tags: Array.isArray(tags) ? tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean) : [],
    sourceAgent: String(sourceAgent || 'hector'),
    savedAt: Date.now()
  };
  bookmarks.push(bookmark);
  if (bookmarks.length > MAX_BOOKMARKS) bookmarks.splice(0, bookmarks.length - MAX_BOOKMARKS);
  saveBookmarks(bookmarks);
  return bookmark;
}

export function getBookmarks({ tag, search, limit } = {}) {
  let bookmarks = loadBookmarks();

  if (tag) {
    const t = String(tag).toLowerCase().trim();
    bookmarks = bookmarks.filter((b) => b.tags.includes(t));
  }

  if (search) {
    const q = String(search).toLowerCase();
    bookmarks = bookmarks.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.url.toLowerCase().includes(q) ||
        b.summary.toLowerCase().includes(q)
    );
  }

  // Return newest first
  bookmarks = bookmarks.slice().reverse();

  if (limit && limit > 0) bookmarks = bookmarks.slice(0, limit);

  return bookmarks;
}

export function deleteBookmark(id) {
  const bookmarks = loadBookmarks().filter((b) => b.id !== id);
  saveBookmarks(bookmarks);
}

export function exportBookmarks() {
  return JSON.stringify(loadBookmarks(), null, 2);
}

export function getStats() {
  const bookmarks = loadBookmarks();
  const byTag = {};
  for (const b of bookmarks) {
    for (const tag of b.tags) {
      byTag[tag] = (byTag[tag] ?? 0) + 1;
    }
  }
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentCount = bookmarks.filter((b) => b.savedAt >= oneWeekAgo).length;
  return { total: bookmarks.length, byTag, recentCount };
}
