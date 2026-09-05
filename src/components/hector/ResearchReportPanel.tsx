import React, { useState } from 'react';
import { openExternalUrl } from '../../services/browserAutomationService';
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
  const [depth, setDepth] = useState<DepthView>('structured');
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [localSynthesis, setLocalSynthesis] = useState<Synthesis | undefined>(report?.synthesis);

  const synthesis = localSynthesis ?? report?.synthesis;
  const hasSuccessfulSource = Array.isArray(report?.sourceProofs) && report!.sourceProofs!.some((p) => p.ok);
  const showRetry = hasSuccessfulSource && !synthesis;

  const handleRetry = async () => {
    if (!report?.id) return;
    setRetrying(true);
    try {
      const updated = await resynthesizeHectorReport(report.id);
      if (updated?.synthesis) setLocalSynthesis(updated.synthesis);
    } finally {
      setRetrying(false);
    }
  };

  if (!report) {
    return (
      <section className="rounded-2xl border border-teal-300/15 bg-zinc-950/72 p-4">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-teal-200/75">Research Report</div>
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4 text-sm text-zinc-500">
          No Hector report selected.
        </div>
      </section>
    );
  }

  const sourceProofs = report.sourceProofs ?? [];

  return (
    <section className="rounded-2xl border border-teal-300/15 bg-zinc-950/72 p-4">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-teal-200/75">Research Report</div>
      <div className="space-y-3">
        <div>
          <div className="text-sm font-semibold text-teal-50">{report.researchQuestion}</div>
          <div className="mt-1 text-[11px] text-zinc-500">Checked: {report.dateChecked ?? 'not checked'} | confidence: {report.confidenceLevel}</div>
        </div>

        {synthesis ? (
          <>
            <div className="flex gap-1.5">
              {(['brief', 'medium', 'structured'] as DepthView[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDepth(d)}
                  className={`rounded-lg border px-3 py-1 text-[11px] font-medium capitalize transition-colors ${depth === d ? 'border-teal-400/25 bg-teal-500/10 text-teal-200' : 'border-white/[0.07] text-zinc-500 hover:text-zinc-300'}`}
                >
                  {d === 'brief' ? 'Brief' : d === 'medium' ? 'Medium' : 'Structured'}
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-3 space-y-2">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Overview</div>
                <p className="mt-1 text-[12px] text-zinc-200">{synthesis.overview}</p>
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
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Export:</span>
              <button type="button" onClick={() => exportHectorReportAsMarkdown(report)} className="rounded border border-white/10 bg-zinc-800 px-2.5 py-1 text-[10px] font-semibold text-zinc-300 hover:bg-zinc-700">Markdown</button>
              <button type="button" onClick={() => exportHectorReportAsPdf(report)} className="rounded border border-white/10 bg-zinc-800 px-2.5 py-1 text-[10px] font-semibold text-zinc-300 hover:bg-zinc-700">PDF</button>
              <button type="button" onClick={() => exportHectorReportAsPowerPoint(report)} className="rounded border border-white/10 bg-zinc-800 px-2.5 py-1 text-[10px] font-semibold text-zinc-300 hover:bg-zinc-700">PowerPoint</button>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-amber-300/15 bg-amber-500/10 p-3 text-[11px] text-amber-100/80 space-y-2">
            <div>
              {report.status === 'source_discovery_failed'
                ? 'Live source discovery failed. Check connectivity and retry.'
                : `${report.status}. Sources and citations are generated from real live discovery/fetch runs.`}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => exportHectorReportAsMarkdown(report)} disabled className="rounded border border-white/10 bg-zinc-800 px-2.5 py-1 text-[10px] font-semibold text-zinc-500 opacity-40 cursor-not-allowed">Markdown</button>
              <button type="button" onClick={() => exportHectorReportAsPdf(report)} disabled className="rounded border border-white/10 bg-zinc-800 px-2.5 py-1 text-[10px] font-semibold text-zinc-500 opacity-40 cursor-not-allowed">PDF</button>
              <button type="button" onClick={() => exportHectorReportAsPowerPoint(report)} disabled className="rounded border border-white/10 bg-zinc-800 px-2.5 py-1 text-[10px] font-semibold text-zinc-500 opacity-40 cursor-not-allowed">PowerPoint</button>
            </div>
            {showRetry && (
              <button type="button" onClick={handleRetry} disabled={retrying} className="rounded-lg border border-teal-400/25 bg-teal-500/10 px-3 py-1.5 text-[11px] font-semibold text-teal-200 hover:bg-teal-500/15 disabled:opacity-40">
                {retrying ? 'Re-synthesizing...' : 'Re-synthesize'}
              </button>
            )}
          </div>
        )}

        <div>
          <button type="button" onClick={() => setSourcesOpen((v) => !v)} className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300">
            {sourcesOpen ? '▾' : '▸'} Sources ({sourceProofs.length})
          </button>
          {sourcesOpen && sourceProofs.length > 0 && (
            <div className="mt-2 space-y-1">
              {sourceProofs.map((proof) => (
                <div key={proof.url} className="rounded-lg border border-white/10 bg-zinc-900/45 px-3 py-2 text-[11px] text-zinc-300">
                  <span className={proof.ok ? 'text-emerald-400' : 'text-red-400'}>{proof.ok ? 'Verified' : 'Failed'}</span>{' '}
                  <button
                    type="button"
                    onClick={() => openExternalUrl(proof.url)}
                    className="text-teal-300 underline decoration-teal-700 hover:text-teal-200 hover:decoration-teal-400 transition-colors break-all text-left"
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
        <div className="rounded-xl border border-white/10 bg-zinc-900/55 p-3 text-[11px] text-zinc-300">
          Recommended next step: {report.recommendedNextStep ?? 'Not available.'}
        </div>
      </div>
    </section>
  );
}
