import React from 'react';

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
      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{title}</div>
      <div className="mt-2 space-y-1">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-zinc-900/45 px-3 py-2 text-[11px] text-zinc-500">{empty}</div>
        ) : rows.map((row) => (
          <div key={row} className="rounded-lg border border-white/10 bg-zinc-900/45 px-3 py-2 text-[11px] text-zinc-300">{row}</div>
        ))}
      </div>
    </div>
  );
}

export function ResearchReportPanel({ report }: Props): React.JSX.Element {
  return (
    <section className="rounded-2xl border border-teal-300/15 bg-zinc-950/72 p-4">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-teal-200/75">Research Report</div>
      {!report ? (
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4 text-sm text-zinc-500">
          No Hector report selected.
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="text-sm font-semibold text-teal-50">{report.researchQuestion}</div>
            <div className="mt-1 text-[11px] text-zinc-500">Checked: {report.dateChecked ?? 'not checked'} | confidence: {report.confidenceLevel}</div>
          </div>
          <div className="rounded-xl border border-amber-300/15 bg-amber-500/10 p-3 text-[11px] text-amber-100/80">
            {report.status === 'source_discovery_failed'
              ? 'Live source discovery failed. Check connectivity and retry.'
              : `${report.status}. Sources and citations are generated from real live discovery/fetch runs.`}
          </div>
          {Array.isArray(report.sourceProofs) && report.sourceProofs.length > 0 && (
            <ReportList
              title="Source Proofs"
              rows={report.sourceProofs.map((proof) => `${proof.ok ? 'Verified' : 'Failed'} ${proof.url} ${proof.httpStatus ? `(HTTP ${proof.httpStatus})` : ''}${proof.error ? ` - ${proof.error}` : ''}`)}
              empty="No source proofs yet."
            />
          )}
          <ReportList title="Verified Facts" rows={report.verifiedFacts} empty="No verified facts yet." />
          <ReportList title="Inferred Points" rows={report.inferredPoints} empty="No inferred points yet." />
          <ReportList title="Jose Approval Needed" rows={report.joseApprovalNeeded} empty="No approval blockers listed." />
          <div className="rounded-xl border border-white/10 bg-zinc-900/55 p-3 text-[11px] text-zinc-300">
            Recommended next step: {report.recommendedNextStep ?? 'Not available.'}
          </div>
        </div>
      )}
    </section>
  );
}
