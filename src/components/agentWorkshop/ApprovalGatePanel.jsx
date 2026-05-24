import React from 'react';

export function ApprovalGatePanel({ gates = [] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold mb-3">Approval Gates</div>
      <div className="space-y-2">
        {gates.length === 0 && <div className="text-sm text-zinc-500">No approval gates generated.</div>}
        {gates.map((gate) => (
          <div key={gate.id} className="rounded-lg border border-amber-400/20 bg-amber-500/10 p-3">
            <div className="text-sm font-semibold text-amber-100">{gate.actionType}</div>
            <div className="text-xs text-amber-200/80 mt-1">{gate.reason}</div>
            <div className="text-[11px] text-amber-300/80 mt-1">risk: {gate.riskLevel} | status: {gate.status}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

