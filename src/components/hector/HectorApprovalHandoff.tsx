import React from 'react';
import { Zone } from '../ui/Zone';

interface Report {
  id: string;
}

interface Props {
  report?: Report | null;
  onCreateHandoff: (reportId: string) => void;
}

export function HectorApprovalHandoff({ report, onCreateHandoff }: Props): React.JSX.Element {
  return (
    <Zone mood="hector">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--agent-hector)]">Jose Approval Handoff</div>
      <p className="text-[11px] leading-relaxed text-[var(--text-3)]">
        Hector cannot execute, post, download executables, access accounts, or bypass Jose. Research reports become supervised handoff packets.
      </p>
      <button
        onClick={() => report && onCreateHandoff(report.id)}
        disabled={!report}
        className="mt-3 rounded-xl bg-[var(--agent-hector)] px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--surface-0)] hover:opacity-90 transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
      >
        Send Report To Jose
      </button>
    </Zone>
  );
}
