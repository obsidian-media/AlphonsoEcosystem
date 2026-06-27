import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Clipboard, Database, Download, FileText, RefreshCw, ShieldAlert, Upload, Wifi, WifiOff } from 'lucide-react';
import {
  getNotionSyncStatus,
  isNotionConnectorReady,
  isNotionPullEnabled,
  listNotionSyncRecords,
  notionSyncWeeklyReport,
  pullNotionDatabase,
  pushAlphonsoTaskToNotion,
  NOTION_CONFLICT_STATES,
  NOTION_APPROVAL_STATES
} from '../services/notionSyncService';

const SAMPLE_TASK = {
  title: 'Alphonso Stage One — slice 4 verification',
  phase: 'Active',
  riskLevel: 'medium',
  assignedAgent: 'alphonso',
  portfolio: 'Alphonso Development',
  task_id: 'stage-one-slice-4',
  project_id: 'alphonso-ecosystem',
  workflow_id: 'stage-one-2026-06'
};

function formatRelative(ts: number) {
  if (!ts || typeof ts !== 'number') return 'never';
  const diff = Date.now() - ts;
  if (diff < 0) return 'in the future';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function statusColor(state: string) {
  if (!state) return 'zinc';
  if (state === NOTION_CONFLICT_STATES.CLEAN) return 'green';
  if (state === NOTION_CONFLICT_STATES.PENDING_REVIEW) return 'amber';
  if (state === NOTION_CONFLICT_STATES.REJECTED) return 'red';
  if (state === NOTION_APPROVAL_STATES.PENDING) return 'amber';
  if (state === NOTION_APPROVAL_STATES.APPROVED) return 'green';
  if (state === NOTION_APPROVAL_STATES.REJECTED) return 'red';
  return 'blue';
}

interface BadgeProps {
  children: React.ReactNode;
  color?: string;
}

function Badge({ children, color = 'zinc' }: BadgeProps) {
  const colors: Record<string, string> = {
    zinc: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
    green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
  };
  return (
    <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold rounded border ${colors[color] || colors.zinc}`}>
      {children}
    </span>
  );
}

interface MiniButtonProps {
  onClick?: () => void;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  kind?: string;
}

function MiniButton({ onClick, label, icon: Icon, disabled = false, kind = 'default' }: MiniButtonProps) {
  const base = 'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] uppercase tracking-widest font-bold disabled:opacity-40 disabled:cursor-not-allowed';
  const styles = kind === 'primary'
    ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200';
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
      {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
      {label}
    </button>
  );
}

interface SyncRecord {
  id?: string;
  correlation?: Record<string, string>;
  sync?: {
    source?: string;
    last_synced_at?: number;
    last_actor?: string;
    conflict_status?: string;
    approval_status?: string;
  };
  timestampMs?: number;
}

interface SyncStatus {
  total?: number;
}

interface WeeklyReport {
  counts: {
    bySource: Record<string, number>;
    conflicts: number;
    pendingApprovals: number;
    blocked: number;
  };
  markdown: string;
  windowStartMs: number;
  windowEndMs: number;
}

export function NotionSyncPanel() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [records, setRecords] = useState<SyncRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ kind: string; result: unknown } | null>(null);
  const [showReport, setShowReport] = useState<boolean>(false);
  const [copiedAt, setCopiedAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLastError(null);
    try {
      const [s, recs] = await Promise.all([
        getNotionSyncStatus(),
        listNotionSyncRecords({ limit: 250 })
      ]);
      setStatus(s as any);
      setRecords(Array.isArray(recs) ? recs : []);
    } catch (err) {
      setLastError((err as Error)?.message || 'Failed to load Notion sync status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const connectorReady = useMemo(() => isNotionConnectorReady(), [status]);
  const pullEnabled = useMemo(() => isNotionPullEnabled(), []);

  const report = useMemo(
    () => notionSyncWeeklyReport({ records, generatedAtMs: Date.now() }) as unknown as WeeklyReport,
    [records]
  );

  const handlePull = useCallback(async () => {
    setBusyAction('pull');
    setLastError(null);
    setLastResult(null);
    try {
      const databaseId = typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_NOTION_DATABASE_ID
        ? (import.meta as unknown as { env: Record<string, string> }).env.VITE_NOTION_DATABASE_ID
        : null;
      const result = await pullNotionDatabase({ databaseId, pageSize: 25 } as any);
      setLastResult({ kind: 'pull', result });
      await refresh();
    } catch (err) {
      setLastError((err as Error)?.message || 'Pull failed');
    } finally {
      setBusyAction(null);
    }
  }, [refresh]);

  const handlePush = useCallback(async () => {
    setBusyAction('push');
    setLastError(null);
    setLastResult(null);
    try {
      const result = await pushAlphonsoTaskToNotion(SAMPLE_TASK as any);
      setLastResult({ kind: 'push', result });
      await refresh();
    } catch (err) {
      setLastError((err as Error)?.message || 'Push failed');
    } finally {
      setBusyAction(null);
    }
  }, [refresh]);

  const handleCopyReport = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(report.markdown);
        setCopiedAt(Date.now());
        setTimeout(() => setCopiedAt(null), 3000);
      }
    } catch (err) {
      setLastError((err as Error)?.message || 'Copy failed');
    }
  }, [report.markdown]);

  const recent = records.slice(0, 10);
  const wired = connectorReady?.ok || pullEnabled?.enabled;
  const lastSyncedAt = records.reduce((acc, r) => Math.max(acc, Number(r?.sync?.last_synced_at || 0)), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] text-zinc-400">
          {wired ? <Wifi className="w-3.5 h-3.5 text-emerald-400" /> : <WifiOff className="w-3.5 h-3.5 text-zinc-500" />}
          <span>
            {wired ? 'Notion co-source ready' : 'Notion not wired'}
            {wired && pullEnabled?.reason ? <span className="text-zinc-500"> — {pullEnabled.reason}</span> : null}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <MiniButton onClick={refresh} label={loading ? 'Loading…' : 'Refresh'} icon={RefreshCw} disabled={loading} />
          <MiniButton onClick={handlePull} label="Pull" icon={Download} disabled={!wired || busyAction !== null} />
          <MiniButton onClick={handlePush} label="Push sample" icon={Upload} disabled={!wired || busyAction !== null} />
          <MiniButton onClick={handleCopyReport} label={copiedAt ? 'Copied' : 'Copy report'} icon={Clipboard} disabled={records.length === 0} kind="primary" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-zinc-900/60 border border-white/10 px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Total records</div>
          <div className="text-sm text-zinc-200 font-bold mt-0.5">{status?.total ?? records.length}</div>
        </div>
        <div className="rounded-lg bg-zinc-900/60 border border-white/10 px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Last sync</div>
          <div className="text-sm text-zinc-200 font-bold mt-0.5">{formatRelative(lastSyncedAt)}</div>
        </div>
        <div className="rounded-lg bg-zinc-900/60 border border-white/10 px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">By source</div>
          <div className="text-[11px] text-zinc-300 mt-1 flex flex-wrap gap-1">
            {Object.keys(report.counts.bySource).length === 0
              ? <span className="text-zinc-500">—</span>
              : Object.entries(report.counts.bySource).map(([src, n]) => (
                  <Badge key={src} color="blue">{src.replace(/_/g, ' ')}: {n}</Badge>
                ))}
          </div>
        </div>
        <div className="rounded-lg bg-zinc-900/60 border border-white/10 px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Conflicts / pending</div>
          <div className="text-[11px] text-zinc-300 mt-1 flex flex-wrap gap-1">
            <Badge color={report.counts.conflicts > 0 ? 'amber' : 'zinc'}>conflicts: {report.counts.conflicts}</Badge>
            <Badge color={report.counts.pendingApprovals > 0 ? 'amber' : 'zinc'}>approvals: {report.counts.pendingApprovals}</Badge>
            <Badge color={report.counts.blocked > 0 ? 'red' : 'zinc'}>blocked: {report.counts.blocked}</Badge>
          </div>
        </div>
      </div>

      {lastError ? (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-2.5 py-2 text-[11px] text-red-300">
          <ShieldAlert className="w-3.5 h-3.5" /> {lastError}
        </div>
      ) : null}

      {lastResult ? (
        <div className="rounded-lg bg-zinc-900/60 border border-white/10 px-2.5 py-2 text-[11px] text-zinc-300">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">
            {lastResult.kind} result
          </div>
          <pre className="text-[10px] whitespace-pre-wrap break-words text-zinc-300">
            {JSON.stringify(lastResult.result, null, 2)}
          </pre>
        </div>
      ) : null}

      <div>
        <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Recent records (max 10)</div>
        {recent.length === 0 ? (
          <div className="text-[11px] text-zinc-500 rounded-lg border border-dashed border-white/10 px-2.5 py-3">
            No sync records yet. Use Refresh to re-scan, or wire Notion to begin.
          </div>
        ) : (
          <ul className="space-y-1">
            {recent.map((r) => {
              const corr = r.correlation || {};
              const id = r.id || corr.task_id || corr.project_id || 'record';
              return (
                <li key={r.id || id} className="rounded-lg bg-zinc-900/60 border border-white/10 px-2.5 py-1.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] text-zinc-200 truncate">
                      {corr.task_id || corr.project_id || '—'}
                      {corr.workflow_id ? <span className="text-zinc-500"> · {corr.workflow_id}</span> : null}
                    </div>
                    <div className="text-[10px] text-zinc-500 truncate">
                      {r.sync?.source || 'unknown'} · {formatRelative(Number(r.sync?.last_synced_at || r.timestampMs || 0))} · {r.sync?.last_actor || '—'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge color={statusColor(r.sync?.conflict_status || '')}>{r.sync?.conflict_status || 'unknown'}</Badge>
                    <Badge color={statusColor(r.sync?.approval_status || '')}>{r.sync?.approval_status || 'n/a'}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowReport((v) => !v)}
          className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-indigo-300 hover:text-indigo-200"
        >
          <FileText className="w-3.5 h-3.5" />
          {showReport ? 'Hide weekly report' : 'Show weekly report'}
          <Database className="w-3 h-3 text-zinc-600 ml-1" />
          <span className="text-zinc-500">window {Math.round((report.windowEndMs - report.windowStartMs) / (24 * 60 * 60 * 1000))}d</span>
        </button>
        {showReport ? (
          <pre className="mt-2 text-[10px] whitespace-pre-wrap break-words rounded-lg bg-zinc-900/70 border border-white/10 px-2.5 py-2 text-zinc-300 max-h-72 overflow-auto">
            {report.markdown}
          </pre>
        ) : null}
      </div>
    </div>
  );
}

export default NotionSyncPanel;
