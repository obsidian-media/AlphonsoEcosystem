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

export function ProjectRoadmap({ timeline = [] }: Props): React.JSX.Element {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-3)] font-bold mb-2">Project Roadmap</div>
      <div className="space-y-2">
        {timeline.length === 0 && <div className="text-sm text-[var(--text-3)]">No roadmap yet.</div>}
        {timeline.map((step) => (
          <div key={step.id} className="rounded-lg border border-[var(--border)] p-2 text-xs">
            <div className="text-[var(--text-2)] font-semibold">{step.phase ?? step.action}</div>
            <div className="text-[var(--text-3)]">{step.owner}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
