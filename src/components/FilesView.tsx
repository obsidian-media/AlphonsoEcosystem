import React from 'react';
import { Database } from 'lucide-react';

interface MemoryItem {
  id: string;
  title?: string;
  content?: string;
  category?: string;
  timestampMs?: number;
  sourceAgent?: string;
}

interface Props {
  memoryItems?: MemoryItem[];
}

export function FilesView({ memoryItems = [] }: Props) {
  const [search, setSearch] = React.useState<string>('');
  const [activeCategory, setActiveCategory] = React.useState<string>('all');

  const categories = React.useMemo(() => {
    const cats = [...new Set(memoryItems.map((item) => item.category).filter(Boolean))];
    return ['all', ...cats] as string[];
  }, [memoryItems]);

  const filtered = React.useMemo(() => {
    return memoryItems
      .slice()
      .reverse()
      .filter((item) => {
        if (activeCategory !== 'all' && item.category !== activeCategory) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          const title = String(item.title || '').toLowerCase();
          const content = typeof item.content === 'string' ? item.content.toLowerCase() : '';
          return title.includes(q) || content.includes(q);
        }
        return true;
      })
      .slice(0, 200);
  }, [memoryItems, search, activeCategory]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 p-4 border-b border-[var(--border)] space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[var(--text-1)]">Knowledge</h2>
            <p className="text-xs text-[var(--text-3)] mt-0.5">{memoryItems.length} memory records</p>
          </div>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search memory..."
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-1)] placeholder-[var(--text-4)] focus:outline-none focus:border-[var(--accent-border)]"
        />
        <div className="flex gap-1.5 flex-wrap">
          {categories.slice(0, 12).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                activeCategory === cat
                  ? 'bg-[var(--accent)] text-white border-[var(--accent-hover)]'
                  : 'bg-[var(--surface-2)] text-[var(--text-3)] border-[var(--border)] hover:text-[var(--text-2)]'
              }`}
            >
              {cat.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {memoryItems.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-[var(--text-4)]">
            <Database className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-xs text-center">No files yet — attach files in chat to see them here.</p>
          </div>
        )}
        {memoryItems.length > 0 && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-[var(--text-4)]">
            <Database className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-xs">No memories match your filter.</p>
          </div>
        )}
        {filtered.map((item) => (
          <div key={item.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-medium text-[var(--text-2)] leading-snug">{item.title || 'Untitled'}</div>
              <span className="text-[9px] px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--text-3)] shrink-0 uppercase tracking-wider">{item.category?.replace(/_/g, ' ')}</span>
            </div>
            {item.content && typeof item.content === 'string' && (
              <div className="text-xs text-[var(--text-3)] leading-relaxed line-clamp-2">{item.content}</div>
            )}
            <div className="text-[10px] text-[var(--text-4)] font-mono">{new Date(item.timestampMs || 0).toLocaleString()} · {item.sourceAgent || 'alphonso'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
