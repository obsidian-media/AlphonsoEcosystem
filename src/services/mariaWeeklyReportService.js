import { getAuditLog } from './agentAuditService';

const STORAGE_KEY = 'alphonso_maria_weekly_v1';
const MAX_REPORTS = 52;
const WEEK_MS = 604_800_000;

// ── Storage helpers ────────────────────────────────────────────────────────────

function loadReports() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}

function storeReports(reports) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(reports)); } catch {}
}

function loadReceipts() {
  try {
    return JSON.parse(localStorage.getItem('alphonso_orchestration_receipts_v1') ?? '[]');
  } catch { return []; }
}

// ── Report generation ──────────────────────────────────────────────────────────

export function generateWeeklyReport() {
  const now = Date.now();
  const weekStart = now - WEEK_MS;

  // Audit log entries within the past week
  const auditLog = getAuditLog().filter((e) => e.timestamp >= weekStart);
  const receipts = loadReceipts().filter((r) => r.timestampMs >= weekStart);

  const totalActions = receipts.length;
  const approvedCount = receipts.filter((r) => r.approved && !r.blocked).length;
  const rejectedCount = receipts.filter((r) => r.blocked).length;

  // Risk breakdown from receipts
  const riskBreakdown = { low: 0, medium: 0, high: 0 };
  for (const r of receipts) {
    const level = r.riskLevel ?? 'low';
    if (level in riskBreakdown) riskBreakdown[level]++;
  }

  // Top agents by action count
  const agentCounts = {};
  for (const r of receipts) {
    const agent = r.agent ?? 'unknown';
    agentCounts[agent] = (agentCounts[agent] ?? 0) + 1;
  }
  const topAgents = Object.entries(agentCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([agent, count]) => ({ agent, count }));

  // Simple recommendations based on rejection rate and risk distribution
  const recommendations = [];
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

export function saveReport(report) {
  const reports = loadReports();
  reports.push({ ...report, savedAt: Date.now() });
  if (reports.length > MAX_REPORTS) reports.splice(0, reports.length - MAX_REPORTS);
  storeReports(reports);
}

export function getReports(limit = 10) {
  const reports = loadReports();
  return reports.slice().reverse().slice(0, limit);
}

export function getLatestReport() {
  const reports = loadReports();
  return reports.length > 0 ? reports[reports.length - 1] : null;
}

export function scheduleWeeklyGeneration(callback) {
  const id = setInterval(() => {
    try {
      const report = generateWeeklyReport();
      saveReport(report);
      if (typeof callback === 'function') callback(report);
    } catch {}
  }, WEEK_MS);
  return () => clearInterval(id);
}
