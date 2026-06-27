import React from 'react';

interface TimelineStep {
  id: string;
  phase?: string;
  action?: string;
  owner?: string;
}

interface Props {
  timeline?: TimelineStep[];
}

export function ProjectRoadmap({ timeline = [] }: Props): JSX.Element {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold mb-2">Project Roadmap</div>
      <div className="space-y-2">
        {timeline.length === 0 && <div className="text-sm text-zinc-500">No roadmap yet.</div>}
        {timeline.map((step) => (
          <div key={step.id} className="rounded-lg border border-white/10 p-2 text-xs">
            <div className="text-zinc-200 font-semibold">{step.phase ?? step.action}</div>
            <div className="text-zinc-500">{step.owner}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
