import React, { useEffect, useMemo, useState } from 'react';
import { Filter, RefreshCw, ShieldCheck } from 'lucide-react';
import { readDurableAuditLog } from '../services/verificationService';

function displayReceiptTruthState(status: string) {
  const clean = String(status || 'unknown').trim().toLowerCase();
  if (clean === 'ready' || clean === 'verified' || clean === 'executed') {
    return 'partial';
  }
  if (['confirmed', 'partial', 'setup_required', 'blocked', 'failed', 'recorded', 'unknown'].includes(clean)) {
    return clean === 'recorded' ? 'partial' : clean;
  }
  return 'unknown';
}

interface ReceiptEntry {
  id?: string;
  timestamp_ms?: number;
  event_type?: string;
  entry?: Record<string, unknown>;
  status?: string;
  chain_hash?: string;
}

interface NormalizedReceipt {
  id: string;
  timestampMs: number;
  agent: string;
  action: string;
  status: string;
  proofHash: string;
}

function normalizeReceipt(entry: ReceiptEntry): NormalizedReceipt {
  const payload = (entry?.entry || {}) as Record<string, unknown>;
  const timestampMs = Number(entry?.timestamp_ms || payload?.timestampMs || payload?.timestamp_ms || 0);
  return {
    id: entry?.id || `${timestampMs}-${entry?.event_type || payload?.type || 'receipt'}`,
    timestampMs,
    agent: String(payload?.agent || payload?.sourceAgent || payload?.connectorId || payload?.source || 'system'),
    action: String(entry?.event_type || payload?.eventType || payload?.type || payload?.action || 'receipt'),
    status: String(payload?.status || payload?.verificationState || payload?.trust || entry?.status || 'recorded'),
    proofHash: String(entry?.chain_hash || payload?.chain_hash || payload?.proof_hash || payload?.proofHash || 'n/a')
  };
}

interface SelectorOption {
  value: string;
  label: string;
}

interface SelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectorOption[];
}

function Selector({ label, value, onChange, options }: SelectorProps) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-3)]">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-[11px] text-[var(--text-2)]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TrustReceiptBrowser() {
  const [rows, setRows] = useState<NormalizedReceipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agentFilter, setAgentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadReceipts = async () => {
    setLoading(true);
    setError('');
    try {
      const entries = await readDurableAuditLog(250);
      setRows(Array.isArray(entries) ? entries.map(normalizeReceipt) : []);
    } catch (nextError) {
      setError(String(nextError));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReceipts();
  }, []);

  const agentOptions = useMemo(() => {
    const values = Array.from(new Set(rows.map((row) => row.agent).filter(Boolean))).sort();
    return [
      { value: 'all', label: 'All agents' },
      ...values.map((value) => ({ value, label: value }))
    ];
  }, [rows]);

  const statusOptions = useMemo(() => {
    const values = Array.from(new Set(rows.map((row) => row.status).filter(Boolean))).sort();
    return [
      { value: 'all', label: 'All statuses' },
      ...values.map((value) => ({ value, label: value }))
    ];
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (agentFilter !== 'all' && row.agent !== agentFilter) return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      return true;
    });
  }, [rows, agentFilter, statusFilter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Selector label="Agent" value={agentFilter} onChange={setAgentFilter} options={agentOptions} />
        <Selector label="Status" value={statusFilter} onChange={setStatusFilter} options={statusOptions} />
        <button
          onClick={loadReceipts}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-[var(--text-2)] hover:bg-[var(--surface-2)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      <div className="rounded-lg bg-[var(--surface-1)] px-3 py-2 text-[11px] text-[var(--text-3)]">
        <div className="flex items-center gap-2 text-[var(--text-2)]">
          <ShieldCheck className="h-3.5 w-3.5 text-[var(--success)]" />
          {loading ? 'Loading durable audit receipts...' : `${filteredRows.length} receipt${filteredRows.length === 1 ? '' : 's'} shown (reload re-reads persisted audit log)`}
        </div>
        {error && <div className="mt-1 text-[var(--error)]">{error}</div>}
      </div>

      <div className="overflow-x-auto rounded-xl bg-[var(--surface-2)]">
        <table className="min-w-full divide-y divide-[var(--border)] text-left text-[11px]">
          <thead className="bg-[var(--surface-1)] text-[var(--text-3)] uppercase tracking-widest">
            <tr>
              <th className="px-3 py-2 font-semibold">Timestamp</th>
              <th className="px-3 py-2 font-semibold">Agent</th>
              <th className="px-3 py-2 font-semibold">Action</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Proof Hash</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {!loading && filteredRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-[var(--text-3)]">
                  No receipts match the current filters.
                </td>
              </tr>
            )}
            {filteredRows.map((row) => (
              <tr key={row.id} className="align-top text-[var(--text-2)]">
                <td className="px-3 py-2 whitespace-nowrap text-[var(--text-3)]">
                  {row.timestampMs ? new Date(row.timestampMs).toLocaleString() : 'unknown'}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{row.agent}</td>
                <td className="px-3 py-2">{row.action}</td>
                <td className="px-3 py-2 whitespace-nowrap text-[var(--text-2)]">{displayReceiptTruthState(row.status)}</td>
                <td className="px-3 py-2 font-mono text-[var(--text-3)]">
                  <span className="block max-w-[18rem] truncate" title={row.proofHash}>
                    {row.proofHash}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
