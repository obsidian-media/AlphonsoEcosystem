import { invoke } from '@tauri-apps/api/core';
import { TRUST_STATES, timestampMs } from './trustModel';
import { persistScopeRows } from './runtimeLedgerService';

const REPO_AUDIT_KEY = 'alphonso_repo_audits_v1';
export const REPO_AUDIT_SCOPE = 'repo_audits_v1';

function readReports() {
  try {
    const raw = localStorage.getItem(REPO_AUDIT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeReports(reports) {
  const next = reports.slice(0, 20);
  localStorage.setItem(REPO_AUDIT_KEY, JSON.stringify(next));
  persistScopeRows(REPO_AUDIT_SCOPE, next, (row) => ({
    id: row.id,
    data: row,
    status: row.overallStatus || row.trust || 'recorded',
    confidence: row.trust || TRUST_STATES.TEMPORARY,
    verificationState: row.trust || TRUST_STATES.UNVERIFIED,
    timestampMs: Number(row.generatedAtMs || timestampMs())
  }));
}

function normalizeFinding(finding, index) {
  return {
    id: finding.id || `finding-${index + 1}`,
    path: String(finding.path || ''),
    lineNumber: Number(finding.lineNumber || finding.line_number || 0),
    surface: String(finding.surface || 'other'),
    kind: String(finding.kind || 'unknown'),
    priority: String(finding.priority || 'P2').toUpperCase(),
    severity: String(finding.severity || 'Low'),
    message: String(finding.message || '').trim(),
    excerpt: String(finding.excerpt || '').trim()
  };
}

function summarizeFindings(findings) {
  const summary = {
    issueCount: 0,
    todoCount: 0,
    needsSetupCount: 0,
    blockedCount: 0,
    failedCount: 0,
    partialCount: 0
  };

  findings.forEach((finding) => {
    if (['placeholder', 'scaffold', 'demo', 'mock', 'not_wired', 'fake', 'simulated'].includes(finding.kind)) {
      summary.issueCount += 1;
    }
    if (finding.kind === 'todo') {
      summary.todoCount += 1;
    }
    if (finding.kind === 'setup_required') {
      summary.needsSetupCount += 1;
    }
    if (finding.priority === 'P0') {
      summary.blockedCount += 1;
    } else if (finding.priority === 'P1') {
      summary.partialCount += 1;
    }
    if (finding.severity === 'High' && finding.priority === 'P0') {
      summary.failedCount += 1;
    }
  });

  return summary;
}

function normalizeReport(scan, root, options = {}) {
  const findings = Array.isArray(scan?.findings)
    ? scan.findings.map(normalizeFinding)
    : [];
  const sortedFindings = findings.slice().sort((a, b) => {
    const order = { P0: 0, P1: 1, P2: 2 };
    return (order[a.priority] ?? 3) - (order[b.priority] ?? 3) || a.path.localeCompare(b.path) || a.lineNumber - b.lineNumber;
  });
  const summary = summarizeFindings(sortedFindings);
  return {
    id: scan?.generatedAtMs ? `repo-audit-${scan.generatedAtMs}` : `repo-audit-${Date.now()}`,
    root: root || scan?.root || '',
    generatedAtMs: Number(scan?.generatedAtMs || timestampMs()),
    filesScanned: Number(scan?.filesScanned || 0),
    findings: sortedFindings,
    issueCount: Number(scan?.issueCount || summary.issueCount),
    todoCount: Number(scan?.todoCount || summary.todoCount),
    needsSetupCount: Number(scan?.needsSetupCount || summary.needsSetupCount),
    blockedCount: Number(scan?.blockedCount || summary.blockedCount),
    failedCount: Number(scan?.failedCount || summary.failedCount),
    partialCount: Number(scan?.partialCount || summary.partialCount),
    overallStatus: scan?.trust || (summary.blockedCount > 0 ? 'failed' : summary.issueCount > 0 || summary.needsSetupCount > 0 ? 'partial' : 'verified'),
    trust: scan?.trust || TRUST_STATES.UNVERIFIED,
    error: scan?.error || null,
    options,
    blockerFiles: [...new Set(sortedFindings.filter((finding) => finding.priority === 'P0').map((finding) => finding.path))].slice(0, 12),
    needsSetupFiles: [...new Set(sortedFindings.filter((finding) => finding.kind === 'setup_required').map((finding) => finding.path))].slice(0, 12)
  };
}

export function listRepoAudits() {
  return readReports();
}

export function getLastRepoAudit() {
  return readReports()[0] || null;
}

export async function runRepoAudit({ root, maxFiles = 1200, maxFindings = 240, options = {} } = {}) {
  const scan = await invoke('scan_workspace_readiness', {
    root: String(root || ''),
    maxFiles,
    maxFindings
  });
  const report = normalizeReport(scan, root, options);
  const current = readReports().filter((row) => row.id !== report.id);
  writeReports([report, ...current]);
  return report;
}

export function summarizeRepoAudit(report) {
  if (!report) {
    return {
      filesScanned: 0,
      blockerCount: 0,
      partialCount: 0,
      needsSetupCount: 0,
      issueCount: 0,
      todoCount: 0,
      status: 'unknown'
    };
  }

  return {
    filesScanned: Number(report.filesScanned || 0),
    blockerCount: Number(report.blockedCount || 0),
    partialCount: Number(report.partialCount || 0),
    needsSetupCount: Number(report.needsSetupCount || 0),
    issueCount: Number(report.issueCount || 0),
    todoCount: Number(report.todoCount || 0),
    status: report.overallStatus || 'unknown'
  };
}
