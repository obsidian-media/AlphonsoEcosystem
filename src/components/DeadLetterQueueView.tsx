import React, { useState, useEffect, useCallback } from 'react';
import { RotateCcw, CheckCircle, AlertTriangle } from 'lucide-react';
import { EmptyState } from './ui/EmptyState';
import { retryDeadLetter, replayPacketFromDeadLetter } from '../services/orchestrationQueueService';
import { listAgentPackets } from '../services/agentBusService';

function formatTs(ms: number) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString();
}

interface DeadLetterPacket {
  id: string;
  status: string;
  title?: string;
  packetType?: string;
  failureReason?: string;
  payload?: { failureReason?: string };
  updatedAtMs?: number;
  createdAtMs?: number;
  fromAgent: string;
  toAgent: string;
}

interface LastResult {
  ok: boolean;
  msg: string;
}

export function DeadLetterQueueView() {
  const [items, setItems] = useState<DeadLetterPacket[]>([]);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const [retryingAll, setRetryingAll] = useState(false);
  const [lastResult, setLastResult] = useState<LastResult | null>(null);

  const load = useCallback(() => {
    try {
      const all = listAgentPackets();
      const dead = all.filter((p: DeadLetterPacket) => p.status === 'dead_letter').slice().reverse();
      setItems(dead);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleRetry(id: string) {
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
          <AlertTriangle className="w-4 h-4 text-[var(--error)]" />
          <h2 className="text-base font-semibold text-[var(--text-1)]">Dead-letter Queue</h2>
          <span className="text-xs text-[var(--text-3)]">({items.length} item{items.length !== 1 ? 's' : ''})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="px-3 py-1.5 text-xs rounded-lg bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-3)] transition-colors"
          >
            Refresh
          </button>
          {items.length > 0 && (
            <button
              onClick={handleRetryAll}
              disabled={retryingAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[var(--error-dim)] border border-[var(--error-border)] text-[var(--error)] hover:bg-[var(--error-dim)] transition-colors disabled:opacity-50"
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
              ? 'bg-[var(--success-dim)] border-[var(--success-border)] text-[var(--success)]'
              : 'bg-[var(--error-dim)] border-[var(--error-border)] text-[var(--error)]'
          }`}
        >
          {lastResult.ok ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
          {lastResult.msg}
          <button
            onClick={() => setLastResult(null)}
            className="ml-auto text-[var(--text-3)] hover:text-[var(--text-2)] text-[11px]"
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
              className="flex items-start gap-3 rounded-xl bg-[var(--error-dim)] border border-[var(--error-border)] px-4 py-3"
            >
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="text-xs text-[var(--text-2)] truncate font-medium">
                  {item.title || item.packetType || item.id}
                </p>
                <p className="text-[11px] text-[var(--error)] truncate">
                  {item.failureReason || item.payload?.failureReason || 'No failure reason recorded'}
                </p>
                <p className="text-[10px] text-[var(--text-4)]">
                  {formatTs(item.updatedAtMs || item.createdAtMs || 0)} · {item.fromAgent} → {item.toAgent}
                </p>
              </div>
              <button
                onClick={() => handleRetry(item.id)}
                disabled={retryingIds.has(item.id)}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-3)] transition-colors disabled:opacity-50"
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
