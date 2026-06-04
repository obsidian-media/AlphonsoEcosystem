import React from 'react';
import { COACH_INTERVENTION_LEVELS } from '../services/coachInterventionService';

export function CoachHardInterruptOverlay({ intervention, pauseUntilMs, onAction }) {
  if (intervention?.level !== COACH_INTERVENTION_LEVELS.HARD) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-red-950/45 p-6 backdrop-blur-md" role="alertdialog" aria-modal="true">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-red-300/35 bg-zinc-950 shadow-[0_0_90px_rgba(239,68,68,0.35)]">
        <div className="border-b border-red-300/20 bg-red-500/15 px-6 py-4">
          <div className="text-[11px] font-black uppercase tracking-[0.24em] text-red-100">Hard Interrupt</div>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-white">Pause before continuing.</h2>
        </div>
        <div className="space-y-4 p-6">
          <p className="text-sm leading-relaxed text-zinc-200">{intervention.message}</p>
          <div className="grid grid-cols-3 gap-2 text-center text-xs text-zinc-300">
            <div className="rounded-xl border border-white/10 bg-black/25 p-3">Spins<br /><b className="text-white">{intervention.metrics?.spinCount || 0}</b></div>
            <div className="rounded-xl border border-white/10 bg-black/25 p-3">Net<br /><b className="text-white">{intervention.metrics?.netResult || 0}</b></div>
            <div className="rounded-xl border border-white/10 bg-black/25 p-3">Stretch<br /><b className="text-white">{intervention.metrics?.longestLosingStretch || 0}</b></div>
          </div>
          {pauseUntilMs > Date.now() && (
            <div className="rounded-xl border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-50">
              Pause active until {new Date(pauseUntilMs).toLocaleTimeString()}.
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => onAction?.('pause_60_seconds')} className="rounded-xl bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-zinc-950 hover:bg-red-100">Pause 60s</button>
            <button type="button" onClick={() => onAction?.('end_session')} className="rounded-xl border border-red-300/30 bg-red-500/15 px-4 py-2 text-xs font-bold uppercase tracking-widest text-red-50 hover:bg-red-500/25">End session</button>
            <button type="button" onClick={() => onAction?.('continue_anyway')} className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-400 hover:bg-white/10 hover:text-zinc-100">Continue anyway</button>
          </div>
          <div className="text-[11px] text-zinc-500">Protective/local-only interruption. No upload, no prediction advice.</div>
        </div>
      </div>
    </div>
  );
}
