import { listPendingApprovals } from '../approval/approvalService';
import { listMemoryItems } from '../memory/ecosystemMemoryService';
import { listTraceEvents } from '../agentWorkshop/traceabilityService';
import { listDiffProposals } from '../agentWorkshop/diffProposalService';
import { listAgentPackets } from '../agentBusService';
import { getOrchestrationQueueSnapshot } from '../orchestrationQueueService';

const BUILD_STATUS_KEY = 'alphonso_last_build_status_v1';

export function setLastBuildStatus(status = {}) {
  localStorage.setItem(BUILD_STATUS_KEY, JSON.stringify({
    status: status.status || 'unknown',
    message: status.message || '',
    updatedAt: new Date().toISOString()
  }));
}

export function getLastBuildStatus() {
  try {
    const raw = localStorage.getItem(BUILD_STATUS_KEY);
    return raw ? JSON.parse(raw) : { status: 'unknown', message: '', updatedAt: null };
  } catch {
    return { status: 'unknown', message: '', updatedAt: null };
  }
}

export function getSystemHealthSummary() {
  const approvals = listPendingApprovals();
  const memory = listMemoryItems();
  const traces = listTraceEvents();
  const packets = listAgentPackets();
  const queue = getOrchestrationQueueSnapshot();
  const proposals = listDiffProposals();
  const failedTasks = traces.filter((row) => row.executionResult === 'failed').length + packets.filter((p) => p.status === 'failed').length;
  const dependencyConflicts = traces.filter((row) => String(row.reason || '').toLowerCase().includes('dependency')).length;
  const verificationFailures = traces.filter((row) => row.verificationState === 'failed').length;
  const activeAgents = new Set(traces.map((row) => row.generatedBy).filter(Boolean)).size;

  return {
    buildStatus: getLastBuildStatus(),
    verificationStatus: verificationFailures ? 'degraded' : 'healthy',
    pendingApprovals: approvals.length,
    failedAgentTasks: failedTasks,
    dependencyConflicts,
    memoryLoad: memory.length,
    orchestrationQueue: queue.queued + queue.executing + queue.pendingApproval + queue.failed + queue.deadLetter,
    agentActivity: activeAgents,
    openProposals: proposals.filter((p) => p.status === 'proposed').length
  };
}
