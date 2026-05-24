import React from 'react';

export function MarcusAuditPanel({ auditReport }) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold mb-2">Marcus Audit Panel</div>
      {!auditReport && <div className="text-sm text-zinc-500">Audit report appears after execution packet generation.</div>}
      {auditReport && (
        <div className="space-y-2 text-xs">
          <div className="text-zinc-200 font-semibold">{auditReport.title}</div>
          <div className="text-zinc-400">{auditReport.summary}</div>
          <div className="text-zinc-500">risk: {auditReport.riskLevel} | status: {auditReport.status}</div>
        </div>
      )}
    </div>
  );
}

