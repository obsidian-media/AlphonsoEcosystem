import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertTriangle, RotateCcw } from 'lucide-react';
import {
  getOrchestrationQueueSnapshot,
  retryDeadLetter,
} from '../services/orchestrationQueueService';
import type { QueueSnapshot } from '../services/orchestrationQueueService';
import { listAgentPackets } from '../services/agentBusService';

const STATE_STYLES: Record<string, string> = {
  queued: 'bg-[var(--surface-3)] text-[var(--text-3)] border-[var(--border)]',
  executing: 'bg-[var(--info-dim)] text-[var(--info)] border-[var(--info-border)]',
  in_progress: 'bg-[var(--info-dim)] text-[var(--info)] border-[var(--info-border)]',
  pending_approval: 'bg-[var(--warning-dim)] text-[var(--warning)] border-[var(--warning-border)]',
  approval_required: 'bg-[var(--warning-dim)] text-[var(--warning)] border-[var(--warning-border)]',
  failed: 'bg-[var(--error-dim)] text-[var(--error)] border-[var(--error-border)]',
  dead_letter: 'bg-[var(--error-dim)] text-[var(--error)] border-[var(--error-border)]',
  reported_to_jose: 'bg-[var(--success-dim)] text-[var(--success)] border-[var(--success-border)]',
  completed: 'bg-[var(--success-dim)] text-[var(--success)] border-[var(--success-border)]',
};

interface StateBadgeProps {
  state: string;
}

function StateBadge({ state }: StateBadgeProps) {
  const s = String(state || 'queued').toLowerCase();
  const style = STATE_STYLES[s] || STATE_STYLES.queued;
  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${style}`}>
      {s.replace(/_/g, ' ')}
    </span>
  );
}

function formatTs(ms: number | null | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleTimeString();
}

interface AgentPacket {
  id: string;
  title?: string;
  packetType?: string;
  status: string;
  fromAgent: string;
  toAgent: string;
  createdAtMs?: number;
  updatedAtMs?: number;
  failureReason?: string;
}

interface StatItem {
  label: string;
  value: number;
  color: string;
}

export function OrchestratorQueueView() {
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [packets, setPackets] = useState<AgentPacket[]>([]);
  const [deadLetterPackets, setDeadLetterPackets] = useState<AgentPacket[]>([]);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(() => {
    try {
      const snap = getOrchestrationQueueSnapshot();
      setSnapshot(snap);
      const all = listAgentPackets() as AgentPacket[];
      const active = all.filter((p) => !['dead_letter', 'reported_to_jose', 'completed'].includes(p.status));
      const dead = all.filter((p) => p.status === 'dead_letter');
      setPackets(active.slice().reverse().slice(0, 50));
      setDeadLetterPackets(dead.slice().reverse().slice(0, 50));
      setLastRefresh(Date.now());
    } catch {
      // service may not be available
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  function handleRetryAll() {
    setRetrying(true);
    try {
      retryDeadLetter();
    } catch {
      // ignore
    }
    setTimeout(() => {
      load();
      setRetrying(false);
    }, 500);
  }

  const STAT_ITEMS: StatItem[] = snapshot
    ? [
        { label: 'Queued', value: snapshot.queued, color: 'text-[var(--text-2)]' },
        { label: 'Executing', value: snapshot.executing, color: 'text-[var(--info)]' },
        { label: 'Pending Approval', value: snapshot.pendingApproval, color: 'text-[var(--warning)]' },
        { label: 'Failed', value: snapshot.failed, color: 'text-[var(--error)]' },
        { label: 'Dead-letter', value: snapshot.deadLetter, color: 'text-[var(--error)]' },
        { label: 'Reported', value: snapshot.reportedToJose, color: 'text-[var(--success)]' },
      ]
    : [];

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-1)]">Orchestrator Queue</h2>
          {lastRefresh && (
            <p className="text-[11px] text-[var(--text-3)] mt-0.5">
              Last refresh: {new Date(lastRefresh).toLocaleTimeString()} · auto-refreshes every 5s
            </p>
          )}
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-3)] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {snapshot && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {STAT_ITEMS.map((item) => (
            <div
              key={item.label}
              className="rounded-xl bg-[var(--surface-2)] border border-[var(--border)] p-3 text-center"
            >
              <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
              <p className="text-[10px] text-[var(--text-3)] mt-0.5 leading-tight">{item.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        <section>
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-3)] mb-2">
            Active Packets ({packets.length})
          </h3>
          {packets.length === 0 ? (
            <p className="text-xs text-[var(--text-3)] rounded-xl bg-[var(--surface-2)] border border-[var(--border)] px-4 py-3">
              No active packets in the queue.
            </p>
          ) : (
            <div className="space-y-1.5">
              {packets.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] px-4 py-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--text-2)] truncate">
                      {p.title || p.packetType || p.id}
                    </p>
                    <p className="text-[10px] text-[var(--text-3)] mt-0.5">
                      {p.fromAgent} → {p.toAgent} · {formatTs(p.createdAtMs || p.updatedAtMs)}
                    </p>
                  </div>
                  <StateBadge state={p.status} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-3)] flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-[var(--error)]" />
              Dead-letter ({deadLetterPackets.length})
            </h3>
            {deadLetterPackets.length > 0 && (
              <button
                onClick={handleRetryAll}
                disabled={retrying}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg bg-[var(--error-dim)] border border-[var(--error-border)] text-[var(--error)] hover:bg-[var(--error-dim)] transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-3 h-3" />
                {retrying ? 'Retrying…' : 'Retry All'}
              </button>
            )}
          </div>
          {deadLetterPackets.length === 0 ? (
            <p className="text-xs text-[var(--text-3)] rounded-xl bg-[var(--surface-2)] border border-[var(--border)] px-4 py-3">
              No dead-letter packets — everything is running smoothly.
            </p>
          ) : (
            <div className="space-y-1.5">
              {deadLetterPackets.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-xl bg-[var(--error-dim)] border border-[var(--error-border)] px-4 py-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--text-2)] truncate">
                      {p.title || p.packetType || p.id}
                    </p>
                    <p className="text-[10px] text-[var(--text-3)] mt-0.5">
                      {p.failureReason || 'No reason recorded'} · {formatTs(p.updatedAtMs || p.createdAtMs)}
                    </p>
                  </div>
                  <StateBadge state="dead_letter" />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default OrchestratorQueueView;
