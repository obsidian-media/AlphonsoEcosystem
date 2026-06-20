import React from 'react';

export function ProjectRiskRegister({ risks = [] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold mb-2">Risk Register</div>
      <div className="space-y-2">
        {risks.length === 0 && <div className="text-sm text-zinc-500">No risks captured yet.</div>}
        {risks.map((risk) => (
          <div key={risk.id} className="rounded-lg border border-white/10 p-2">
            <div className="text-xs font-semibold text-zinc-200">{risk.title}</div>
            <div className="text-[11px] text-zinc-500">severity: {risk.severity}</div>
            <div className="text-[11px] text-zinc-400 mt-1">{risk.mitigation}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

