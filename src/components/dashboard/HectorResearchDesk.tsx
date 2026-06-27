import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, ChevronDown, ChevronRight, Compass, Download } from 'lucide-react';
import { HECTOR_PROFILE } from '../../agents/hector/hectorProfile';
import { HECTOR_ALLOWED_ACTIONS, HECTOR_BLOCKED_ACTIONS } from '../../agents/hector/hectorPermissions';
import { HECTOR_SOURCE_TYPES } from '../../agents/hector/hectorResearchSchema';
import {
  createHectorApprovalPacket,
  createResearchDraft,
  fetchSuppliedSourcesForReport,
  listHectorActivity,
  listHectorReports
} from '../../services/hectorResearchService';
import { SourceBoard } from '../hector/SourceBoard';
import { CitationPanel } from '../hector/CitationPanel';
import { ResearchReportPanel } from '../hector/ResearchReportPanel';
import { HectorActivityLog } from '../hector/HectorActivityLog';
import { HectorApprovalHandoff } from '../hector/HectorApprovalHandoff';

interface HectorState {
  state: string;
  message: string;
  currentSourceUrl: string | null;
  lastRunSummary: string;
}

interface Props {
  onHectorStateChange?: (state: HectorState) => void;
}

interface InfoCellProps {
  label: string;
  value: string;
}

const PAGE_TABS = [
  { id: 'new', label: 'New Research' },
  { id: 'reports', label: 'Reports' },
  { id: 'live', label: 'Live Run' },
] as const;

type TabId = typeof PAGE_TABS[number]['id'];

function InfoCell({ label, value }: InfoCellProps): React.JSX.Element {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-zinc-900/40 p-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">{label}</div>
      <div className="mt-1 text-[12px] text-zinc-300">{value}</div>
    </div>
  );
}

export function HectorResearchDesk({ onHectorStateChange }: Props): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('new');
  const [question, setQuestion] = useState('');
  const [sourceType, setSourceType] = useState('official_docs');
  const [sourceUrls, setSourceUrls] = useState('');
  const [reports, setReports] = useState<ReturnType<typeof listHectorReports>>(() => listHectorReports());
  const [activity, setActivity] = useState(() => listHectorActivity());
  const [selectedId, setSelectedId] = useState<string>(() => listHectorReports()[0]?.id ?? '');
  const [fetchError, setFetchError] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);

  const selectedReport = useMemo(
    () => reports.find((r) => r.id === selectedId) ?? reports[0] ?? null,
    [reports, selectedId]
  );

  const patchReportInState = (reportPatch: { id?: string } & Record<string, unknown>) => {
    if (!reportPatch?.id) return;
    setReports((current) => {
      const hasExisting = current.some((r) => r.id === reportPatch.id);
      if (!hasExisting) return [...current, reportPatch as never];
      return current.map((r) => (r.id === reportPatch.id ? (reportPatch as never) : r));
    });
  };

  const syncHectorCompanion = (report: Record<string, unknown> | null, status = 'idle') => {
    if (!onHectorStateChange) return;
    const state = status === 'running' ? 'researching'
      : status === 'error' ? 'warning'
      : status === 'complete' ? 'task_complete'
      : 'idle';
    const message = status === 'running'
      ? (report?.currentSourceUrl ? `Scanning ${report.currentSourceUrl}` : 'Running live research...')
      : status === 'error' ? String(report?.lastRunSummary ?? report?.summary ?? 'Research run failed.')
      : status === 'complete' ? String(report?.lastRunSummary ?? 'Research run complete.')
      : 'Hector is standing by.';
    onHectorStateChange({ state, message, currentSourceUrl: (report?.currentSourceUrl as string) ?? null, lastRunSummary: String(report?.lastRunSummary ?? report?.summary ?? '') });
  };

  const exportReport = () => {
    if (!selectedReport) return;
    const r = selectedReport as Record<string, unknown>;
    const sources: Record<string, unknown>[] = Array.isArray(r.sources) ? r.sources : [];
    const lines = [
      `# Hector Research Report`, ``,
      `**Question:** ${String(r.researchQuestion ?? 'Untitled')}`,
      `**Status:** ${String(r.status ?? 'unknown')} | **Confidence:** ${String(r.confidenceLevel ?? 'unknown')}`,
      `**Exported:** ${new Date().toISOString()}`, ``,
      `## Summary`, ``,
      String(r.lastRunSummary ?? r.summary ?? '_No summary yet._'), ``,
      `## Sources (${sources.length})`, ``,
      ...sources.map((s, i) => [
        `### ${i + 1}. ${String(s.title ?? s.url ?? 'Untitled')}`,
        s.url ? `**URL:** ${s.url}` : '',
        s.summary ? `\n${s.summary}` : '', ``
      ].filter(Boolean).join('\n')),
    ].filter((l) => l !== undefined).join('\n');
    const blob = new Blob([lines], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hector-report-${String(r.researchQuestion ?? 'report').slice(0, 40).replace(/[^a-z0-9]/gi, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const refresh = () => {
    const nextReports = listHectorReports();
    setReports(nextReports);
    setActivity(listHectorActivity());
    if (!selectedId && nextReports[0]) setSelectedId(nextReports[0].id);
  };

  const createDraft = () => {
    if (!question.trim()) return;
    const report = createResearchDraft({ researchQuestion: question, sourceType, sourceUrls: sourceUrls.split(/\r?\n/), riskLevel: 'medium' });
    setSelectedId(report.id);
    refresh();
    syncHectorCompanion(report as Record<string, unknown>, 'idle');
    setActiveTab('reports');
  };

  const createHandoff = (reportId: string) => {
    createHectorApprovalPacket(reportId);
    refresh();
  };

  const fetchSources = async () => {
    if (!selectedReport?.id || isFetching) return;
    setFetchError('');
    setIsFetching(true);
    syncHectorCompanion(selectedReport as Record<string, unknown>, 'running');
    try {
      const updated = await fetchSuppliedSourcesForReport(selectedReport.id, (liveReport: Record<string, unknown>) => {
        patchReportInState(liveReport);
        syncHectorCompanion(liveReport, 'running');
      });
      if ((updated as { id?: string })?.id) setSelectedId((updated as { id: string }).id);
      patchReportInState(updated as Record<string, unknown>);
      refresh();
      const state = (updated as { runState?: string })?.runState === 'failed' ? 'error' : 'complete';
      syncHectorCompanion(updated as Record<string, unknown>, state);
    } catch (error) {
      setFetchError(String(error));
      syncHectorCompanion(selectedReport as Record<string, unknown>, 'error');
    } finally {
      setIsFetching(false);
    }
  };

  const r = selectedReport as (Record<string, unknown> & { id: string; researchQuestion?: string; status?: string; confidenceLevel?: string; runState?: string; currentSourceUrl?: string; runLog?: { message: string; level?: string; timestampMs?: number }[] }) | null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-6 space-y-5">
        <header className="pb-5 border-b border-white/[0.06]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-400/70">
                <Compass className="h-3.5 w-3.5" />Research
              </div>
              <h1 className="mt-1 text-xl font-bold tracking-tight text-white">Hector Research Desk</h1>
              <p className="mt-1 text-[13px] text-zinc-500">Discover and fetch public sources, attach citations, hand off to Jose.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0 text-[11px] text-zinc-500">
              <span className="rounded-full border border-white/[0.07] px-2.5 py-1">{reports.length} reports</span>
            </div>
          </div>
        </header>

        <div className="flex gap-1">
          {PAGE_TABS.map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${activeTab === tab.id ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>

        {activeTab === 'new' && (
          <div className="space-y-4">
            <div className="card space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-3)] mb-1.5">Research Question</label>
                <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What do you want Hector to research?"
                  className="w-full rounded-xl border border-white/[0.08] bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-[var(--agent-hector)]/40" />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-3)] mb-1.5">Source Type</label>
                <select value={sourceType} onChange={(e) => setSourceType(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.08] bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none">
                  {(HECTOR_SOURCE_TYPES as string[]).map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-3)] mb-1.5">Source URLs <span className="text-zinc-600 normal-case font-normal">(optional, one per line)</span></label>
                <textarea value={sourceUrls} onChange={(e) => setSourceUrls(e.target.value)} rows={3} placeholder="Leave blank for Hector to discover sources, or add specific URLs here."
                  className="w-full rounded-xl border border-white/[0.08] bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-[var(--agent-hector)]/40" />
              </div>
              <button onClick={createDraft} disabled={!question.trim()} className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed">Create Research Draft</button>
            </div>
            <div className="panel-flat">
              <button type="button" onClick={() => setShowPermissions((v) => !v)}
                className="btn-ghost flex w-full items-center justify-between px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em]">
                <span>Hector Permissions</span>
                {showPermissions ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              {showPermissions && (
                <div className="border-t border-white/[0.06] px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400 mb-2">Allowed</div>
                    <div className="space-y-1">{(HECTOR_ALLOWED_ACTIONS as string[]).map((row) => <div key={row} className="text-[11px] text-zinc-400">{row.replace(/_/g, ' ')}</div>)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-red-400 mb-2">Blocked</div>
                    <div className="space-y-1">{(HECTOR_BLOCKED_ACTIONS as string[]).map((row) => <div key={row} className="text-[11px] text-zinc-400">{row.replace(/_/g, ' ')}</div>)}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="space-y-4">
            {reports.length === 0 ? (
              <div className="card py-12 text-center space-y-4">
                <BookOpen className="mx-auto h-8 w-8 text-[var(--agent-hector)]/50" />
                <div>
                  <p className="text-[13px] font-semibold text-[var(--text-2)]">No research reports yet</p>
                  <p className="mt-1 text-[11px] text-[var(--text-3)]">Create a research draft to get started.</p>
                </div>
                <button type="button" onClick={() => setActiveTab('new')} className="btn-primary">Create first draft</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.4fr] gap-4">
                <div className="card">
                  <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-3)]">All Reports</div>
                  <div className="space-y-1.5 max-h-[32rem] overflow-y-auto pr-1">
                    {reports.slice().reverse().map((report) => {
                      const rr = report as Record<string, unknown>;
                      return (
                        <button key={rr.id as string} onClick={() => setSelectedId(rr.id as string)}
                          className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedReport && (selectedReport as { id: string }).id === rr.id ? 'border-[var(--agent-hector)]/30 bg-[var(--agent-hector)]/10' : 'border-white/[0.06] bg-zinc-900/40 hover:bg-zinc-900/60'}`}>
                          <div className="text-[12px] font-medium text-zinc-200 line-clamp-2">{String(rr.researchQuestion ?? '')}</div>
                          <div className="mt-1 text-[11px] text-zinc-600">{String(rr.status ?? '')} · {String(rr.confidenceLevel ?? '')}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <button onClick={fetchSources} disabled={!r?.id || isFetching} className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed">
                      {isFetching ? 'Researching…' : 'Run Live Research'}
                    </button>
                    <button onClick={exportReport} disabled={!r} className="btn-secondary flex items-center gap-1.5 disabled:opacity-40">
                      <Download className="h-3.5 w-3.5" /> Export
                    </button>
                  </div>
                  {fetchError && <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-[11px] text-red-300">{fetchError}</div>}
                  <SourceBoard report={selectedReport as never} />
                  <CitationPanel report={selectedReport as never} />
                  <ResearchReportPanel report={selectedReport as never} />
                  <HectorApprovalHandoff report={selectedReport as never} onCreateHandoff={createHandoff} />
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'live' && (
          <div className="space-y-4">
            {!r ? (
              <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/50 p-10 text-center">
                <p className="text-sm text-zinc-500">Select a report first to view live telemetry.</p>
                <button type="button" onClick={() => setActiveTab('reports')} className="mt-3 text-[11px] font-semibold text-teal-400 hover:text-teal-300">Go to Reports →</button>
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-white/[0.07] bg-zinc-950/60 p-4">
                  <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Selected Report</div>
                  <div className="text-[12px] font-medium text-zinc-200">{r.researchQuestion}</div>
                  <div className="mt-1 grid grid-cols-3 gap-2 mt-3">
                    <InfoCell label="Run State" value={r.runState ?? 'idle'} />
                    <InfoCell label="Status" value={r.status ?? 'draft'} />
                    <InfoCell label="Confidence" value={r.confidenceLevel ?? '—'} />
                  </div>
                  {r.currentSourceUrl && <div className="mt-2 text-[11px] text-zinc-500 font-mono truncate">↳ {r.currentSourceUrl}</div>}
                </div>
                <div className="rounded-2xl border border-white/[0.07] bg-zinc-950/60 p-4">
                  <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Run Log</div>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {!r.runLog?.length ? (
                      <p className="text-[12px] text-zinc-600">No run logs yet. Click "Run Live Research" in the Reports tab to start.</p>
                    ) : r.runLog.slice().reverse().map((entry, i) => (
                      <div key={`${entry.timestampMs ?? 'n'}-${i}`} className="rounded-lg border border-white/[0.06] bg-zinc-900/40 px-3 py-2 text-[11px]">
                        <div className="font-medium text-zinc-200">{entry.message}</div>
                        <div className="mt-0.5 text-zinc-600">{(entry.level ?? 'info').toUpperCase()} · {entry.timestampMs ? new Date(entry.timestampMs).toLocaleTimeString() : '—'}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <HectorActivityLog rows={activity as never} />
              </>
            )}
          </div>
        )}

        </motion.div>
        </AnimatePresence>

        <p className="text-[11px] text-zinc-700 pb-2">
          {(HECTOR_PROFILE as { name: string; allowedSummary?: string }).name}: {(HECTOR_PROFILE as { allowedSummary?: string }).allowedSummary}
        </p>
      </div>
    </div>
  );
}
