import React, { useState, useEffect, useCallback } from 'react';
import { RotateCcw, CheckCircle, AlertTriangle } from 'lucide-react';
import { EmptyState } from './ui/EmptyState';
import { retryDeadLetter, replayPacketFromDeadLetter } from '../services/orchestrationQueueService';
import { listAgentPackets } from '../services/agentBusService';

function formatTs(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString();
}

export function DeadLetterQueueView() {
  const [items, setItems] = useState([]);
  const [retryingIds, setRetryingIds] = useState(new Set());
  const [retryingAll, setRetryingAll] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const load = useCallback(() => {
    try {
      const all = listAgentPackets();
      const dead = all.filter((p) => p.status === 'dead_letter').slice().reverse();
      setItems(dead);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleRetry(id) {
    setRetryingIds((prev) => new Set([...prev, id]));
    try {
      const result = replayPacketFromDeadLetter(id, 'Manual retry from Dead-letter Queue view.');
      setLastResult(result.ok ? { ok: true, msg: `Packet ${id} re-queued.` } : { ok: false, msg: result.reason || 'Retry failed.' });
    } catch (err) {
      setLastResult({ ok: false, msg: String(err) });
    }
    setTimeout(() => {
      load();
      setRetryingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 500);
  }

  function handleRetryAll() {
    setRetryingAll(true);
    try {
      const count = retryDeadLetter();
      setLastResult({ ok: true, msg: `${count} packet(s) re-queued.` });
    } catch (err) {
      setLastResult({ ok: false, msg: String(err) });
    }
    setTimeout(() => {
      load();
      setRetryingAll(false);
    }, 600);
  }

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <h2 className="text-base font-semibold text-zinc-100">Dead-letter Queue</h2>
          <span className="text-xs text-zinc-500">({items.length} item{items.length !== 1 ? 's' : ''})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="px-3 py-1.5 text-xs rounded-lg bg-zinc-800 border border-white/[0.08] text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            Refresh
          </button>
          {items.length > 0 && (
            <button
              onClick={handleRetryAll}
              disabled={retryingAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {retryingAll ? 'Retrying…' : 'Retry All'}
            </button>
          )}
        </div>
      </div>

      {lastResult && (
        <div
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 border text-xs ${
            lastResult.ok
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          {lastResult.ok ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
          {lastResult.msg}
          <button
            onClick={() => setLastResult(null)}
            className="ml-auto text-zinc-500 hover:text-zinc-300 text-[11px]"
          >
            ✕
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={<CheckCircle className="w-full h-full text-[var(--success)]" />}
            title="No failed tasks"
            description="Everything is running smoothly."
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-3 rounded-xl bg-red-950/20 border border-red-500/10 px-4 py-3"
            >
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="text-xs text-zinc-200 truncate font-medium">
                  {item.title || item.packetType || item.id}
                </p>
                <p className="text-[11px] text-red-400/80 truncate">
                  {item.failureReason || item.payload?.failureReason || 'No failure reason recorded'}
                </p>
                <p className="text-[10px] text-zinc-600">
                  {formatTs(item.updatedAtMs || item.createdAtMs)} · {item.fromAgent} → {item.toAgent}
                </p>
              </div>
              <button
                onClick={() => handleRetry(item.id)}
                disabled={retryingIds.has(item.id)}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg bg-zinc-800 border border-white/[0.08] text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-3 h-3" />
                {retryingIds.has(item.id) ? 'Retrying…' : 'Retry'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DeadLetterQueueView;
