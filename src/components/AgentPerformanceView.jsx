import React from 'react';

export function AgentPerformanceView({ receipts = [] }) {
  if (!receipts.length) {
    return <div className="p-4 text-zinc-500 text-sm">No performance data yet.</div>;
  }

  const stats = {};
  receipts.forEach(r => {
    const name = r.agent ?? r.agentId ?? 'unknown';
    if (!stats[name]) stats[name] = { success: 0, error: 0, latencies: [] };
    if (r.status === 'success' || r.status === 'completed') stats[name].success++;
    else stats[name].error++;
    if (r.durationMs ?? r.latency) stats[name].latencies.push(r.durationMs ?? r.latency);
  });

  return (
    <div className="p-3 space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Agent Performance</div>
      {Object.entries(stats).map(([name, s]) => {
        const avg = s.latencies.length ? Math.round(s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length) : null;
        return (
          <div key={name} className="flex items-center gap-3 rounded-lg border border-white/5 bg-zinc-800/40 px-3 py-2">
            <span className="text-xs font-semibold text-zinc-200 w-20 shrink-0">{name}</span>
            <span className="text-[11px] text-emerald-400">{s.success} ok</span>
            <span className="text-[11px] text-red-400">{s.error} err</span>
            {avg !== null && <span className="text-[11px] text-zinc-500">{avg}ms avg</span>}
          </div>
        );
      })}
    </div>
  );
}
