import React, { useState } from 'react';
import { getDeadLetterCount, getOldestDeadLetterTimestamp, retryDeadLetter } from '../services/orchestrationQueueService';

interface Receipt {
  agent?: string;
  agentId?: string;
  status?: string;
  durationMs?: number;
  latency?: number;
  timestampMs?: number;
}

interface AgentStats {
  success: number;
  error: number;
  latencies: number[];
}

interface AgentPerformanceViewProps {
  receipts?: Receipt[];
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AgentPerformanceView({ receipts = [] }: AgentPerformanceViewProps) {
  const [retryMsg, setRetryMsg] = useState<string | null>(null);
  const dlqCount = getDeadLetterCount();
  const oldestDlq = getOldestDeadLetterTimestamp();

  const stats: Record<string, AgentStats> = {};
  receipts.forEach((r) => {
    const name = r.agent ?? r.agentId ?? 'unknown';
    if (!stats[name]) stats[name] = { success: 0, error: 0, latencies: [] };
    if (r.status === 'success' || r.status === 'completed') stats[name].success++;
    else stats[name].error++;
    const ms = r.durationMs ?? r.latency;
    if (ms !== undefined) stats[name].latencies.push(ms);
  });

  function handleExportCSV() {
    const rows = ['agent,timestamp,status,latencyMs'];
    receipts.forEach((r) => {
      const agent = r.agent ?? r.agentId ?? 'unknown';
      const ts = r.timestampMs ? new Date(r.timestampMs).toISOString() : '';
      const status = r.status ?? '';
      const ms = r.durationMs ?? r.latency ?? '';
      rows.push(`${agent},${ts},${status},${ms}`);
    });
    downloadBlob(rows.join('\n'), 'agent-performance.csv', 'text/csv');
  }

  function handleExportJSON() {
    downloadBlob(JSON.stringify(receipts, null, 2), 'agent-performance.json', 'application/json');
  }

  function handleRetryAll() {
    const count = retryDeadLetter();
    setRetryMsg(`Requeued ${count} packet${count !== 1 ? 's' : ''}`);
    window.dispatchEvent(new CustomEvent('alphonso:toast', {
      detail: { type: 'info', message: `Dead-letter retry: ${count} packet(s) requeued` }
    }));
    setTimeout(() => setRetryMsg(null), 3000);
  }

  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Agent Performance</div>
        {receipts.length > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExportCSV}
              className="px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-700/50 hover:bg-zinc-600/60 text-zinc-300 border border-white/5 transition-colors"
            >
              Export CSV
            </button>
            <button
              onClick={handleExportJSON}
              className="px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-700/50 hover:bg-zinc-600/60 text-zinc-300 border border-white/5 transition-colors"
            >
              Export JSON
            </button>
          </div>
        )}
      </div>

      {!receipts.length ? (
        <div className="text-zinc-500 text-sm">No performance data yet.</div>
      ) : (
        <div className="space-y-2">
          {Object.entries(stats).map(([name, s]) => {
            const avg = s.latencies.length
              ? Math.round(s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length)
              : null;
            return (
              <div key={name} className="flex items-center gap-3 rounded-lg border border-white/5 bg-zinc-800/40 px-3 py-2">
                <span className="text-xs font-semibold text-zinc-200 w-20 shrink-0">{name}</span>
                <span className="text-[11px] text-emerald-400">{s.success} ok</span>
                <span className="text-[11px] text-red-400">{s.error} err</span>
                {avg !== null && <span className="text-[11px] text-zinc-500">{avg}ms avg</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* Dead Letter Queue */}
      <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400 mb-2">Dead Letter Queue</div>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-semibold text-zinc-200">{dlqCount}</span>
            <span className="text-[11px] text-zinc-500 ml-1">packet{dlqCount !== 1 ? 's' : ''}</span>
            {oldestDlq && (
              <div className="text-[10px] text-zinc-500 mt-0.5">Oldest: {new Date(oldestDlq).toLocaleString()}</div>
            )}
          </div>
          <button
            onClick={handleRetryAll}
            disabled={dlqCount === 0}
            className="px-3 py-1 rounded text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-amber-300 border border-amber-500/30 transition-colors"
          >
            Retry All
          </button>
        </div>
        {retryMsg && <div className="text-[11px] text-emerald-400 mt-1">{retryMsg}</div>}
      </div>
    </div>
  );
}
