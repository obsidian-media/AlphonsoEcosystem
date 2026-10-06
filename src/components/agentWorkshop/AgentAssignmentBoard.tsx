import React from 'react';

interface Packet {
  id: string;
  title: string;
  summary: string;
  riskLevel: string;
  requiresApproval: boolean;
}

interface Props {
  packets?: Packet[];
}

export function AgentAssignmentBoard({ packets = [] }: Props) {
  return (
    <div className="rounded-2xl bg-(--surface-0) p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-(--text-3) font-bold mb-3">Agent Assignment Board</div>
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {packets.length === 0 && <div className="text-sm text-(--text-3)">No packets generated yet.</div>}
        {packets.map((packet) => (
          <div key={packet.id} className="rounded-lg bg-(--surface-2) p-3">
            <div className="text-sm font-semibold text-(--text-1)">{packet.title}</div>
            <div className="text-xs text-(--text-3)">{packet.summary}</div>
            <div className="text-[11px] text-(--text-3) mt-1">risk: {packet.riskLevel} | approval: {packet.requiresApproval ? 'required' : 'not required'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
