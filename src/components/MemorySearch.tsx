import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Calendar, Tag, User, ArrowRight } from 'lucide-react';
import { searchMemory, getSearchSuggestions } from '../services/searchService';
import { MarkdownMessage } from './MarkdownMessage';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface MemoryItem {
  id: string;
  title: string;
  content: string | Record<string, unknown>;
  category?: string;
  sourceAgent: string;
  timestampMs: number;
}

interface Props {
  onClose?: () => void;
  onSelect?: (item: MemoryItem) => void;
}

export function MemorySearch({ onClose, onSelect }: Props) {
  const [query, setQuery] = useState<string>('');
  const [results, setResults] = useState<MemoryItem[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Declared after the input-focus effect above so it observes the input
  // already focused (contains() check) rather than racing it -- see
  // useFocusTrap's own doc comment on not stealing an already-set focus.
  useFocusTrap(panelRef, true);

  useEffect(() => {
    // The footer below has always said "Press Esc to close" -- there was no
    // listener actually implementing it, a real bug found while adding the
    // focus trap here, not something the trap itself changes.
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (query.length >= 2) {
        const options: { categories?: string[]; sourceAgents?: string[] } = {};
        if (selectedCategory) options.categories = [selectedCategory];
        if (selectedAgent) options.sourceAgents = [selectedAgent];
        const results = searchMemory(query, options);
        setResults(results);
        setSuggestions(getSearchSuggestions(query));
      } else {
        setResults([]);
        setSuggestions([]);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selectedCategory, selectedAgent]);

  const handleSelect = (item: MemoryItem) => {
    onSelect?.(item);
    onClose?.();
  };

  const categories = ['project_memory', 'task_memory', 'creative_memory', 'orchestration_memory', 'research_memory', 'code_generation', 'timeline_memory'];
  const agents = ['alphonso', 'jose', 'hector', 'miya', 'maria', 'marcus', 'echo', 'sentinel', 'nova'];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="Memory search">
      <div
        ref={panelRef}
        className="w-full max-w-2xl bg-[var(--surface-1)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 p-4 border-b border-[var(--border)]">
          <Search className="w-5 h-5 text-[var(--text-3)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search memory, projects, agent outputs..."
            className="flex-1 bg-transparent text-[var(--text-1)] text-sm focus:outline-none placeholder-[var(--text-4)]"
            aria-label="Search memory"
          />
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--surface-3)] text-[var(--text-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)]" aria-label="Close memory search">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 p-3 border-b border-[var(--border)] overflow-x-auto">
          <Tag className="w-3.5 h-3.5 text-[var(--text-4)] shrink-0" />
          <button
            onClick={() => setSelectedCategory('')}
            className={`px-2 py-1 rounded-md text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)] ${!selectedCategory ? 'bg-[var(--accent-dim)] text-[var(--accent)]' : 'text-[var(--text-3)] hover:text-[var(--text-2)]'}`}
            aria-pressed={selectedCategory === ''}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat === selectedCategory ? '' : cat)}
              className={`px-2 py-1 rounded-md text-[10px] transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)] ${selectedCategory === cat ? 'bg-[var(--accent-dim)] text-[var(--accent)]' : 'text-[var(--text-3)] hover:text-[var(--text-2)]'}`}
              aria-pressed={selectedCategory === cat}
            >
              {cat.replace(/_/g, ' ')}
            </button>
          ))}
          <div className="w-px h-4 bg-[var(--border)] mx-1" />
          <User className="w-3.5 h-3.5 text-[var(--text-4)] shrink-0" />
          <button
            onClick={() => setSelectedAgent('')}
            className={`px-2 py-1 rounded-md text-[10px] transition-colors ${!selectedAgent ? 'bg-[var(--accent-dim)] text-[var(--accent)]' : 'text-[var(--text-3)] hover:text-[var(--text-2)]'}`}
          >
            All
          </button>
          {agents.slice(0, 5).map((agent) => (
            <button
              key={agent}
              onClick={() => setSelectedAgent(agent === selectedAgent ? '' : agent)}
              className={`px-2 py-1 rounded-md text-[10px] transition-colors capitalize whitespace-nowrap ${selectedAgent === agent ? 'bg-[var(--accent-dim)] text-[var(--accent)]' : 'text-[var(--text-3)] hover:text-[var(--text-2)]'}`}
            >
              {agent}
            </button>
          ))}
        </div>

        {suggestions.length > 0 && query.length >= 2 && results.length === 0 && (
          <div className="p-3 border-b border-[var(--border)]">
            <div className="text-[10px] text-[var(--text-4)] mb-1">Suggestions</div>
            <div className="flex flex-wrap gap-1">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setQuery(s)}
                  className="px-2 py-1 bg-[var(--surface-3)] hover:bg-[var(--surface-3)] rounded-md text-[10px] text-[var(--text-2)] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="max-h-96 overflow-y-auto">
          {results.length === 0 && query.length >= 2 && (
            <div className="p-8 text-center text-[var(--text-4)] text-sm">No memories found for this query.</div>
          )}
          {results.length === 0 && query.length < 2 && (
            <div className="p-8 text-center text-[var(--text-4)] text-sm">Type at least 2 characters to search</div>
          )}
          {results.map((item) => (
            <button
              key={item.id}
              onClick={() => handleSelect(item)}
              className="w-full text-left p-4 border-b border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors group"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-medium text-[var(--text-2)] group-hover:text-[var(--text-1)] truncate flex-1">
                  {item.title}
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  <span className="text-[9px] text-[var(--text-4)]">{item.category?.replace(/_/g, ' ')}</span>
                  <span className="text-[9px] text-[var(--text-4)] capitalize">{item.sourceAgent}</span>
                  <ArrowRight className="w-3 h-3 text-[var(--text-4)] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
              <div className="text-[11px] text-[var(--text-3)] line-clamp-2">
                {typeof item.content === 'string' ? item.content.slice(0, 200) : JSON.stringify(item.content).slice(0, 200)}
              </div>
              <div className="flex items-center gap-1 mt-1 text-[9px] text-[var(--text-4)]">
                <Calendar className="w-2.5 h-2.5" />
                {new Date(item.timestampMs).toLocaleDateString()}
              </div>
            </button>
          ))}
        </div>

        <div className="p-3 border-t border-[var(--border)] flex items-center justify-between text-[10px] text-[var(--text-4)]">
          <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
          <span>Press Esc to close</span>
        </div>
      </div>
    </div>
  );
}
