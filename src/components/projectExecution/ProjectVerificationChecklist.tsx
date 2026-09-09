import React from 'react';

interface ChecklistItem {
  id: string;
  item: string;
  owner?: string;
}

interface Props {
  checklist?: ChecklistItem[];
}

export function ProjectVerificationChecklist({ checklist = [] }: Props): React.JSX.Element {
  return (
    <div className="rounded-xl bg-[var(--surface-2)] p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-3)] font-bold mb-2">Verification Checklist</div>
      <div className="space-y-2">
        {checklist.length === 0 && <div className="text-sm text-[var(--text-3)]">No verification checklist yet.</div>}
        {checklist.map((item) => (
          <div key={item.id} className="rounded-lg px-3 py-2 text-xs text-[var(--text-2)]">
            [{item.owner}] {item.item}
          </div>
        ))}
      </div>
    </div>
  );
}
