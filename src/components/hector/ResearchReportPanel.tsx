import React from 'react';
import { openExternalUrl } from '../../services/browserAutomationService';
import { Zone } from '../ui/Zone';

interface SourceProof {
  ok?: boolean;
  url: string;
  httpStatus?: number;
  error?: string;
}

interface Report {
  researchQuestion?: string;
  dateChecked?: string;
  confidenceLevel?: string;
  status?: string;
  sourceProofs?: SourceProof[];
  verifiedFacts?: string[];
  inferredPoints?: string[];
  joseApprovalNeeded?: string[];
  recommendedNextStep?: string;
}

interface Props {
  report?: Report | null;
}

interface ReportListProps {
  title: string;
  rows?: string[];
  empty: string;
}

function ReportList({ title, rows = [], empty }: ReportListProps): React.JSX.Element {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-3)]">{title}</div>
      <div className="mt-2 space-y-1">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-[var(--surface-1)] px-3 py-2 text-[11px] text-[var(--text-3)]">{empty}</div>
        ) : rows.map((row) => (
          <div key={row} className="rounded-lg border border-white/10 bg-[var(--surface-1)] px-3 py-2 text-[11px] text-[var(--text-2)]">{row}</div>
        ))}
      </div>
    </div>
  );
}

export function ResearchReportPanel({ report }: Props): React.JSX.Element {
  return (
    <Zone mood="hector">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--agent-hector)]">Research Report</div>
      {!report ? (
        <div className="rounded-xl border border-white/10 bg-[var(--surface-1)] p-4 text-sm text-[var(--text-3)]">
          No Hector report selected.
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="text-sm font-semibold text-[var(--text-1)]">{report.researchQuestion}</div>
            <div className="mt-1 text-[11px] text-[var(--text-3)]">Checked: {report.dateChecked ?? 'not checked'} | confidence: {report.confidenceLevel}</div>
          </div>
          <Zone mood="cool" className="text-[11px] text-[var(--text-2)]">
            Per-source findings below — Hector doesn't yet combine these into one written report.
          </Zone>
          <div className="rounded-xl border border-white/10 bg-[var(--warning-dim)] p-3 text-[11px] text-[var(--text-2)]">
            {report.status === 'source_discovery_failed'
              ? 'Live source discovery failed. Check connectivity and retry.'
              : `${report.status}. Sources and citations are generated from real live discovery/fetch runs.`}
          </div>
          {Array.isArray(report.sourceProofs) && report.sourceProofs.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-3)]">Source Proofs</div>
              <div className="mt-2 space-y-1">
                {report.sourceProofs.map((proof) => (
                  <div key={proof.url} className="rounded-lg border border-white/10 bg-[var(--surface-1)] px-3 py-2 text-[11px] text-[var(--text-2)]">
                    <span className={proof.ok ? 'text-[var(--success)]' : 'text-[var(--error)]'}>{proof.ok ? 'Verified' : 'Failed'}</span>{' '}
                    <button
                      type="button"
                      onClick={() => openExternalUrl(proof.url)}
                      className="text-[var(--agent-hector)] underline decoration-[var(--agent-hector)]/40 hover:decoration-[var(--agent-hector)] transition-colors break-all text-left"
                      title={proof.url}
                    >
                      {proof.url}
                    </button>
                    {proof.httpStatus ? ` (HTTP ${proof.httpStatus})` : ''}
                    {proof.error ? ` - ${proof.error}` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}
          <ReportList title="Verified Facts" rows={report.verifiedFacts} empty="No verified facts yet." />
          <ReportList title="Inferred Points" rows={report.inferredPoints} empty="No inferred points yet." />
          <ReportList title="Jose Approval Needed" rows={report.joseApprovalNeeded} empty="No approval blockers listed." />
          <div className="rounded-xl border border-white/10 bg-[var(--surface-1)] p-3 text-[11px] text-[var(--text-2)]">
            Recommended next step: {report.recommendedNextStep ?? 'Not available.'}
          </div>
        </div>
      )}
    </Zone>
  );
}
