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
    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold">Final Execution Packet</div>
        <button type="button" onClick={copyPacket} className="rounded-md border border-indigo-400/30 bg-indigo-500/10 px-2 py-1 text-[10px] font-semibold text-indigo-200">
          Copy JSON
        </button>
      </div>
      {!finalPacket && <div className="text-sm text-zinc-500">Generate packet to view final synthesis.</div>}
      {finalPacket && (
        <div className="rounded-lg border border-white/10 bg-zinc-900/40 p-3 space-y-2">
          <div className="text-sm font-semibold text-white">{finalPacket.title}</div>
          <div className="text-xs text-zinc-300">{finalPacket.summary}</div>
          <div className="text-[11px] text-zinc-500">risk: {finalPacket.riskLevel} | approval: {finalPacket.requiresApproval ? 'required' : 'not required'}</div>
        </div>
      )}
    </div>
  );
}
