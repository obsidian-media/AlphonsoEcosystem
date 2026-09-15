import React from 'react';

interface FinalPacket {
  title: string;
  summary: string;
  riskLevel: string;
  requiresApproval: boolean;
}

interface Props {
  finalPacket: FinalPacket | null;
}

export function FinalExecutionPacket({ finalPacket }: Props) {
  const copyPacket = () => {
    if (!finalPacket) return;
    navigator.clipboard?.writeText(JSON.stringify(finalPacket, null, 2));
  };

  return (
    <div className="rounded-2xl bg-[var(--surface-0)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-3)] font-bold">Final Execution Packet</div>
        <button type="button" onClick={copyPacket} className="rounded-md bg-[var(--accent-dim)] px-2 py-1 text-[10px] font-semibold text-[var(--accent)]">
          Copy JSON
        </button>
      </div>
      {!finalPacket && <div className="text-sm text-[var(--text-3)]">Generate packet to view final synthesis.</div>}
      {finalPacket && (
        <div className="rounded-lg bg-[var(--surface-2)] p-3 space-y-2">
          <div className="text-sm font-semibold text-[var(--text-1)]">{finalPacket.title}</div>
          <div className="text-xs text-[var(--text-2)]">{finalPacket.summary}</div>
          <div className="text-[11px] text-[var(--text-3)]">risk: {finalPacket.riskLevel} | approval: {finalPacket.requiresApproval ? 'required' : 'not required'}</div>
        </div>
      )}
    </div>
  );
}
