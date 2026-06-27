import React from 'react';

interface TimelineStep {
  id: string;
  step?: string;
  phase?: string;
  action?: string;
  owner: string;
}

interface Props {
  timeline?: TimelineStep[];
}

export function ExecutionTimeline({ timeline = [] }: Props) {
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold mb-3">Execution Timeline</div>
      <div className="space-y-2">
        {timeline.length === 0 && <div className="text-sm text-zinc-500">No timeline available.</div>}
        {timeline.map((step) => (
          <div key={step.id} className="rounded-lg border border-white/10 bg-zinc-900/40 p-3 text-xs">
            <div className="text-zinc-200 font-semibold">Phase {step.id || step.step}: {step.phase || step.action}</div>
            <div className="text-zinc-500 mt-1">owner: {step.owner}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
