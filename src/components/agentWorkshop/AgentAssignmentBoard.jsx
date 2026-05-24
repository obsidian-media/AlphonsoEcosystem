import React from 'react';

export function AgentAssignmentBoard({ packets = [] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold mb-3">Agent Assignment Board</div>
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {packets.length === 0 && <div className="text-sm text-zinc-500">No packets generated yet.</div>}
        {packets.map((packet) => (
          <div key={packet.id} className="rounded-lg border border-white/10 bg-zinc-900/40 p-3">
            <div className="text-sm font-semibold text-white">{packet.title}</div>
            <div className="text-xs text-zinc-400">{packet.summary}</div>
            <div className="text-[11px] text-zinc-500 mt-1">risk: {packet.riskLevel} | approval: {packet.requiresApproval ? 'required' : 'not required'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

