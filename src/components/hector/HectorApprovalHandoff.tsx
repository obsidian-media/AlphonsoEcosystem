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
  /** Copies text for Chat; the Desk passes the app's clipboard writer. */
  onCopy: (text: string) => Promise<unknown> | unknown;
}

/**
 * "Use in a request" (agent phase 1, 2026-10-25): copies Hector's cited report so
 * it can be pasted into Chat with a request. Until then "Send Report To Jose"
 * made a review packet that nothing read.
 */
export function HectorApprovalHandoff({ report, onCopy }: Props): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const text = report ? `Using Hector's report on "${report.researchQuestion ?? ''}":\n\n${report.text || report.summary || ''}` : '';
  return (
    <Zone mood="hector">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-(--agent-hector)">Use in a request</div>
      <p className="text-[11px] leading-relaxed text-(--text-3)">
        Copies this report with its sources, to paste into Chat with what you want done with it (a post, a plan, a decision).
      </p>
      <button
        onClick={async () => { if (!report) return; await onCopy(text); setCopied(true); }}
        disabled={!report || !(report.text || report.summary)}
        className="mt-3 rounded-xl bg-(--agent-hector) px-4 py-2 text-[10px] font-black uppercase tracking-widest text-(--surface-0) hover:opacity-90 transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
      >
        {copied ? 'Copied: paste it into Chat' : 'Use in a request'}
      </button>
    </Zone>
  );
}
