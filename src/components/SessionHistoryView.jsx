import React, { useState, useEffect, useCallback } from 'react';
import { Search, ChevronDown, ChevronRight, Clock, CheckCircle, XCircle, Download } from 'lucide-react';

const RECEIPT_KEY = 'alphonso_orchestration_receipts_v1';

function readReceipts() {
  try {
    const raw = localStorage.getItem(RECEIPT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function groupReceiptsByCommand(receipts) {
  const map = new Map();
  for (const r of receipts) {
    const key = r.commandId || r.workflowId || r.id;
    if (!map.has(key)) {
      map.set(key, {
        commandId: key,
        receipts: [],
        agents: new Set(),
        startMs: r.timestampMs,
        endMs: r.timestampMs,
        status: r.status,
        command: r.details?.command || r.details?.userMessage || r.eventType || 'Pipeline run',
      });
    }
    const session = map.get(key);
    session.receipts.push(r);
    session.agents.add(r.agent);
    if (r.timestampMs < session.startMs) session.startMs = r.timestampMs;
    if (r.timestampMs > session.endMs) {
      session.endMs = r.timestampMs;
      session.status = r.status;
    }
  }
  return Array.from(map.values()).map((s) => ({
    ...s,
    agents: Array.from(s.agents),
    durationMs: s.endMs - s.startMs,
  }));
}

function formatTs(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  return d.toLocaleString();
}

function formatDuration(ms) {
  if (!ms || ms < 0) return '< 1s';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

const STATUS_STYLES = {
  completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  reported_to_jose: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  failed: 'bg-red-500/15 text-red-400 border-red-500/20',
  dead_letter: 'bg-red-500/15 text-red-400 border-red-500/20',
  queued: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20',
  executing: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  recorded: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20',
};

function StatusBadge({ status }) {
  const s = String(status || 'recorded').toLowerCase();
  const style = STATUS_STYLES[s] || STATUS_STYLES.recorded;
  const isOk = s === 'completed' || s === 'reported_to_jose';
  const isFail = s === 'failed' || s === 'dead_letter';
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${style}`}>
      {isOk && <CheckCircle className="w-3 h-3" />}
      {isFail && <XCircle className="w-3 h-3" />}
      {s}
    </span>
  );
}

function SessionRow({ session }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-white/[0.05] bg-zinc-900/40 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors text-left"
      >
        <span className="shrink-0 text-zinc-500">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-200 truncate">{session.command}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">{formatTs(session.startMs)}</p>
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <span className="text-[11px] text-zinc-500 hidden sm:block">
            {session.agents.join(', ')}
          </span>
          <span className="text-[11px] text-zinc-500 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDuration(session.durationMs)}
          </span>
          <StatusBadge status={session.status} />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/[0.05] px-4 py-3 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
            Receipt Events ({session.receipts.length})
          </p>
          <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
            {session.receipts.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 text-xs text-zinc-400 rounded-lg bg-zinc-900/60 border border-white/[0.04] px-3 py-1.5"
              >
                <span className="text-zinc-500 shrink-0 w-20 truncate">{r.agent}</span>
                <span className="flex-1 truncate">{r.eventType || r.actionType || 'event'}</span>
                <StatusBadge status={r.status} />
                <span className="text-zinc-600 shrink-0 text-[10px]">{formatTs(r.timestampMs)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SessionHistoryView() {
  const [sessions, setSessions] = useState([]);
  const [query, setQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const load = useCallback(() => {
    const receipts = readReceipts();
    const grouped = groupReceiptsByCommand(receipts);
    grouped.sort((a, b) => b.startMs - a.startMs);
    setSessions(grouped);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = sessions.filter((s) => {
    if (filterStatus !== 'all' && s.status !== filterStatus) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!s.command.toLowerCase().includes(q) && !s.agents.join(' ').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  function exportJson() {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-history-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-zinc-100">Session History</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search sessions…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-zinc-800 border border-white/[0.08] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 w-48"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg bg-zinc-800 border border-white/[0.08] text-zinc-200 focus:outline-none"
          >
            <option value="all">All statuses</option>
            <option value="completed">Completed</option>
            <option value="reported_to_jose">Reported</option>
            <option value="failed">Failed</option>
            <option value="dead_letter">Dead-letter</option>
          </select>
          <button
            onClick={exportJson}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-zinc-800 border border-white/[0.08] text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
          <button
            onClick={load}
            className="px-3 py-1.5 text-xs rounded-lg bg-zinc-800 border border-white/[0.08] text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="text-[11px] text-zinc-500">
        {filtered.length} session{filtered.length !== 1 ? 's' : ''}
        {query || filterStatus !== 'all' ? ' (filtered)' : ''}
      </div>

      {filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
          No session history found.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {filtered.map((s) => (
            <SessionRow key={s.commandId} session={s} />
          ))}
        </div>
      )}
    </div>
  );
}

export default SessionHistoryView;
