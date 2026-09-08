import React, { useEffect, useRef, useState } from 'react';
import { openExternalUrl } from '../../services/browserAutomationService';
import { Zone } from '../ui/Zone';
import { exportHectorReportAsMarkdown, exportHectorReportAsPdf, exportHectorReportAsPowerPoint } from '../../services/hectorExportService';
import { resynthesizeHectorReport } from '../../services/hectorResearchService';

interface SourceProof {
  ok?: boolean;
  url: string;
  httpStatus?: number;
  error?: string;
}

interface Synthesis {
  overview: string;
  keyFindings: string[];
  disagreements: string[];
  gaps: string[];
}

interface Report {
  id?: string;
  researchQuestion?: string;
  dateChecked?: string;
  confidenceLevel?: string;
  status?: string;
  sourceProofs?: SourceProof[];
  synthesis?: Synthesis;
  summary?: string;
  verifiedFacts?: string[];
  inferredPoints?: string[];
  joseApprovalNeeded?: string[];
  recommendedNextStep?: string;
}

interface Props {
  report?: Report | null;
}

type DepthView = 'brief' | 'medium' | 'structured';

function ReportList({ title, rows = [], empty }: { title: string; rows?: string[]; empty: string }): React.JSX.Element {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-3)]">{title}</div>
      <div className="mt-2 space-y-1">
        {rows.length === 0 ? (
          <div className="rounded-lg bg-[var(--surface-1)] px-3 py-2 text-[11px] text-[var(--text-3)]">{empty}</div>
        ) : rows.map((row) => (
          <div key={row} className="rounded-lg bg-[var(--surface-1)] px-3 py-2 text-[11px] text-[var(--text-2)]">{row}</div>
        ))}
      </div>
    </div>
  );
}

export function ResearchReportPanel({ report }: Props): React.JSX.Element {
  const [depth, setDepth] = useState<DepthView>('structured');
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [localSynthesis, setLocalSynthesis] = useState<Synthesis | undefined>(report?.synthesis);
  // The component stays mounted across report switches (HectorResearchDesk.tsx
  // renders it with no `key`), so localSynthesis must be reset whenever the
  // selected report changes -- otherwise a retried synthesis from the
  // previously selected report leaks into the newly selected one.
  const reportIdRef = useRef(report?.id);
  useEffect(() => {
    if (report?.id !== reportIdRef.current) {
      reportIdRef.current = report?.id;
      setLocalSynthesis(report?.synthesis);
    }
  }, [report?.id, report?.synthesis]);

  const synthesis = localSynthesis ?? report?.synthesis;
  const hasSuccessfulSource = Array.isArray(report?.sourceProofs) && report!.sourceProofs!.some((p) => p.ok);
  const showRetry = hasSuccessfulSource && !synthesis;

  const handleRetry = async () => {
    if (!report?.id) return;
    const retryingReportId = report.id;
    setRetrying(true);
    try {
      const updated = await resynthesizeHectorReport(retryingReportId);
      // Ignore a stale completion if the user switched to a different report
      // while this retry was still in flight.
      if (updated?.synthesis && reportIdRef.current === retryingReportId) {
        setLocalSynthesis(updated.synthesis);
      }
    } finally {
      setRetrying(false);
    }
  };

  if (!report) {
    return (
      <Zone mood="hector">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--agent-hector)]">Research Report</div>
        <div className="rounded-xl bg-[var(--surface-1)] p-4 text-sm text-[var(--text-3)]">
          No Hector report selected.
        </div>
      </Zone>
    );
  }

  const sourceProofs = report.sourceProofs ?? [];

  return (
    <Zone mood="hector">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--agent-hector)]">Research Report</div>
      <div className="space-y-3">
        <div>
          <div className="text-sm font-semibold text-[var(--text-1)]">{report.researchQuestion}</div>
          <div className="mt-1 text-[11px] text-[var(--text-3)]">Checked: {report.dateChecked ?? 'not checked'} | confidence: {report.confidenceLevel}</div>
        </div>

        {synthesis ? (
          <>
            <div className="flex gap-1.5">
              {(['brief', 'medium', 'structured'] as DepthView[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDepth(d)}
                  className={`rounded-lg border px-3 py-1 text-[11px] font-medium capitalize transition-colors ${depth === d ? 'border-[var(--agent-hector)]/25 bg-[var(--agent-hector)]/10 text-[var(--agent-hector)]' : 'border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text-2)]'}`}
                >
                  {d === 'brief' ? 'Brief' : d === 'medium' ? 'Medium' : 'Structured'}
                </button>
              ))}
            </div>

            <div className="rounded-xl bg-[var(--surface-1)] p-3 space-y-2">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-3)]">Overview</div>
                <p className="mt-1 text-[12px] text-[var(--text-2)]">{synthesis.overview}</p>
              </div>
              {depth !== 'brief' && synthesis.keyFindings.length > 0 && (
                <ReportList title="Key Findings" rows={synthesis.keyFindings} empty="No key findings." />
              )}
              {depth === 'structured' && synthesis.disagreements.length > 0 && (
                <ReportList title="Disagreements" rows={synthesis.disagreements} empty="No disagreements noted." />
              )}
              {depth === 'structured' && synthesis.gaps.length > 0 && (
                <ReportList title="Gaps" rows={synthesis.gaps} empty="No gaps noted." />
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-3)]">Export:</span>
              <button type="button" onClick={() => exportHectorReportAsMarkdown(report)} className="rounded-lg bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-semibold text-[var(--text-2)] hover:bg-[var(--surface-3)]">Markdown</button>
              <button type="button" onClick={() => exportHectorReportAsPdf(report)} className="rounded-lg bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-semibold text-[var(--text-2)] hover:bg-[var(--surface-3)]">PDF</button>
              <button type="button" onClick={() => exportHectorReportAsPowerPoint(report)} className="rounded-lg bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-semibold text-[var(--text-2)] hover:bg-[var(--surface-3)]">PowerPoint</button>
            </div>
          </>
        ) : (
          <div className="rounded-xl bg-[var(--warning-dim)] p-3 text-[11px] text-[var(--text-2)] space-y-2">
            <div>
              {report.status === 'source_discovery_failed'
                ? 'Live source discovery failed. Check connectivity and retry.'
                : `${report.status}. Sources and citations are generated from real live discovery/fetch runs.`}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => exportHectorReportAsMarkdown(report)} disabled className="rounded-lg bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-semibold text-[var(--text-3)] opacity-40 cursor-not-allowed">Markdown</button>
              <button type="button" onClick={() => exportHectorReportAsPdf(report)} disabled className="rounded-lg bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-semibold text-[var(--text-3)] opacity-40 cursor-not-allowed">PDF</button>
              <button type="button" onClick={() => exportHectorReportAsPowerPoint(report)} disabled className="rounded-lg bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-semibold text-[var(--text-3)] opacity-40 cursor-not-allowed">PowerPoint</button>
            </div>
            {showRetry && (
              <button type="button" onClick={handleRetry} disabled={retrying} className="rounded-lg bg-[var(--agent-hector)]/10 px-3 py-1.5 text-[11px] font-semibold text-[var(--agent-hector)] hover:opacity-80 disabled:opacity-40">
                {retrying ? 'Re-synthesizing...' : 'Re-synthesize'}
              </button>
            )}
          </div>
        )}

        <div>
          <button type="button" onClick={() => setSourcesOpen((v) => !v)} className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-3)] hover:text-[var(--text-2)]">
            {sourcesOpen ? '▾' : '▸'} Sources ({sourceProofs.length})
          </button>
          {sourcesOpen && sourceProofs.length > 0 && (
            <div className="mt-2 space-y-1">
              {sourceProofs.map((proof) => (
                <div key={proof.url} className="rounded-lg bg-[var(--surface-1)] px-3 py-2 text-[11px] text-[var(--text-2)]">
                  <span className={proof.ok ? 'text-[var(--success)]' : 'text-[var(--error)]'}>{proof.ok ? 'Verified' : 'Failed'}</span>{' '}
                  <button
                    type="button"
                    onClick={() => openExternalUrl(proof.url)}
                    className="text-[var(--agent-hector)] underline decoration-[var(--agent-hector)] hover:decoration-[var(--agent-hector)] transition-colors break-all text-left"
                    title={proof.url}
                  >
                    {proof.url}
                  </button>
                  {proof.httpStatus ? ` (HTTP ${proof.httpStatus})` : ''}
                  {proof.error ? ` - ${proof.error}` : ''}
                </div>
              ))}
            </div>
          )}
        </div>

        <ReportList title="Jose Approval Needed" rows={report.joseApprovalNeeded} empty="No approval blockers listed." />
        <div className="rounded-xl bg-[var(--surface-1)] p-3 text-[11px] text-[var(--text-2)]">
          Recommended next step: {report.recommendedNextStep ?? 'Not available.'}
        </div>
      </div>
    </Zone>
  );
}
