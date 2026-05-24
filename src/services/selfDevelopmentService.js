import { exportExecutionPacketToFile } from './projectExecution/workshopSessionService';
import { appendOrchestrationReceipt } from './orchestrationReceiptService';
import { appendSessionEvent } from './sessionIntelligenceService';
import { TRUST_STATES, timestampMs } from './trustModel';
import { persistScopeRows } from './runtimeLedgerService';
import { getLastRepoAudit, runRepoAudit, summarizeRepoAudit } from './repoAuditService';
import { collectProductionReadinessSnapshot, summarizeProductionReadiness } from './productionReadinessService';
import { buildDevPackets, saveDevPackets, summarizeDevPackets, listDevPackets as listSavedDevPackets } from './devPacketService';
import { validateWorkspaceRoot } from './workspaceRootService';
import { writeRc0EvidencePackage } from './rc0EvidenceService';

const SELF_DEVELOPMENT_KEY = 'alphonso_self_development_cycles_v1';
export const SELF_DEVELOPMENT_SCOPE = 'self_development_cycles_v1';

function readRows() {
  try {
    const raw = localStorage.getItem(SELF_DEVELOPMENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRows(rows) {
  const next = rows.slice(-40);
  localStorage.setItem(SELF_DEVELOPMENT_KEY, JSON.stringify(next));
  persistScopeRows(SELF_DEVELOPMENT_SCOPE, next, (row) => ({
    id: row.id,
    data: row,
    status: row.status || row.overallState || 'recorded',
    confidence: row.trust || TRUST_STATES.TEMPORARY,
    verificationState: row.trust || TRUST_STATES.UNVERIFIED,
    timestampMs: Number(row.generatedAtMs || timestampMs())
  }));
}

function saveCycle(cycle) {
  const rows = readRows();
  const next = [cycle, ...rows.filter((row) => row.id !== cycle.id)];
  writeRows(next);
  return cycle;
}

function buildSelfDevelopmentReportMarkdown(cycle) {
  const packets = Array.isArray(cycle?.packets) ? cycle.packets : [];
  const topPackets = packets.slice(0, 5);
  const lines = [
    `# Alphonso Self-Development Cycle`,
    '',
    `- Cycle ID: \`${cycle?.id || 'unknown'}\``,
    `- Root: \`${cycle?.root || 'unknown'}\``,
    `- Generated: ${new Date(Number(cycle?.generatedAtMs || timestampMs())).toISOString()}`,
    `- Overall state: \`${cycle?.overallState || 'unknown'}\``,
    `- Files scanned: ${Number(cycle?.auditReport?.filesScanned || 0)}`,
    `- P0 findings: ${Number(cycle?.auditSummary?.blockerCount || 0)}`,
    `- P1 findings: ${Number(cycle?.readinessSummary?.partialCount || 0)}`,
    `- P2 findings: ${Number(cycle?.readinessSummary?.needsSetupCount || 0)}`,
    '',
    '## Top Packets',
    ...topPackets.map((packet) => [
      `### ${packet.title}`,
      `- Packet ID: \`${packet.id}\``,
      `- Priority: \`${packet.priority}\``,
      `- Risk: \`${packet.riskLevel}\``,
      `- Files: ${Array.isArray(packet.files) && packet.files.length ? packet.files.join(', ') : 'None recorded'}`,
      `- Issue: ${packet.currentIssue || 'n/a'}`,
      `- Change: ${packet.recommendedChange || 'n/a'}`,
      `- Tests: ${(packet.testCommands || []).join(' | ') || 'n/a'}`,
      `- Proof: ${packet.expectedProof || 'n/a'}`
    ].join('\n')),
    '',
    '## Persisted Truth',
    `- Audit report persisted: ${Boolean(cycle?.auditReport)}`,
    `- Packet bundle persisted: ${packets.length > 0}`,
    `- Runtime ledger updated: yes`
  ];
  return lines.join('\n');
}

async function exportSelfDevelopmentReport(cycle) {
  const fileName = `alphonso-self-development-${String(cycle?.generatedAtMs || timestampMs())}.md`;
  const content = buildSelfDevelopmentReportMarkdown(cycle);
  return exportExecutionPacketToFile({
    workspaceRoot: cycle?.root || '',
    fileName,
    content,
    format: 'md'
  });
}

export function listSelfDevelopmentCycles() {
  return readRows();
}

export function getLastSelfDevelopmentCycle() {
  return readRows()[0] || null;
}

export async function runSelfDevelopmentCycle({
  root,
  settings = {},
  updateCheckState = {},
  verificationLogs = [],
  workspaceFoundation = {},
  maxFiles = 1200,
  maxFindings = 240,
  proofHooks = null
} = {}) {
  const writeProofStage = async (stage, payload = {}) => {
    if (typeof proofHooks?.writeStage !== 'function') return null;
    try {
      return await proofHooks.writeStage(stage, {
        runtime: 'native_tauri',
        workspaceRoot: root || '',
        ...payload
      });
    } catch {
      return null;
    }
  };

  await writeProofStage('05_workspace_validation_started.json', {
    status: 'running'
  });
  const validation = await validateWorkspaceRoot(root);
  const verificationResults = {
    buildOk: false,
    testOk: false,
    tauriOk: false,
    releaseUpdaterOk: false
  };
  await writeProofStage('05_workspace_validated.json', {
    status: validation.ok ? 'ready' : validation.status || 'setup_required',
    validation,
    error: validation.ok ? null : validation.error || null
  });
  if (!validation.ok) {
    const cycle = {
      id: `self-dev-cycle-${timestampMs()}`,
      root: validation.root || root || '',
      generatedAtMs: timestampMs(),
      auditReport: null,
      readinessReport: null,
      packets: [],
      packetSummary: { count: 0, p0: 0, p1: 0, p2: 0 },
      auditSummary: { filesScanned: 0, blockerCount: 0, partialCount: 0, needsSetupCount: 4, issueCount: 0, todoCount: 0 },
      readinessSummary: { overallState: validation.status, blockerCount: 0, partialCount: 0, needsSetupCount: 0, issueCount: 0, todoCount: 0 },
      overallState: validation.status,
      trust: validation.status === 'blocked' ? TRUST_STATES.FAILED : TRUST_STATES.UNVERIFIED,
      validation
    };
    saveCycle(cycle);
    try {
      await writeProofStage('proof_error.json', {
        stage: 'workspace_validation',
        status: validation.status || 'setup_required',
        error: validation.error || 'Workspace validation failed before scanning.'
      });
      const rc0Proof = await writeRc0EvidencePackage({
        workspaceRoot: root || '',
        cycle,
        readinessReport: null,
        workspaceValidation: validation,
        verificationResults
      });
      cycle.rc0Proof = rc0Proof;
      saveCycle(cycle);
    } catch (error) {
      cycle.rc0Error = String(error);
      saveCycle(cycle);
    }
    appendOrchestrationReceipt({
      workflowId: 'self_development_mode',
      eventType: 'self_development_cycle_needs_setup',
      status: cycle.overallState || 'needs_setup',
      agent: 'alphonso',
      actionType: 'workspace_validation',
      riskLevel: 'low',
      approved: true,
      blocked: true,
      setupRequired: true,
      details: {
        validation
      },
      confidence: cycle.trust,
      verificationState: cycle.trust
    });
    appendSessionEvent({
      category: 'self_development',
      title: 'Self-development cycle needs setup',
      details: {
        validation
      },
      agent: 'alphonso',
      confidence: cycle.trust,
      verificationState: cycle.trust
    });
    return cycle;
  }

  await writeProofStage('06_scan_started.json', {
    status: 'running',
    maxFiles,
    maxFindings
  });
  const auditReport = await runRepoAudit({
    root,
    maxFiles,
    maxFindings,
    options: {
      generatedBy: 'alphonso-self-development'
    }
  });
  await writeProofStage('07_scan_completed.json', {
    status: 'ready',
    filesScanned: Number(auditReport?.filesScanned || 0),
    p0Count: Number(auditReport?.blockedCount || 0),
    p1Count: Number(auditReport?.partialCount || 0),
    p2Count: Number(auditReport?.needsSetupCount || 0)
  });
  const readinessReport = await collectProductionReadinessSnapshot({
    root,
    settings,
    updateCheckState,
    verificationLogs,
    workspaceFoundation,
    repoAuditReport: auditReport
  });
  const packets = buildDevPackets({
    auditReport,
    readinessReport,
    maxPackets: 10
  });
  saveDevPackets(packets);
  await writeProofStage('08_packets_generated.json', {
    status: 'ready',
    packetCount: packets.length,
    topPackets: packets.slice(0, 10).map((packet) => ({
      id: packet.id,
      title: packet.title,
      priority: packet.priority,
      riskLevel: packet.riskLevel
    }))
  });

  const packetSummary = summarizeDevPackets(packets);
  const cycle = {
    id: `self-dev-cycle-${timestampMs()}`,
    root: root || '',
    generatedAtMs: timestampMs(),
    auditReport,
    readinessReport,
    packets,
    packetSummary,
    auditSummary: summarizeRepoAudit(auditReport),
    readinessSummary: summarizeProductionReadiness(readinessReport),
    overallState: readinessReport?.overallState || 'unknown',
    trust: readinessReport?.overallState === 'ready' ? TRUST_STATES.VERIFIED : readinessReport?.overallState === 'failed' ? TRUST_STATES.FAILED : TRUST_STATES.UNVERIFIED
  };
  saveCycle(cycle);
  try {
    const exportProof = await exportSelfDevelopmentReport(cycle);
    cycle.exportProof = exportProof;
    saveCycle(cycle);
    await writeProofStage('09_handoff_exported.json', {
      status: exportProof?.written ? 'ready' : 'setup_required',
      exportPath: exportProof?.filePath || exportProof?.file_path || null,
      written: Boolean(exportProof?.written)
    });
  } catch (error) {
    cycle.exportError = String(error);
    saveCycle(cycle);
    await writeProofStage('proof_error.json', {
      stage: 'handoff_export',
      status: 'failed',
      error: String(error)
    });
  }
  try {
    const rows = Array.isArray(readinessReport?.readinessRows) ? readinessReport.readinessRows : [];
    const rowState = (id) => rows.find((row) => row.id === id)?.state || 'unknown';
    verificationResults.buildOk = rowState('build') === 'ready';
    verificationResults.testOk = rowState('test') === 'ready';
    verificationResults.tauriOk = rowState('tauri_build') === 'ready';
    verificationResults.releaseUpdaterOk = rowState('release_readiness') === 'ready';
    const rc0Proof = await writeRc0EvidencePackage({
      workspaceRoot: root || '',
      cycle,
      readinessReport,
      workspaceValidation: validation,
      verificationResults
    });
    cycle.rc0Proof = rc0Proof;
    saveCycle(cycle);
    await writeProofStage('10_rc0_package_written.json', {
      status: 'ready',
      exportPaths: Array.isArray(rc0Proof?.exportPaths) ? rc0Proof.exportPaths : [],
      topPackets: Array.isArray(rc0Proof?.topPackets) ? rc0Proof.topPackets.slice(0, 10) : []
    });
  } catch (error) {
    cycle.rc0Error = String(error);
    saveCycle(cycle);
    await writeProofStage('proof_error.json', {
      stage: 'rc0_package',
      status: 'failed',
      error: String(error)
    });
  }

  appendOrchestrationReceipt({
    workflowId: 'self_development_mode',
    eventType: 'self_development_cycle_completed',
    status: cycle.overallState || 'recorded',
    agent: 'alphonso',
    actionType: 'repo_audit_and_packet_generation',
    riskLevel: cycle.overallState === 'failed' ? 'high' : 'medium',
    approved: true,
    blocked: cycle.overallState === 'failed',
    setupRequired: cycle.overallState === 'setup_required',
    details: {
      auditId: auditReport?.id || null,
      packetCount: packets.length,
      overallState: cycle.overallState
    },
    confidence: cycle.trust,
    verificationState: cycle.trust
  });

  appendSessionEvent({
    category: 'self_development',
    title: 'Self-development cycle completed',
    details: {
      auditId: auditReport?.id || null,
      packetCount: packets.length,
      overallState: cycle.overallState
    },
    agent: 'alphonso',
    confidence: cycle.trust,
    verificationState: cycle.trust
  });

  return cycle;
}

export function getCurrentSelfDevelopmentPacketBundle() {
  const cycle = getLastSelfDevelopmentCycle();
  if (cycle) return cycle;
  const auditReport = getLastRepoAudit();
  return {
    id: 'self-dev-preview',
    root: '',
    generatedAtMs: timestampMs(),
    auditReport,
    readinessReport: null,
    packets: listSavedDevPackets(),
    packetSummary: summarizeDevPackets(listSavedDevPackets()),
    auditSummary: summarizeRepoAudit(auditReport),
    readinessSummary: { overallState: 'unknown' },
    overallState: 'unknown',
    trust: TRUST_STATES.UNVERIFIED
  };
}
