import React from 'react';
import { listPendingApprovals } from '../../services/approval/approvalService';

export function ApprovalCenterPanel(): React.JSX.Element {
  const pending = listPendingApprovals();
  return (
    <div className="rounded-xl bg-[var(--surface-1)] p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-3)] font-bold mb-2">Approval Center</div>
      {pending.length === 0 ? (
        <div className="text-sm text-[var(--text-3)]">No pending requests in Project Execution Mode.</div>
      ) : (
        <div className="space-y-2">
          {pending.map((item: { id: string; actionType: string; riskLevel: string }) => (
            <div key={item.id} className="rounded-lg bg-[var(--warning-dim)] p-2 text-xs text-[var(--warning)]">
              {item.actionType} ({item.riskLevel})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
