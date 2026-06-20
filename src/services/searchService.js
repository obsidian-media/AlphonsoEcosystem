import { listMemory } from './unifiedMemoryService';

export function searchMemory(query, options = {}) {
  const { limit = 50, categories = [], sourceAgents = [], dateFrom, dateTo } = options;
  const lowerQuery = query.toLowerCase();

  const results = listMemory({ search: lowerQuery });

  const filtered = results.filter((item) => {
    if (categories.length > 0 && !categories.includes(item.category)) return false;
    if (sourceAgents.length > 0 && !sourceAgents.includes(item.sourceAgent)) return false;
    if (dateFrom && item.timestampMs < dateFrom) return false;
    if (dateTo && item.timestampMs > dateTo) return false;
    return true;
  });

  // Score by relevance
  const scored = filtered.map((item) => {
    let score = 0;
    const title = (item.title || '').toLowerCase();
    const content = typeof item.content === 'string' ? item.content.toLowerCase() : JSON.stringify(item.content).toLowerCase();

    // Exact title match
    if (title.includes(lowerQuery)) score += 10;
    // Exact content match
    if (content.includes(lowerQuery)) score += 5;
    // Word-level matches
    const words = lowerQuery.split(/\s+/).filter((w) => w.length > 2);
    for (const word of words) {
      if (title.includes(word)) score += 3;
      if (content.includes(word)) score += 1;
    }
    // Recency bonus
    const ageDays = (Date.now() - item.timestampMs) / 86_400_000;
    score += Math.max(0, 5 - ageDays);

    return { ...item, score };
  });

  return scored
    .sort((a, b) => b.score - a.score || b.timestampMs - a.timestampMs)
    .slice(0, limit);
}

export function searchProjects(query, projects) {
  const lowerQuery = query.toLowerCase();
  return (projects || [])
    .filter((p) => {
      const name = (p.name || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      const dir = (p.directory || '').toLowerCase();
      return name.includes(lowerQuery) || desc.includes(lowerQuery) || dir.includes(lowerQuery);
    })
    .sort((a, b) => {
      const aName = (a.name || '').toLowerCase().includes(lowerQuery);
      const bName = (b.name || '').toLowerCase().includes(lowerQuery);
      if (aName && !bName) return -1;
      if (!aName && bName) return 1;
      return (b.updatedAtMs || 0) - (a.updatedAtMs || 0);
    });
}

export function getSearchSuggestions(query) {
  const lowerQuery = query.toLowerCase();
  const suggestions = new Set();

  // Search categories
  const memoryItems = listMemory();
  for (const item of memoryItems) {
    if ((item.title || '').toLowerCase().includes(lowerQuery)) {
      suggestions.add(item.category);
    }
    if (typeof item.content === 'string' && item.content.toLowerCase().includes(lowerQuery)) {
      // Extract potential keywords
      const words = item.content.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
      for (const word of words.slice(0, 3)) {
        if (word.includes(lowerQuery) || lowerQuery.includes(word)) {
          suggestions.add(word);
        }
      }
    }
  }

  return [...suggestions].slice(0, 10);
}
