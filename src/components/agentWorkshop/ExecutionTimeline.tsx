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
    <div className="rounded-2xl bg-(--surface-0) p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-(--text-3) font-bold mb-3">Execution Timeline</div>
      <div className="space-y-2">
        {timeline.length === 0 && <div className="text-sm text-(--text-3)">No timeline available.</div>}
        {timeline.map((step) => (
          <div key={step.id} className="rounded-lg bg-(--surface-2) p-3 text-xs">
            <div className="text-(--text-2) font-semibold">Phase {step.id || step.step}: {step.phase || step.action}</div>
            <div className="text-(--text-3) mt-1">owner: {step.owner}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
