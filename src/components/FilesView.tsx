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
      <div className="shrink-0 p-4 border-b border-white/[0.04] space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-zinc-100">Knowledge</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{memoryItems.length} memory records</p>
          </div>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search memory..."
          className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50"
        />
        <div className="flex gap-1.5 flex-wrap">
          {categories.slice(0, 12).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                activeCategory === cat
                  ? 'bg-indigo-600 text-white border-indigo-500'
                  : 'bg-zinc-900 text-zinc-500 border-white/[0.06] hover:text-zinc-300'
              }`}
            >
              {cat.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {memoryItems.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-zinc-600">
            <Database className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-xs text-center">No files yet — attach files in chat to see them here.</p>
          </div>
        )}
        {memoryItems.length > 0 && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-zinc-600">
            <Database className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-xs">No memories match your filter.</p>
          </div>
        )}
        {filtered.map((item) => (
          <div key={item.id} className="rounded-xl border border-white/[0.05] bg-zinc-900/50 px-4 py-3 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-medium text-zinc-200 leading-snug">{item.title || 'Untitled'}</div>
              <span className="text-[9px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-500 shrink-0 uppercase tracking-wider">{item.category?.replace(/_/g, ' ')}</span>
            </div>
            {item.content && typeof item.content === 'string' && (
              <div className="text-xs text-zinc-500 leading-relaxed line-clamp-2">{item.content}</div>
            )}
            <div className="text-[10px] text-zinc-700 font-mono">{new Date(item.timestampMs || 0).toLocaleString()} · {item.sourceAgent || 'alphonso'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
