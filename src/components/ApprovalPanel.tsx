import React from 'react';
import { useState } from 'react';
import { Shield, ShieldAlert, Check, X } from 'lucide-react';
import { approvePacket, rejectPacket, getPacketById } from '../services/agentBusService';

const RISK_STYLES: Record<string, { badge: string; dot: string; label: string }> = {
  high: { badge: 'border-red-500/40 bg-red-500/10 text-red-300', dot: 'bg-red-400', label: 'High' },
  medium: { badge: 'border-amber-500/40 bg-amber-500/10 text-amber-300', dot: 'bg-amber-400', label: 'Medium' },
  low: { badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', dot: 'bg-emerald-400', label: 'Low' }
};

interface Assignment {
  riskLevel?: string;
  actionType?: string;
  agent?: string;
}

interface Packet {
  payload?: {
    assignment?: Assignment;
  };
}

interface PendingApproval {
  packetId: string;
  agent?: string;
  actionType?: string;
  reason?: string;
  previewContent?: string | null;
}

interface ResolvedItem {
  packetId: string;
  agent: string;
  actionType: string;
  riskLevel: string;
  reason: string;
  previewContent: string | null;
}

function inferRisk(assignment: Assignment) {
  const risk = String(assignment?.riskLevel || '').toLowerCase();
  if (risk === 'high' || risk === 'critical') return 'high';
  if (risk === 'low') return 'low';
  const action = String(assignment?.actionType || '').toLowerCase();
  if (/external_publish|upload|post|delete|destroy/.test(action)) return 'high';
  if (/read|list|check|verify/.test(action)) return 'low';
  return 'medium';
}

function resolveAssignment(item: PendingApproval): ResolvedItem {
  const packet = getPacketById(item.packetId) as Packet | null;
  const assignment = packet?.payload?.assignment || {};
  return {
    packetId: item.packetId,
    agent: item.agent || assignment?.agent || 'unknown',
    actionType: item.actionType || assignment?.actionType || 'unknown',
    riskLevel: inferRisk(assignment),
    reason: item.reason || '',
    previewContent: item.previewContent || null
  };
}

interface Props {
  pendingApprovals?: PendingApproval[];
  commandId?: string;
  onAllResolved?: (commandId: string | undefined, resolved: Record<string, string>) => void;
}

export function ApprovalPanel({ pendingApprovals = [], commandId, onAllResolved }: Props) {
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const items = pendingApprovals.map(resolveAssignment);
  const allResolved = items.length > 0 && items.every((item) => resolved[item.packetId]);

  const handleApprove = (packetId: string) => {
    try {
      approvePacket(packetId, 'chatview-inline');
      setResolved((prev) => ({ ...prev, [packetId]: 'approved' }));
      setError(null);
    } catch (err) {
      setError(`Approve failed: ${String((err as Error)?.message || err)}`);
    }
  };

  const handleReject = (packetId: string) => {
    try {
      rejectPacket(packetId, 'Rejected from chat inline approval');
      setResolved((prev) => ({ ...prev, [packetId]: 'rejected' }));
      setError(null);
    } catch (err) {
      setError(`Reject failed: ${String((err as Error)?.message || err)}`);
    }
  };

  const handleContinue = () => {
    onAllResolved?.(commandId, resolved);
  };

  if (items.length === 0) return null;

  return (
    <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-amber-400" />
        <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
          {items.length} item{items.length !== 1 ? 's' : ''} awaiting approval
        </span>
      </div>

      {error && (
        <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {items.map((item) => {
          const status = resolved[item.packetId];
          const risk = RISK_STYLES[item.riskLevel] || RISK_STYLES.medium;
          const RiskIcon = item.riskLevel === 'high' ? ShieldAlert : Shield;

          return (
            <div
              key={item.packetId}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                status === 'approved'
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : status === 'rejected'
                    ? 'border-red-500/30 bg-red-500/5 opacity-60'
                    : 'border-white/10 bg-zinc-800/40'
              }`}
            >
              <RiskIcon className={`w-3.5 h-3.5 shrink-0 ${item.riskLevel === 'high' ? 'text-red-400' : 'text-amber-400'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-zinc-200 truncate">{item.agent}</span>
                  <span className="text-[10px] text-zinc-500 truncate">{item.actionType}</span>
                </div>
                {item.reason && (
                  <div className="text-[10px] text-zinc-500 truncate mt-0.5">{item.reason}</div>
                )}
                {item.previewContent && (
                  <div className="mt-2 p-2 rounded-lg bg-zinc-900/60 border border-white/[0.06]">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Preview</div>
                    <div className="text-[10px] text-zinc-400 whitespace-pre-wrap leading-relaxed">{item.previewContent}</div>
                  </div>
                )}
              </div>
              <div className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest ${risk.badge}`}>
                <span className={`h-1 w-1 rounded-full ${risk.dot}`} />
                {risk.label}
              </div>
              {status ? (
                <div className={`flex items-center gap-1 text-[10px] font-bold ${status === 'approved' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {status === 'approved' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                  {status === 'approved' ? 'Approved' : 'Denied'}
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleReject(item.packetId)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest text-zinc-400 bg-zinc-800 border border-white/10 hover:bg-zinc-700 transition-colors"
                  >
                    Deny
                  </button>
                  <button
                    onClick={() => handleApprove(item.packetId)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white transition-colors ${
                      item.riskLevel === 'high'
                        ? 'bg-red-700 hover:bg-red-600'
                        : 'bg-amber-600 hover:bg-amber-500'
                    }`}
                  >
                    Approve
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {allResolved && (
        <div className="flex justify-end pt-1">
          <button
            onClick={handleContinue}
            className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-lg"
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
