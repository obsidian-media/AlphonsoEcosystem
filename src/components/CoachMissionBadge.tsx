import React from 'react';

interface Props {
  agent: string;
  state?: string;
  message?: string;
}

export function CoachMissionBadge({ agent, state, message }: Props) {
  const label = agent === 'miya' ? 'Miya' : agent === 'jose' ? 'Jose' : agent === 'hector' ? 'Hector' : 'Alphonso';
  const tone = state === 'warning' || state === 'approval_required'
    ? 'text-amber-100 border-amber-300/20 bg-amber-500/10'
    : state === 'task_complete'
      ? 'text-emerald-100 border-emerald-300/20 bg-emerald-500/10'
      : state === 'listening'
        ? 'text-red-100 border-red-300/20 bg-red-500/10'
        : 'text-cyan-100 border-cyan-300/20 bg-cyan-500/10';

  return (
    <div className={`rounded-xl border px-3 py-2 ${tone}`}>
      <div className="text-[10px] font-bold uppercase tracking-widest">{label} mission</div>
      <div className="mt-1 text-xs font-semibold">{state || 'idle'}</div>
      <div className="mt-1 text-[11px] text-zinc-200/85 truncate">{message || 'Standing by'}</div>
    </div>
  );
}
