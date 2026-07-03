import { getAuditLog } from './agentAuditService';

const STORAGE_KEY = 'alphonso_maria_weekly_v1';
const MAX_REPORTS = 52;
const WEEK_MS = 604_800_000;

interface WeeklyReport {
  period: { start: number; end: number };
  generatedAt: number;
  totalActions: number;
  approvedCount: number;
  rejectedCount: number;
  riskBreakdown: { low: number; medium: number; high: number };
  topAgents: Array<{ agent: string; count: number }>;
  auditEventCount: number;
  recommendations: string[];
  savedAt?: number;
}

interface OrchestrationReceipt {
  timestampMs: number;
  approved: boolean;
  blocked: boolean;
  riskLevel?: string;
  agent?: string;
}

function loadReports(): WeeklyReport[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}

function storeReports(reports: WeeklyReport[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(reports)); } catch { /* localStorage unavailable */ }
}

function loadReceipts(): OrchestrationReceipt[] {
  try {
    return JSON.parse(localStorage.getItem('alphonso_orchestration_receipts_v1') ?? '[]');
  } catch { return []; }
}

export function generateWeeklyReport(): WeeklyReport {
  const now = Date.now();
  const weekStart = now - WEEK_MS;

  const auditLog = getAuditLog().filter((e) => e.timestamp >= weekStart);
  const receipts = loadReceipts().filter((r) => r.timestampMs >= weekStart);

  const totalActions = receipts.length;
  const approvedCount = receipts.filter((r) => r.approved && !r.blocked).length;
  const rejectedCount = receipts.filter((r) => r.blocked).length;

  const riskBreakdown: { low: number; medium: number; high: number } = { low: 0, medium: 0, high: 0 };
  for (const r of receipts) {
    const level = (r.riskLevel ?? 'low') as keyof typeof riskBreakdown;
    if (level in riskBreakdown) riskBreakdown[level]++;
  }

  const agentCounts: Record<string, number> = {};
  for (const r of receipts) {
    const agent = r.agent ?? 'unknown';
    agentCounts[agent] = (agentCounts[agent] ?? 0) + 1;
  }
  const topAgents = Object.entries(agentCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([agent, count]) => ({ agent, count }));

  const recommendations: string[] = [];
  if (totalActions > 0) {
    const rejectionRate = rejectedCount / totalActions;
    if (rejectionRate > 0.2) {
      recommendations.push('Rejection rate is above 20% — review policy thresholds or agent prompts.');
    }
    if (riskBreakdown.high > 5) {
      recommendations.push('High number of high-risk actions detected — consider tightening governance rules.');
    }
    if (totalActions === 0) {
      recommendations.push('No actions recorded this week — verify agents are active.');
    }
  } else {
    recommendations.push('No agent actions recorded this week — verify pipeline is running.');
  }

  return {
    period: { start: weekStart, end: now },
    generatedAt: now,
    totalActions,
    approvedCount,
    rejectedCount,
    riskBreakdown,
    topAgents,
    auditEventCount: auditLog.length,
    recommendations
  };
}

export function saveReport(report: WeeklyReport): void {
  const reports = loadReports();
  reports.push({ ...report, savedAt: Date.now() });
  if (reports.length > MAX_REPORTS) reports.splice(0, reports.length - MAX_REPORTS);
  storeReports(reports);
}

export function getReports(limit = 10): WeeklyReport[] {
  const reports = loadReports();
  return reports.slice().reverse().slice(0, limit);
}

export function getLatestReport(): WeeklyReport | null {
  const reports = loadReports();
  return reports.length > 0 ? reports[reports.length - 1] : null;
}

export function scheduleWeeklyGeneration(callback?: (report: WeeklyReport) => void): () => void {
  const id = setInterval(() => {
    try {
      const report = generateWeeklyReport();
      saveReport(report);
      if (typeof callback === 'function') callback(report);
    } catch { /* report generation error ignored */ }
  }, WEEK_MS);
  return () => clearInterval(id);
}
