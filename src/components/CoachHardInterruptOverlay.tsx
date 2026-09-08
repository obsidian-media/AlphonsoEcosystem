import React, { useRef } from 'react';
import { COACH_INTERVENTION_LEVELS } from '../services/coachInterventionService';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface Props {
  intervention: {
    level?: string;
    message?: string;
    metrics?: {
      spinCount?: number;
      netResult?: number;
      longestLosingStretch?: number;
    };
  } | null;
  pauseUntilMs: number;
  onAction?: (action: string) => void;
}

export function CoachHardInterruptOverlay({ intervention, pauseUntilMs, onAction }: Props) {
  const isActive = intervention?.level === COACH_INTERVENTION_LEVELS.HARD;
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, isActive);
  if (!isActive) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[var(--error-dim)] p-6 backdrop-blur-md" role="alertdialog" aria-modal="true">
      <div ref={dialogRef} className="w-full max-w-2xl overflow-hidden rounded-3xl border border-[var(--error-border)] bg-[var(--surface-0)] shadow-[0_0_90px_rgba(239,68,68,0.35)]">
        <div className="border-b border-[var(--error-border)] bg-[var(--error-dim)] px-6 py-4">
          <div className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--error)]">Hard Interrupt</div>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-[var(--text-1)]">Pause before continuing.</h2>
        </div>
        <div className="space-y-4 p-6">
          <p className="text-sm leading-relaxed text-[var(--text-2)]">{intervention.message}</p>
          <div className="grid grid-cols-3 gap-2 text-center text-xs text-[var(--text-2)]">
            <div className="rounded-xl bg-[var(--surface-2)] p-3">Spins<br /><b className="text-[var(--text-1)]">{intervention.metrics?.spinCount || 0}</b></div>
            <div className="rounded-xl bg-[var(--surface-2)] p-3">Net<br /><b className="text-[var(--text-1)]">{intervention.metrics?.netResult || 0}</b></div>
            <div className="rounded-xl bg-[var(--surface-2)] p-3">Stretch<br /><b className="text-[var(--text-1)]">{intervention.metrics?.longestLosingStretch || 0}</b></div>
          </div>
          {pauseUntilMs > Date.now() && (
            <div className="rounded-xl bg-[var(--error-dim)] px-4 py-3 text-sm font-semibold text-[var(--error)]">
              Pause active until {new Date(pauseUntilMs).toLocaleTimeString()}.
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => onAction?.('pause_60_seconds')} className="rounded-xl bg-[var(--text-1)] px-4 py-2 text-xs font-black uppercase tracking-widest text-[var(--surface-0)] hover:bg-[var(--error-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--error-border)]" aria-label="Pause for 60 seconds">Pause 60s</button>
            <button type="button" onClick={() => onAction?.('end_session')} className="rounded-xl border border-[var(--error-border)] bg-[var(--error-dim)] px-4 py-2 text-xs font-bold uppercase tracking-widest text-[var(--error)] hover:bg-[var(--error-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--error-border)]" aria-label="End session">End session</button>
            <button type="button" onClick={() => onAction?.('continue_anyway')} className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-bold uppercase tracking-widest text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-strong)]" aria-label="Continue anyway despite warning">Continue anyway</button>
          </div>
          <div className="text-[11px] text-[var(--text-3)]">Protective/local-only interruption. No upload, no prediction advice.</div>
        </div>
      </div>
    </div>
  );
}
