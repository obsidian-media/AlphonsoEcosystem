import { getAgentMetrics, getAgentSuccessRate, getAgentLatency, getAgentApprovalRate, recordAgentExecution } from './agentMetricsService';
import { listGovernanceDecisions } from './orchestrationGovernanceService';
import { timestampMs } from './trustModel';

const PERF_SNAPSHOT_KEY = 'alphonso_agent_performance_snapshots_v1';
const MAX_SNAPSHOTS = 100;

interface PerformanceSummary {
  totalExecutions: number;
  overallSuccessRate: number;
  avgConfidence: number;
  avgDurationMs: number;
  validationPassRate: number;
  approvalCount: number;
  uniqueAgents: number;
  byAgent: Record<string, unknown>;
  trend: unknown[];
}

interface PerformanceSnapshot {
  id: string;
  timestampMs: number;
  summary: PerformanceSummary;
}

interface DashboardMetrics {
  successRate: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  avgDurationMs: number;
  medianDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  latencySamples: number;
  approvalRate: number;
  approvalsGranted: number;
  approvalsRequired: number;
  pendingApprovals: number;
  avgConfidence: number;
  validationPassRate: number;
  avgFilesPerExecution: number;
  topCommands: unknown[];
  errorPatterns: unknown[];
  trend: unknown[];
}

function readSnapshots(): PerformanceSnapshot[] {
  try {
    const raw = localStorage.getItem(PERF_SNAPSHOT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeSnapshots(snapshots: PerformanceSnapshot[]): void {
  localStorage.setItem(PERF_SNAPSHOT_KEY, JSON.stringify(snapshots.slice(-MAX_SNAPSHOTS)));
}

interface AgentDashboardResult {
  ok: boolean;
  error?: string;
  agentName?: string;
  generatedAtMs?: number;
  dashboard?: DashboardMetrics;
}

export function getAgentDashboard(agentName: string): AgentDashboardResult {
  if (!agentName || typeof agentName !== 'string') {
    return { ok: false, error: 'Agent name is required.' };
  }

  const successRate = getAgentSuccessRate(agentName, 30);
  const latency = getAgentLatency(agentName);
  const approvalRate = getAgentApprovalRate(agentName);
  const metrics = getAgentMetrics({ agent: agentName });

  return {
    ok: true,
    agentName,
    generatedAtMs: timestampMs(),
    dashboard: {
      successRate: successRate.ok ? successRate.successRate : 0,
      totalExecutions: successRate.ok ? successRate.total : 0,
      successfulExecutions: successRate.ok ? successRate.successful : 0,
      failedExecutions: successRate.ok ? successRate.failed : 0,
      avgDurationMs: latency.ok ? latency.avgDurationMs : 0,
      medianDurationMs: latency.ok ? latency.medianDurationMs : 0,
      minDurationMs: latency.ok ? latency.minDurationMs : 0,
      maxDurationMs: latency.ok ? latency.maxDurationMs : 0,
      latencySamples: latency.ok ? latency.samples : 0,
      approvalRate: approvalRate.ok ? approvalRate.approvalRate : 0,
      approvalsGranted: approvalRate.ok ? approvalRate.approved : 0,
      approvalsRequired: approvalRate.ok ? approvalRate.approvalRequired : 0,
      pendingApprovals: approvalRate.ok ? approvalRate.pending : 0,
      avgConfidence: metrics.avgConfidence || 0,
      validationPassRate: metrics.validationPassRate || 0,
      avgFilesPerExecution: metrics.avgFilesPerExecution || 0,
      topCommands: metrics.topCommands || [],
      errorPatterns: metrics.errorPatterns || [],
      trend: metrics.trend || []
    }
  };
}

interface AllAgentsDashboardResult {
  ok: boolean;
  generatedAtMs: number;
  agents: Record<string, DashboardMetrics>;
  totalAgents: number;
}

export function getAllAgentsDashboard(): AllAgentsDashboardResult {
  const agents = ['alphonso', 'jose', 'hector', 'miya', 'maria', 'marcus', 'echo', 'sentinel', 'nova'];
  const dashboards: Record<string, DashboardMetrics> = {};
  for (const agent of agents) {
    const result = getAgentDashboard(agent);
    if (result.ok && result.dashboard) {
      dashboards[agent] = result.dashboard;
    }
  }
  return {
    ok: true,
    generatedAtMs: timestampMs(),
    agents: dashboards,
    totalAgents: Object.keys(dashboards).length
  };
}

interface PerformanceSummaryResult {
  ok: boolean;
  generatedAtMs: number;
  summary: PerformanceSummary;
}

export function getPerformanceSummary(): PerformanceSummaryResult {
  const allMetrics = getAgentMetrics();
  const governanceDecisions = listGovernanceDecisions();
  const approvalCount = Array.isArray(governanceDecisions)
    ? governanceDecisions.filter((d) => d.source === 'approval').length
    : 0;

  return {
    ok: true,
    generatedAtMs: timestampMs(),
    summary: {
      totalExecutions: allMetrics.totalExecutions || 0,
      overallSuccessRate: allMetrics.successRate || 0,
      avgConfidence: allMetrics.avgConfidence || 0,
      avgDurationMs: allMetrics.avgDurationMs || 0,
      validationPassRate: allMetrics.validationPassRate || 0,
      approvalCount,
      uniqueAgents: Object.keys(allMetrics.byAgent || {}).length,
      byAgent: (allMetrics.byAgent || {}) as Record<string, unknown>,
      trend: (allMetrics.trend || []).slice(-7)
    }
  };
}

interface SnapshotResult {
  ok: boolean;
  snapshot?: PerformanceSnapshot;
}

export function snapshotAgentPerformance(): SnapshotResult {
  const summary = getPerformanceSummary();
  if (!summary.ok) return { ok: false };

  const snapshot: PerformanceSnapshot = {
    id: `perf-snap-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestampMs: timestampMs(),
    summary: summary.summary
  };

  const snapshots = readSnapshots();
  snapshots.push(snapshot);
  writeSnapshots(snapshots);

  return { ok: true, snapshot };
}

export function listPerformanceSnapshots(limit: number = 20): PerformanceSnapshot[] {
  const snapshots = readSnapshots();
  return snapshots.slice(-limit);
}

interface TrendPoint {
  timestampMs: number;
  date: string;
  overallSuccessRate: number;
  totalExecutions: number;
  avgConfidence: number;
  avgDurationMs: number;
}

interface TrendResult {
  ok: boolean;
  agentName: string;
  days: number;
  snapshots: number;
  trend: TrendPoint[];
}

export function getPerformanceTrend(agentName: string, days: number = 30): TrendResult {
  const snapshots = readSnapshots();
  const since = Date.now() - days * 86_400_000;
  const relevant = snapshots.filter((s) => s.timestampMs >= since);
  const trend: TrendPoint[] = relevant.map((s) => ({
    timestampMs: s.timestampMs,
    date: new Date(s.timestampMs).toISOString().slice(0, 10),
    overallSuccessRate: s.summary?.overallSuccessRate || 0,
    totalExecutions: s.summary?.totalExecutions || 0,
    avgConfidence: s.summary?.avgConfidence || 0,
    avgDurationMs: s.summary?.avgDurationMs || 0
  }));
  return { ok: true, agentName: agentName || 'all', days, snapshots: trend.length, trend };
}

export function recordAgentExecutionWithPerformance(data: Record<string, unknown>): Record<string, unknown> | null {
  const entry = recordAgentExecution(data as { agent: any; command: any; success: any; confidence: any; filesWritten: any; validationPassed: any; iterations: any; durationMs: any; error: any });
  if (entry) {
    const count = readSnapshots().length;
    if (count % 10 === 0) {
      snapshotAgentPerformance();
    }
  }
  return entry;
}
