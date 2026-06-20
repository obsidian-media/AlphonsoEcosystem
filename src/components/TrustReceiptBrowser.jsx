import React, { useEffect, useMemo, useState } from 'react';
import { Filter, RefreshCw, ShieldCheck } from 'lucide-react';
import { readDurableAuditLog } from '../services/verificationService';

function displayReceiptTruthState(status) {
  const clean = String(status || 'unknown').trim().toLowerCase();
  if (clean === 'ready' || clean === 'verified' || clean === 'executed') {
    return 'partial';
  }
  if (['confirmed', 'partial', 'setup_required', 'blocked', 'failed', 'recorded', 'unknown'].includes(clean)) {
    return clean === 'recorded' ? 'partial' : clean;
  }
  return 'unknown';
}

function normalizeReceipt(entry) {
  const payload = entry?.entry || {};
  const timestampMs = Number(entry?.timestamp_ms || payload?.timestampMs || payload?.timestamp_ms || 0);
  return {
    id: entry?.id || `${timestampMs}-${entry?.event_type || payload?.type || 'receipt'}`,
    timestampMs,
    agent: payload?.agent || payload?.sourceAgent || payload?.connectorId || payload?.source || 'system',
    action: entry?.event_type || payload?.eventType || payload?.type || payload?.action || 'receipt',
    status: payload?.status || payload?.verificationState || payload?.trust || entry?.status || 'recorded',
    proofHash: entry?.chain_hash || payload?.chain_hash || payload?.proof_hash || payload?.proofHash || 'n/a'
  };
}

function Selector({ label, value, onChange, options }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-white/10 bg-zinc-900/80 px-3 py-2 text-[11px] text-zinc-200"
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
  const [rows, setRows] = useState([]);
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
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-900/80 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-zinc-200 hover:bg-zinc-800"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      <div className="rounded-lg border border-white/10 bg-zinc-950/50 px-3 py-2 text-[11px] text-zinc-400">
        <div className="flex items-center gap-2 text-zinc-300">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
          {loading ? 'Loading durable audit receipts...' : `${filteredRows.length} receipt${filteredRows.length === 1 ? '' : 's'} shown (reload re-reads persisted audit log)`}
        </div>
        {error && <div className="mt-1 text-red-300">{error}</div>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-zinc-900/60">
        <table className="min-w-full divide-y divide-white/10 text-left text-[11px]">
          <thead className="bg-zinc-950/50 text-zinc-400 uppercase tracking-widest">
            <tr>
              <th className="px-3 py-2 font-semibold">Timestamp</th>
              <th className="px-3 py-2 font-semibold">Agent</th>
              <th className="px-3 py-2 font-semibold">Action</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Proof Hash</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {!loading && filteredRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-zinc-500">
                  No receipts match the current filters.
                </td>
              </tr>
            )}
            {filteredRows.map((row) => (
              <tr key={row.id} className="align-top text-zinc-200">
                <td className="px-3 py-2 whitespace-nowrap text-zinc-400">
                  {row.timestampMs ? new Date(row.timestampMs).toLocaleString() : 'unknown'}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{row.agent}</td>
                <td className="px-3 py-2">{row.action}</td>
                <td className="px-3 py-2 whitespace-nowrap text-zinc-300">{displayReceiptTruthState(row.status)}</td>
                <td className="px-3 py-2 font-mono text-zinc-400">
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
