import { invoke } from '@tauri-apps/api/core';
import { TRUST_STATES, timestampMs } from './trustModel';
import { persistScopeRows } from './runtimeLedgerService';

const REPO_AUDIT_KEY = 'alphonso_repo_audits_v1';
export const REPO_AUDIT_SCOPE = 'repo_audits_v1';

interface RepoAuditFinding {
  id: string;
  path: string;
  lineNumber: number;
  surface: string;
  kind: string;
  priority: string;
  severity: string;
  message: string;
  excerpt: string;
}

interface RepoAuditReport {
  id: string;
  root: string;
  generatedAtMs: number;
  filesScanned: number;
  findings: RepoAuditFinding[];
  issueCount: number;
  todoCount: number;
  needsSetupCount: number;
  blockedCount: number;
  failedCount: number;
  partialCount: number;
  overallStatus: string;
  trust: string;
  error: string | null;
  options: Record<string, unknown>;
  blockerFiles: string[];
  needsSetupFiles: string[];
}

function readReports(): RepoAuditReport[] {
  try {
    const raw = localStorage.getItem(REPO_AUDIT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as RepoAuditReport[]) : [];
  } catch {
    return [];
  }
}

function writeReports(reports: RepoAuditReport[]): void {
  const next = reports.slice(0, 20);
  localStorage.setItem(REPO_AUDIT_KEY, JSON.stringify(next));
  persistScopeRows(REPO_AUDIT_SCOPE, next, (row: RepoAuditReport) => ({
    id: row.id,
    data: row,
    status: row.overallStatus || row.trust || 'recorded',
    confidence: row.trust || TRUST_STATES.TEMPORARY,
    verificationState: row.trust || TRUST_STATES.UNVERIFIED,
    timestampMs: Number(row.generatedAtMs || timestampMs())
  }));
}

interface RawFinding {
  id?: string;
  path?: string;
  lineNumber?: number;
  line_number?: number;
  surface?: string;
  kind?: string;
  priority?: string;
  severity?: string;
  message?: string;
  excerpt?: string;
}

function normalizeFinding(finding: RawFinding, index: number): RepoAuditFinding {
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

interface FindingsSummary {
  issueCount: number;
  todoCount: number;
  needsSetupCount: number;
  blockedCount: number;
  failedCount: number;
  partialCount: number;
}

function summarizeFindings(findings: RepoAuditFinding[]): FindingsSummary {
  const summary: FindingsSummary = {
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

interface RawScan {
  findings?: RawFinding[];
  generatedAtMs?: number;
  root?: string;
  filesScanned?: number;
  issueCount?: number;
  todoCount?: number;
  needsSetupCount?: number;
  blockedCount?: number;
  failedCount?: number;
  partialCount?: number;
  trust?: string;
  error?: string;
}

function normalizeReport(scan: RawScan | null, root: string, options: Record<string, unknown> = {}): RepoAuditReport {
  const findings = Array.isArray(scan?.findings)
    ? scan!.findings.map(normalizeFinding)
    : [];
  const sortedFindings = findings.slice().sort((a, b) => {
    const order: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
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

export function listRepoAudits(): RepoAuditReport[] {
  return readReports();
}

export function getLastRepoAudit(): RepoAuditReport | null {
  return readReports()[0] || null;
}

interface RunRepoAuditOptions {
  root?: string;
  maxFiles?: number;
  maxFindings?: number;
  options?: Record<string, unknown>;
}

export async function runRepoAudit({ root, maxFiles = 1200, maxFindings = 240, options = {} }: RunRepoAuditOptions = {}): Promise<RepoAuditReport> {
  const scan = await invoke('scan_workspace_readiness', {
    root: String(root || ''),
    maxFiles,
    maxFindings
  }) as RawScan;
  const report = normalizeReport(scan, root || '', options);
  const current = readReports().filter((row) => row.id !== report.id);
  writeReports([report, ...current]);
  return report;
}

interface RepoAuditSummary {
  filesScanned: number;
  blockerCount: number;
  partialCount: number;
  needsSetupCount: number;
  issueCount: number;
  todoCount: number;
  status: string;
}

export function summarizeRepoAudit(report: RepoAuditReport | null): RepoAuditSummary {
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
