import { listApprovalQueue, approvePacket, rejectPacket } from './agentBusService';
import { listPendingApprovals, approveRequest, rejectRequest } from './approval/approvalService.js';
import { getAll as getAllCircuits, isOpen as isCircuitOpen } from './connectorCircuitBreakerService';
import { DEFAULT_CONNECTORS } from './connectors/connectorRegistry.js';

// Coach was deliberately dropped as a source (see Bug Log #5): tracing
// CoachContext.jsx revealed 3 distinct, unreconciled "coach signal" paths
// (local detector state, coachHistoryService's log, and a separate external
// engine-event store) with no durable "resolved" concept anywhere —
// reconciling that is real Coach-subsystem work, not something this
// aggregator should invent a fix for.
export type AttentionSource = 'approval-chat' | 'approval-project' | 'connector';
export type AttentionSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface AttentionItem {
  id: string;
  source: AttentionSource;
  severity: AttentionSeverity;
  title: string;
  detail?: string;
  timestamp: number;
  actionable: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}

const SEVERITY_ORDER: Record<AttentionSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function fromChatApprovals(): AttentionItem[] {
  return listApprovalQueue().map((packet) => ({
    id: `approval-chat-${packet.id}`,
    source: 'approval-chat' as const,
    severity: (packet.riskLevel as AttentionSeverity) || 'medium',
    title: packet.title,
    timestamp: packet.createdAtMs,
    actionable: true,
    onApprove: () => approvePacket(packet.id),
    onReject: () => rejectPacket(packet.id),
  }));
}

function fromProjectApprovals(): AttentionItem[] {
  return listPendingApprovals().map((row: any) => ({
    id: `approval-project-${row.id}`,
    source: 'approval-project' as const,
    severity: (row.riskLevel as AttentionSeverity) || 'medium',
    title: row.summary || row.actionType,
    detail: row.reason,
    timestamp: Date.parse(row.createdAt),
    actionable: true,
    onApprove: () => approveRequest(row.id),
    onReject: () => rejectRequest(row.id),
  }));
}

// Only a connector whose circuit is genuinely open (tripped by real recent
// failures) qualifies — never a merely-unconfigured/disabled connector. See
// 07-phase2-mission-control-spec.md's "Connector normalization fix" section
// for why this is a fixed bug, not a style choice.
function fromConnectors(): AttentionItem[] {
  const circuits = getAllCircuits();
  return Object.entries(circuits)
    .filter(([id]) => isCircuitOpen(id))
    .map(([id, state]) => {
      const connector = DEFAULT_CONNECTORS.find((c: { id: string }) => c.id === id);
      return {
        id: `connector-${id}`,
        source: 'connector' as const,
        severity: 'medium' as const,
        title: connector ? connector.name : id,
        timestamp: state.lastFailure ?? Date.now(),
        actionable: false,
      };
    });
}

async function safeCollect(fn: () => AttentionItem[]): Promise<AttentionItem[]> {
  try {
    return fn();
  } catch {
    return [];
  }
}

export async function getAttentionItems(): Promise<AttentionItem[]> {
  const results = await Promise.allSettled([
    safeCollect(fromChatApprovals),
    safeCollect(fromProjectApprovals),
    safeCollect(fromConnectors),
  ]);

  const items = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));

  return items.sort((a, b) => {
    const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.timestamp - a.timestamp;
  });
}
