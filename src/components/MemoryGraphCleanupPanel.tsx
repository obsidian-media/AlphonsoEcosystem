import React, { useState } from 'react';
import { Button } from './ui';
import {
  GRAPH_RETENTION,
  isAutoCleanupEnabled,
  previewMemoryGraphCleanup,
  runMemoryGraphCleanup,
  setAutoCleanupEnabled,
  type PruneReport
} from '../services/memoryGraphRetentionService';

function ReportView({ report }: { report: PruneReport }) {
  if (report.aborted) {
    return (
      <p className="text-xs text-[var(--warning)]" role="status">
        Cleanup would be refused: {report.abortReason}. Nothing was removed.
      </p>
    );
  }
  const types = Object.entries(report.removedByType);
  return (
    <div className="text-xs text-[var(--text-2)] space-y-1" role="status">
      <p>
        {report.dryRun ? 'Would remove' : 'Removed'}{' '}
        <strong className="text-[var(--text-1)]">{report.nodesRemoved}</strong> of {report.totalNodes} nodes and{' '}
        <strong className="text-[var(--text-1)]">{report.edgesRemoved}</strong> of {report.totalEdges} links.
      </p>
      {types.length > 0 && (
        <p className="text-[var(--text-3)]">
          {types.map(([t, n]) => `${n} ${t.replace(/_/g, ' ')}`).join(', ')}
        </p>
      )}
      <p className="text-[var(--text-3)]">
        {report.protectedNodes} protected, {report.withinWindowNodes} still inside their retention window.
      </p>
    </div>
  );
}

/**
 * Memory graph retention controls (Phase 4 governance). Preview is a dry run;
 * "Clean up now" is only enabled after a fresh Preview, and the automatic daily
 * pass stays off until the owner turns it on. Only graph rows are ever removed,
 * never the memories they point to.
 */
export function MemoryGraphCleanupPanel() {
  const [report, setReport] = useState<PruneReport | null>(null);
  const [previewed, setPreviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [auto, setAuto] = useState<boolean>(() => isAutoCleanupEnabled());

  const preview = async () => {
    setBusy(true);
    setMessage(null);
    const result = await previewMemoryGraphCleanup();
    setBusy(false);
    if (!result) {
      setMessage('Preview unavailable (the desktop backend is not running).');
      return;
    }
    setReport(result);
    setPreviewed(!result.aborted);
  };

  const cleanUp = async () => {
    setBusy(true);
    setMessage(null);
    const result = await runMemoryGraphCleanup();
    setBusy(false);
    if (!result) {
      setMessage('Cleanup failed.');
      return;
    }
    if ('refused' in result) {
      setPreviewed(false);
      setMessage('Run Preview again first -- the last preview is out of date.');
      return;
    }
    setReport(result);
    setPreviewed(false);
  };

  const toggleAuto = () => {
    const next = !auto;
    if (!setAutoCleanupEnabled(next)) {
      setMessage('Run a Preview once before turning on automatic cleanup.');
      return;
    }
    setMessage(null);
    setAuto(next);
  };

  return (
    <div className="space-y-3" data-testid="memory-graph-cleanup">
      <p className="text-xs text-[var(--text-3)]">
        Keeps the graph from growing forever. Receipts and packets age out after {GRAPH_RETENTION.nodeWindowDays.receipt} days,
        research and boardroom messages after {GRAPH_RETENTION.nodeWindowDays.research_report}, and unconfirmed inferred links after{' '}
        {GRAPH_RETENTION.inferredEdgeDays}. Permanent memories, their direct neighbours, recently viewed nodes and escalated
        boardroom threads are never removed. Your memories themselves are never touched.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={preview} loading={busy}>
          Preview cleanup
        </Button>
        <Button size="sm" variant="danger" onClick={cleanUp} disabled={!previewed || busy}>
          Clean up now
        </Button>
        <label className="flex items-center gap-2 text-xs text-[var(--text-2)] ml-auto">
          <input type="checkbox" checked={auto} onChange={toggleAuto} />
          Automatic daily cleanup
        </label>
      </div>
      {report && <ReportView report={report} />}
      {message && (
        <p className="text-xs text-[var(--warning)]" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
