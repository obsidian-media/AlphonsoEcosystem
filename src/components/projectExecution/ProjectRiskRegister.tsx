import React from 'react';

interface Risk {
  id: string;
  title: string;
  severity?: string;
  mitigation?: string;
}

interface Props {
  risks?: Risk[];
}

export function ProjectRiskRegister({ risks = [] }: Props): React.JSX.Element {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-3)] font-bold mb-2">Risk Register</div>
      <div className="space-y-2">
        {risks.length === 0 && <div className="text-sm text-[var(--text-3)]">No risks captured yet.</div>}
        {risks.map((risk) => (
          <div key={risk.id} className="rounded-lg border border-[var(--border)] p-2">
            <div className="text-xs font-semibold text-[var(--text-2)]">{risk.title}</div>
            <div className="text-[11px] text-[var(--text-3)]">severity: {risk.severity}</div>
            <div className="text-[11px] text-[var(--text-3)] mt-1">{risk.mitigation}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
