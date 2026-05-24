import React from 'react';

export function DraftList({ drafts = [], onSelect }) {
  return (
    <div className="space-y-2 rounded-[3rem] border border-primary/20 bg-zinc-950/90 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Draft history</h2>
        <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{drafts.length} drafts</div>
      </div>
      <div className="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
        {drafts.length === 0 && <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4 text-sm text-zinc-500">No content jobs yet.</div>}
        {drafts.map((draft) => (
          <button
            key={draft.id}
            type="button"
            onClick={() => onSelect?.(draft.id)}
            className="w-full rounded-2xl border border-white/10 bg-zinc-900/45 p-3 text-left hover:bg-zinc-900/70"
          >
            <div className="text-sm font-semibold text-white truncate">{draft.idea || 'Untitled content job'}</div>
            <div className="mt-1 text-[11px] text-zinc-500">{draft.platform} | {draft.format} | {draft.status}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
