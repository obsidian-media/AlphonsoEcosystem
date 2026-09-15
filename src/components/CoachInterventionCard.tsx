import React from 'react';

interface Props {
  intervention: {
    level?: string;
    title?: string;
    message?: string;
    metrics?: {
      spinCount?: number;
      netResult?: number;
      longestLosingStretch?: number;
    };
  } | null;
  onAction?: (action: string) => void;
  onDemo?: () => void;
  pauseUntilMs: number;
}

export function CoachInterventionCard({ intervention, onAction, onDemo, pauseUntilMs }: Props) {
  const level = intervention?.level || 'quiet';
  const tone = level === 'hard'
    ? 'bg-[var(--error-dim)] text-[var(--error)] shadow-[0_0_40px_rgba(239,68,68,0.18)]'
    : level === 'firm'
      ? 'bg-[var(--warning-dim)] text-[var(--warning)] shadow-[0_0_34px_rgba(245,158,11,0.14)]'
      : 'bg-[var(--info-dim)] text-[var(--info)]';
  const toneBorder = level === 'hard'
    ? 'border-[var(--error-border)]'
    : level === 'firm'
      ? 'border-[var(--warning-border)]'
      : 'border-[var(--info-border)]';

  if (!intervention) {
    return (
      <div className="rounded-2xl bg-[var(--surface-2)] p-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-3)]">Session guard</div>
        <div className="mt-2 text-sm font-semibold text-[var(--text-2)]">No active intervention.</div>
        <div className="mt-1 text-xs leading-relaxed text-[var(--text-3)]">Local bridge is ready for protective session events.</div>
        {onDemo && (
          <button
            type="button"
            onClick={onDemo}
            className="mt-3 rounded-lg border border-[var(--info-border)] bg-[var(--info-dim)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--info)] hover:bg-[var(--info-dim)]"
          >
            Demo check-in
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-2xl p-4 ${tone}`} role="alert">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Local Coach Intervention</div>
          <div className="mt-1 text-lg font-black">{intervention.title}</div>
        </div>
        <div className={`rounded-full border ${toneBorder} px-2 py-1 text-[10px] font-bold uppercase tracking-widest`}>{level}</div>
      </div>
      <p className="mt-3 text-sm leading-relaxed">{intervention.message}</p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] opacity-75">
        <div className="rounded-lg bg-black/20 px-2 py-1">Spins<br /><b>{intervention.metrics?.spinCount || 0}</b></div>
        <div className="rounded-lg bg-black/20 px-2 py-1">Net<br /><b>{intervention.metrics?.netResult || 0}</b></div>
        <div className="rounded-lg bg-black/20 px-2 py-1">Stretch<br /><b>{intervention.metrics?.longestLosingStretch || 0}</b></div>
      </div>
      {pauseUntilMs > Date.now() && (
        <div className={`mt-3 rounded-lg border ${toneBorder} bg-black/25 px-3 py-2 text-[11px] font-semibold opacity-80`}>
          Pause active until {new Date(pauseUntilMs).toLocaleTimeString()}.
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => onAction?.('pause_60_seconds')} className="rounded-lg bg-[var(--text-1)] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-[var(--surface-0)] hover:opacity-90">Pause 60s</button>
        <button type="button" onClick={() => onAction?.('end_session')} className={`rounded-lg border ${toneBorder} px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest opacity-90 hover:opacity-100`}>End session</button>
        <button type="button" onClick={() => onAction?.(level === 'hard' ? 'continue_anyway' : 'continue')} className={`rounded-lg border ${toneBorder} px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest opacity-60 hover:opacity-100`}>{level === 'hard' ? 'Continue anyway' : 'Continue'}</button>
      </div>
      <div className="mt-2 text-[10px] opacity-45">Private/local-only. Actions write a local log only — no upload, no prediction advice.</div>
    </div>
  );
}
