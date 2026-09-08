import React from 'react';

interface Props {
  agent: string;
  state?: string;
  message?: string;
}

export function CoachMissionBadge({ agent, state, message }: Props) {
  const label = agent === 'miya' ? 'Miya' : agent === 'jose' ? 'Jose' : agent === 'hector' ? 'Hector' : 'Alphonso';
  const tone = state === 'warning' || state === 'approval_required'
    ? 'text-[var(--warning)] bg-[var(--warning-dim)]'
    : state === 'task_complete'
      ? 'text-[var(--success)] bg-[var(--success-dim)]'
      : state === 'listening'
        ? 'text-[var(--error)] bg-[var(--error-dim)]'
        : 'text-[var(--info)] bg-[var(--info-dim)]';

  return (
    <div className={`rounded-xl px-3 py-2 ${tone}`}>
      <div className="text-[10px] font-bold uppercase tracking-widest">{label} mission</div>
      <div className="mt-1 text-xs font-semibold">{state || 'idle'}</div>
      <div className="mt-1 text-[11px] text-[var(--text-2)] truncate">{message || 'Standing by'}</div>
    </div>
  );
}
