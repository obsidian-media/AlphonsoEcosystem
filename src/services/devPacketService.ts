import { TRUST_STATES, timestampMs } from './trustModel';
import { persistScopeRows } from './runtimeLedgerService';

const DEV_PACKET_KEY = 'alphonso_dev_packets_v1';
export const DEV_PACKET_SCOPE = 'dev_packets_v1';

export interface DevPacketFinding {
  kind: string;
  path: string;
  lineNumber: number;
  message?: string;
  surface?: string;
  excerpt?: string;
  priority?: string;
}

export interface DevPacketPatchSuggestion {
  file: string;
  lineNumber: number;
  suggestion: string;
  excerpt: string;
}

export interface DevPacket {
  id: string;
  title: string;
  priority: string;
  surface: string;
  riskLevel: string;
  status?: string;
  files: string[];
  currentIssue: string;
  recommendedChange: string;
  patchSuggestions: DevPacketPatchSuggestion[];
  testCommands: string[];
  expectedProof: string;
  needsSetupDependencies: string[];
  rollbackNote: string;
  sourceFindingCount: number;
  sourceAuditId: string | null;
  generatedAtMs: number;
  trust: string;
}

export interface DevPacketGroup {
  key: string;
  priority: string;
  surface: string;
  findings: DevPacketFinding[];
}

export interface DevPacketSummary {
  count: number;
  p0: number;
  p1: number;
  p2: number;
}

export interface AuditReport {
  id?: string;
  findings?: DevPacketFinding[];
}

export interface ReadinessReport {
  releaseState?: { state?: string };
  repoAuditSummary?: { issueCount?: number };
}

function readRows(): DevPacket[] {
  try {
    const raw = localStorage.getItem(DEV_PACKET_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRows(rows: DevPacket[]): void {
  const next = rows.slice(-80);
  localStorage.setItem(DEV_PACKET_KEY, JSON.stringify(next));
  persistScopeRows(DEV_PACKET_SCOPE, next, (row: DevPacket) => ({
    id: row.id,
    data: row,
    status: row.priority || row.status || 'recorded',
    confidence: row.trust || TRUST_STATES.TEMPORARY,
    verificationState: row.trust || TRUST_STATES.UNVERIFIED,
    timestampMs: Number(row.generatedAtMs || timestampMs())
  }));
}

function normalizePriority(priority: string | undefined): string {
  const clean = String(priority || 'P2').trim().toUpperCase();
  if (['P0', 'P1', 'P2'].includes(clean)) return clean;
  return 'P2';
}

function riskLevelFromPriority(priority: string): string {
  if (priority === 'P0') return 'critical';
  if (priority === 'P1') return 'high';
  return 'medium';
}

function leadIssueLine(findings: DevPacketFinding[] = []): string {
  const first = Array.isArray(findings) ? findings[0] : null;
  if (!first) return 'No issue line available.';
  return `${first.kind} in ${first.path}:${first.lineNumber}`;
}

function topFiles(findings: DevPacketFinding[] = [], limit = 5): string[] {
  const files: string[] = [];
  findings.forEach((finding) => {
    if (!files.includes(finding.path)) files.push(finding.path);
  });
  return files.slice(0, limit);
}

function buildTestCommands(priority: string, findings: DevPacketFinding[] = [], readinessReport: ReadinessReport | null = null): string[] {
  const surfaces = new Set<string>((Array.isArray(findings) ? findings : []).map((finding) => String(finding.surface || 'other')));
  const commands: string[] = [];

  if (priority === 'P0') {
    commands.push('npm.cmd run test');
    commands.push('npm.cmd run build');
    commands.push('npx.cmd tauri build');
  } else if (priority === 'P1') {
    commands.push('npm.cmd run test');
    commands.push('npm.cmd run build');
  } else {
    commands.push('npm.cmd run test');
  }

  if (surfaces.has('release')) {
    commands.unshift('npm.cmd run release:updater');
  }

  if (surfaces.has('connector')) {
    commands.push('npm.cmd run test -- src/test/toolConnectionService.test.js');
  }

  if (readinessReport?.releaseState?.state && readinessReport.releaseState.state !== 'ready') {
    commands.push('npm.cmd run release:updater');
  }

  return [...new Set(commands)];
}

function buildExpectedProof(priority: string, readinessReport: ReadinessReport | null = null): string {
  const repoSummary = readinessReport?.repoAuditSummary || {};
  if (priority === 'P0') {
    return 'No placeholder or fake path remains for the targeted surface, and the matching test/build command passes.';
  }
  if (priority === 'P1') {
    return 'The placeholder surface is either implemented or explicitly setup-required, and receipts/state reload correctly.';
  }
  if ((repoSummary as { issueCount?: number }).issueCount !== undefined && (repoSummary as { issueCount: number }).issueCount > 0) {
    return 'The audit count for truth issues should drop after the patch and the remaining surface should be labeled truthfully.';
  }
  return 'The surface is documented, tested, and no longer flagged by the repo audit.';
}

function buildSetupRequirements(findings: DevPacketFinding[] = [], readinessReport: ReadinessReport | null = null): string[] {
  const requirements = new Set<string>();
  findings.forEach((finding) => {
    if (finding.kind === 'setup_required') {
      requirements.add('External setup or local runtime wiring must exist before declaring this ready.');
    }
    if (finding.surface === 'release') {
      requirements.add('Updater signing key, hosted manifest URL, and release artifacts must be present.');
    }
    if (finding.surface === 'connector') {
      requirements.add('Connector credentials, auth profiles, and allowlists must be configured.');
    }
  });
  if (readinessReport?.releaseState?.state !== 'ready') {
    requirements.add('Release readiness remains setup-required until installer, signature, and manifest are proven.');
  }
  return [...requirements];
}

function buildRollbackNote(priority: string): string {
  if (priority === 'P0') return 'Rollback by restoring the previous stable implementation and disabling the new surface behind setup-required state.';
  if (priority === 'P1') return 'Rollback by returning the panel or service to the previous placeholder-safe state and removing the new wiring.';
  return 'Rollback by reverting the packet-specific changes and preserving the durable receipt trail.';
}

function groupFindings(findings: DevPacketFinding[] = []): DevPacketGroup[] {
  const groups = new Map<string, DevPacketFinding[]>();
  (Array.isArray(findings) ? findings : []).forEach((finding) => {
    const key = `${normalizePriority(finding.priority)}::${String(finding.surface || 'other')}`;
    const bucket = groups.get(key) || [];
    bucket.push(finding);
    groups.set(key, bucket);
  });
  return [...groups.entries()].map(([groupKey, groupFindings]) => {
    const [priority, surface] = groupKey.split('::');
    return {
      key: groupKey,
      priority,
      surface,
      findings: groupFindings.sort((a, b) => a.path.localeCompare(b.path) || a.lineNumber - b.lineNumber)
    };
  }).sort((a, b) => {
    const order: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
    return (order[a.priority] ?? 3) - (order[b.priority] ?? 3) || a.surface.localeCompare(b.surface);
  });
}

export function listDevPackets(): DevPacket[] {
  return readRows();
}

export function getLastDevPacket(): DevPacket | null {
  return readRows()[0] || null;
}

export function buildDevPackets({
  auditReport,
  readinessReport = null,
  maxPackets = 8
}: {
  auditReport?: AuditReport;
  readinessReport?: ReadinessReport | null;
  maxPackets?: number;
} = {}): DevPacket[] {
  const findings = Array.isArray(auditReport?.findings) ? auditReport!.findings! : [];
  const groups = groupFindings(findings).slice(0, maxPackets);
  const generatedAtMs = timestampMs();
  return groups.map((group, index) => {
    const priority = normalizePriority(group.priority);
    const files = topFiles(group.findings);
    const packet: DevPacket = {
      id: `dev-packet-${generatedAtMs}-${index + 1}`,
      title: `Codex Packet: ${priority} ${group.surface.replace(/_/g, ' ')} hardening`,
      priority,
      surface: group.surface,
      riskLevel: riskLevelFromPriority(priority),
      files,
      currentIssue: `${group.findings.length} finding${group.findings.length === 1 ? '' : 's'} on ${group.surface}`,
      recommendedChange: group.findings.slice(0, 3).map((finding) => `${finding.path}:${finding.lineNumber} -> ${finding.message || finding.kind}`).join(' | '),
      patchSuggestions: group.findings.slice(0, 6).map((finding) => ({
        file: finding.path,
        lineNumber: finding.lineNumber,
        suggestion: finding.message || finding.kind,
        excerpt: finding.excerpt || ''
      })),
      testCommands: buildTestCommands(priority, group.findings, readinessReport),
      expectedProof: buildExpectedProof(priority, readinessReport),
      needsSetupDependencies: buildSetupRequirements(group.findings, readinessReport),
      rollbackNote: buildRollbackNote(priority),
      sourceFindingCount: group.findings.length,
      sourceAuditId: auditReport?.id || null,
      generatedAtMs,
      trust: priority === 'P0' ? TRUST_STATES.FAILED : TRUST_STATES.VERIFIED
    };
    return packet;
  });
}

export function saveDevPackets(packets: DevPacket[] = []): DevPacket[] {
  const current = readRows().filter((row) => !packets.some((packet) => packet.id === row.id));
  const next = [...packets, ...current];
  writeRows(next);
  return packets;
}

export function summarizeDevPackets(packets: DevPacket[] = []): DevPacketSummary {
  return {
    count: packets.length,
    p0: packets.filter((packet) => packet.priority === 'P0').length,
    p1: packets.filter((packet) => packet.priority === 'P1').length,
    p2: packets.filter((packet) => packet.priority === 'P2').length
  };
}
