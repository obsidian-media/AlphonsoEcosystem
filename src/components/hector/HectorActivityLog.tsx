import React from 'react';

interface ActivityRow {
  id: string;
  type: string;
  timestampMs: number;
  confidence?: string;
}

interface Props {
  rows?: ActivityRow[];
}

export function HectorActivityLog({ rows = [] }: Props): React.JSX.Element {
  return (
    <section className="rounded-2xl border border-teal-300/15 bg-zinc-950/72 p-4">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-teal-200/75">Hector Activity Log</div>
      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
        {rows.length === 0 && <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4 text-sm text-zinc-500">No Hector activity yet.</div>}
        {rows.slice().reverse().map((row) => (
          <div key={row.id} className="rounded-xl border border-white/10 bg-zinc-900/55 p-3">
            <div className="text-xs font-semibold text-zinc-100">{row.type}</div>
            <div className="mt-1 text-[11px] text-zinc-500">{new Date(row.timestampMs).toLocaleString()} | {row.confidence}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
