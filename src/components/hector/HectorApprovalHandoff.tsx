import React, { useState } from 'react';
import { Zone } from '../ui/Zone';

interface Report {
  id: string;
  researchQuestion?: string;
  text?: string;
  summary?: string;
}

interface Props {
  report?: Report | null;
  /** Hands the text to Chat's message box; the Desk passes `fillChat`. */
  onUse: (text: string) => Promise<unknown> | unknown;
}

/**
 * "Use in a request" (agent phase 1, 2026-10-25): hands Hector's cited report to Chat with a
 * request. Since agent roles Part C2 it fills Chat's message box and opens Chat, instead of the
 * clipboard. Until 2026-10-25 "Send Report To Jose" made a review packet that nothing read.
 */
export function HectorApprovalHandoff({ report, onUse }: Props): React.JSX.Element {
  const [used, setUsed] = useState(false);
  const text = report ? `Using Hector's report on "${report.researchQuestion ?? ''}":\n\n${report.text || report.summary || ''}` : '';
  return (
    <Zone mood="hector">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-(--agent-hector)">Use in a request</div>
      <p className="text-[11px] leading-relaxed text-(--text-3)">
        Puts this report with its sources in Chat, where you add what you want done with it (a post, a plan, a decision).
      </p>
      <button
        onClick={async () => { if (!report) return; await onUse(text); setUsed(true); }}
        disabled={!report || !(report.text || report.summary)}
        className="mt-3 rounded-xl bg-(--agent-hector) px-4 py-2 text-[10px] font-black uppercase tracking-widest text-(--surface-0) hover:opacity-90 transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
      >
        Use in a request
      </button>
      {used && <p className="mt-2 text-[11px] text-(--text-2)">In Chat: add what you want done, then send.</p>}
    </Zone>
  );
}
