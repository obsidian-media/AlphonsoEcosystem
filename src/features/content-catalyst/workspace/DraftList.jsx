import React from 'react';
import { List } from 'lucide-react';

export function DraftList({ drafts = [], onSelect }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <List className="h-3.5 w-3.5 text-[var(--accent)]" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-3)]">History</span>
        </div>
        <span className="text-[9px] uppercase tracking-widest text-[var(--text-4)]">{drafts.length} jobs</span>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {drafts.length === 0 && (
          <div className="px-4 py-6 text-center text-[10px] text-[var(--text-4)]">No jobs yet — create one above.</div>
        )}
        {drafts.map((draft) => (
          <button
            key={draft.id}
            type="button"
            onClick={() => onSelect?.(draft.id)}
            className="w-full px-4 py-2.5 text-left border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-3)] transition-colors"
          >
            <div className="text-xs font-semibold text-[var(--text-1)] truncate">{draft.idea || 'Untitled'}</div>
            <div className="mt-0.5 text-[9px] text-[var(--text-4)] uppercase tracking-widest">{[draft.platform, draft.format, draft.status].filter(Boolean).join(' · ')}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
