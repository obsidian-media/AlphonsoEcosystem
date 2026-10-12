import React from 'react';
import { Radar } from 'lucide-react';

export function TrendResearch({ suggestions = [], onUseIdea }) {
  return (
    <div className="rounded-xl border border-(--border) bg-(--surface-1) overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-(--border)">
        <Radar className="h-3.5 w-3.5 text-(--accent)" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-(--text-3)">Trend seeds</span>
      </div>
      <div className="p-3 space-y-1.5">
        {suggestions.length === 0 && (
          <p className="text-[10px] text-(--text-4) py-2 px-1">No seeds yet — save a brand profile with pillars to generate ideas.</p>
        )}
        {suggestions.map((idea) => (
          <button
            key={idea}
            type="button"
            onClick={() => onUseIdea?.(idea)}
            className="w-full rounded-lg border border-(--border) bg-(--surface-2) px-3 py-2 text-left text-xs text-(--text-2) hover:bg-(--surface-3) hover:text-(--text-1) transition-colors"
          >
            {idea}
          </button>
        ))}
      </div>
    </div>
  );
}
