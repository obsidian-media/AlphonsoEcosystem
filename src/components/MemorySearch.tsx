import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Calendar, Tag, User, ArrowRight } from 'lucide-react';
import { searchMemory, getSearchSuggestions } from '../services/searchService';
import { MarkdownMessage } from './MarkdownMessage';

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

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
        className="w-full max-w-2xl bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 p-4 border-b border-white/5">
          <Search className="w-5 h-5 text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search memory, projects, agent outputs..."
            className="flex-1 bg-transparent text-zinc-100 text-sm focus:outline-none placeholder-zinc-600"
            aria-label="Search memory"
          />
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50" aria-label="Close memory search">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 p-3 border-b border-white/5 overflow-x-auto">
          <Tag className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
          <button
            onClick={() => setSelectedCategory('')}
            className={`px-2 py-1 rounded-md text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 ${!selectedCategory ? 'bg-indigo-500/20 text-indigo-300' : 'text-zinc-500 hover:text-zinc-300'}`}
            aria-pressed={selectedCategory === ''}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat === selectedCategory ? '' : cat)}
              className={`px-2 py-1 rounded-md text-[10px] transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 ${selectedCategory === cat ? 'bg-indigo-500/20 text-indigo-300' : 'text-zinc-500 hover:text-zinc-300'}`}
              aria-pressed={selectedCategory === cat}
            >
              {cat.replace(/_/g, ' ')}
            </button>
          ))}
          <div className="w-px h-4 bg-zinc-800 mx-1" />
          <User className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
          <button
            onClick={() => setSelectedAgent('')}
            className={`px-2 py-1 rounded-md text-[10px] transition-colors ${!selectedAgent ? 'bg-indigo-500/20 text-indigo-300' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            All
          </button>
          {agents.slice(0, 5).map((agent) => (
            <button
              key={agent}
              onClick={() => setSelectedAgent(agent === selectedAgent ? '' : agent)}
              className={`px-2 py-1 rounded-md text-[10px] transition-colors capitalize whitespace-nowrap ${selectedAgent === agent ? 'bg-indigo-500/20 text-indigo-300' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              {agent}
            </button>
          ))}
        </div>

        {suggestions.length > 0 && query.length >= 2 && results.length === 0 && (
          <div className="p-3 border-b border-white/5">
            <div className="text-[10px] text-zinc-600 mb-1">Suggestions</div>
            <div className="flex flex-wrap gap-1">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setQuery(s)}
                  className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded-md text-[10px] text-zinc-300 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="max-h-96 overflow-y-auto">
          {results.length === 0 && query.length >= 2 && (
            <div className="p-8 text-center text-zinc-600 text-sm">No memories found for this query.</div>
          )}
          {results.length === 0 && query.length < 2 && (
            <div className="p-8 text-center text-zinc-600 text-sm">Type at least 2 characters to search</div>
          )}
          {results.map((item) => (
            <button
              key={item.id}
              onClick={() => handleSelect(item)}
              className="w-full text-left p-4 border-b border-white/5 hover:bg-zinc-900/50 transition-colors group"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-medium text-zinc-200 group-hover:text-white truncate flex-1">
                  {item.title}
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  <span className="text-[9px] text-zinc-600">{item.category?.replace(/_/g, ' ')}</span>
                  <span className="text-[9px] text-zinc-700 capitalize">{item.sourceAgent}</span>
                  <ArrowRight className="w-3 h-3 text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
              <div className="text-[11px] text-zinc-500 line-clamp-2">
                {typeof item.content === 'string' ? item.content.slice(0, 200) : JSON.stringify(item.content).slice(0, 200)}
              </div>
              <div className="flex items-center gap-1 mt-1 text-[9px] text-zinc-700">
                <Calendar className="w-2.5 h-2.5" />
                {new Date(item.timestampMs).toLocaleDateString()}
              </div>
            </button>
          ))}
        </div>

        <div className="p-3 border-t border-white/5 flex items-center justify-between text-[10px] text-zinc-600">
          <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
          <span>Press Esc to close</span>
        </div>
      </div>
    </div>
  );
}
