import React from 'react';

export function TrendResearch({ suggestions = [], onUseIdea }) {
  return (
    <div className="space-y-4 rounded-[3rem] border border-primary/20 bg-zinc-950/90 p-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Trend research</h2>
        <p className="mt-2 text-sm text-zinc-400">Local research seeds based on brand pillars and recent draft history.</p>
      </div>
      <div className="space-y-2">
        {suggestions.length === 0 && <div className="rounded-xl border border-white/10 bg-zinc-900/45 p-4 text-sm text-zinc-500">No trend seeds available yet.</div>}
        {suggestions.map((idea) => (
          <button key={idea} type="button" onClick={() => onUseIdea?.(idea)} className="w-full rounded-2xl border border-white/10 bg-zinc-900/45 p-3 text-left text-sm text-zinc-100 hover:bg-zinc-900/70">
            {idea}
          </button>
        ))}
      </div>
    </div>
  );
}
