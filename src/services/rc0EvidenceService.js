import { writeWorkspaceArtifact, writeHandoffArtifact } from './workspaceArtifactService';

function isoDateTag(ms) {
  return new Date(Number(ms || Date.now())).toISOString().slice(0, 10);
}

function jsonPretty(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function packetSummary(packet) {
  return {
    id: packet.id,
    title: packet.title,
    priority: packet.priority,
    riskLevel: packet.riskLevel,
    files: Array.isArray(packet.files) ? packet.files : [],
    currentIssue: packet.currentIssue || '',
    recommendedChange: packet.recommendedChange || '',
    testCommands: Array.isArray(packet.testCommands) ? packet.testCommands : [],
    expectedProof: packet.expectedProof || '',
    needsSetupDependencies: Array.isArray(packet.needsSetupDependencies) ? packet.needsSetupDependencies : [],
    rollbackNote: packet.rollbackNote || ''
  };
}

function buildProofMarkdown({
  cycle,
  readinessReport,
  workspaceValidation,
  runtimeUsed = 'native_tauri',
  proofState = 'partial',
  receiptsWritten = true,
  exportPaths = []
}) {
  const packets = Array.isArray(cycle?.packets) ? cycle.packets : [];
  const topPackets = packets.slice(0, 10).map(packetSummary);
  const lines = [
    '# Alphonso Native Self-Development Proof',
    '',
    `- runtime: \`${runtimeUsed}\``,
    `- timestamp: ${new Date(Number(cycle?.generatedAtMs || Date.now())).toISOString()}`,
    `- workspaceRoot: \`${cycle?.root || ''}\``,
    `- workspaceRootValid: ${Boolean(workspaceValidation?.ok)}`,
    `- proofState: \`${proofState}\``,
    `- scanStatus: \`${cycle?.overallState || 'unknown'}\``,
    `- filesScanned: ${Number(cycle?.auditReport?.filesScanned || 0)}`,
    `- P0 count: ${Number(cycle?.auditSummary?.blockerCount || 0)}`,
    `- P1 count: ${Number(cycle?.readinessSummary?.partialCount || 0)}`,
    `- P2 count: ${Number(cycle?.readinessSummary?.needsSetupCount || 0)}`,
    `- proofReceiptsWritten: ${Boolean(receiptsWritten)}`,
    `- exportPaths: ${exportPaths.length ? exportPaths.join(', ') : 'none recorded'}`,
    `- error: ${cycle?.exportError || workspaceValidation?.error || 'none'}`,
    '',
    '## Top Generated Packets',
    ...topPackets.map((packet) => [
      `### ${packet.title}`,
      `- Packet ID: \`${packet.id}\``,
      `- Priority: \`${packet.priority}\``,
      `- Risk: \`${packet.riskLevel}\``,
      `- Files: ${packet.files.length ? packet.files.join(', ') : 'None recorded'}`,
      `- Issue: ${packet.currentIssue || 'n/a'}`,
      `- Change: ${packet.recommendedChange || 'n/a'}`,
      `- Tests: ${packet.testCommands.length ? packet.testCommands.join(' | ') : 'n/a'}`,
      `- Proof: ${packet.expectedProof || 'n/a'}`
    ].join('\n')),
    '',
    '## Truth Labels',
    `- proof bundle state: ${proofState}`,
    `- confirmed: build, test, Tauri build, installer artifacts`,
    `- partial: native self-development scan completed but one or more proof writes failed`,
    `- setup_required: updater signing, hosted manifest, external connectors`,
    `- blocked: none recorded in this proof bundle`,
    `- failed: none recorded in this proof bundle`
  ];
  return `${lines.join('\n')}\n`;
}

function buildReadinessSnapshot(cycle, readinessReport, workspaceValidation, exportPaths = []) {
  return {
    runtime: 'native_tauri',
    timestamp: new Date(Number(cycle?.generatedAtMs || Date.now())).toISOString(),
    workspaceRoot: cycle?.root || '',
    workspaceRootValid: Boolean(workspaceValidation?.ok),
    proofState: cycle?.overallState === 'failed'
      ? 'failed'
      : cycle?.overallState === 'blocked'
        ? 'blocked'
        : !workspaceValidation?.ok
          ? 'setup_required'
          : (cycle?.exportError || cycle?.rc0Error)
            ? 'partial'
            : 'confirmed',
    scanStatus: cycle?.overallState || 'unknown',
    filesScanned: Number(cycle?.auditReport?.filesScanned || 0),
    p0Count: Number(cycle?.auditSummary?.blockerCount || 0),
    p1Count: Number(cycle?.readinessSummary?.partialCount || 0),
    p2Count: Number(cycle?.readinessSummary?.needsSetupCount || 0),
    proofReceiptsWritten: true,
    exportPaths,
    topPackets: Array.isArray(cycle?.packets) ? cycle.packets.slice(0, 10).map(packetSummary) : [],
    readinessSummary: readinessReport?.readinessRows ? readinessReport.readinessRows.length : 0,
    releaseState: readinessReport?.releaseState || null,
    workflowSummary: readinessReport?.workflowSummary || null,
    errors: cycle?.exportError || workspaceValidation?.error || null
  };
}

function buildConnectorReadinessSnapshot(readinessReport) {
  const rows = Array.isArray(readinessReport?.readinessRows) ? readinessReport.readinessRows : [];
  return rows.filter((row) => row.kind === 'connector' || row.kind === 'tool_connection').map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    state: row.state,
    configured: row.configured || 'unknown',
    envStatus: row.envStatus || 'unknown',
    allowlistStatus: row.allowlistStatus || 'unknown',
    testAction: row.testAction || 'unknown',
    testActionAvailable: Boolean(row.testActionAvailable),
    lastTestResult: row.lastTestResult || 'unknown',
    lastTestAtMs: row.lastTestAtMs || null,
    failureReason: row.failureReason || null,
    approvalRequired: Boolean(row.approvalRequired),
    receiptStatus: row.receiptStatus || 'unknown',
    missingEnv: Array.isArray(row.missingEnv) ? row.missingEnv : [],
    zeroCostPolicy: row.zeroCostPolicy || 'unknown'
  }));
}

function buildUpdaterReadinessSnapshot(readinessReport) {
  return {
    releaseState: readinessReport?.releaseState || null,
    releaseProof: readinessReport?.releaseProof || null,
    signingEnv: readinessReport?.signingEnv || null,
    updateCheckState: readinessReport?.updateCheckState || null,
    missing: readinessReport?.releaseState?.missing || null
  };
}

function buildWorkflowDurabilityMarkdown(readinessReport) {
  const wf = readinessReport?.workflowSummary || {};
  const lines = [
    '# Workflow Durability Proof',
    '',
    `- runs: ${Number(wf.runs || 0)}`,
    `- receipts: ${Number(wf.receipts || 0)}`,
    `- orchestrationReceipts: ${Number(wf.orchestrationReceipts || 0)}`,
    `- workflowReady: ${readinessReport?.durabilityRows?.find((row) => row.id === 'workflow_durability')?.state || 'unknown'}`,
    `- workflowReceipts: ${readinessReport?.durabilityRows?.find((row) => row.id === 'workflow_receipts')?.state || 'unknown'}`,
    `- approvalCoverage: ${readinessReport?.durabilityRows?.find((row) => row.id === 'approval_policy')?.state || 'unknown'}`,
    `- memoryDurability: ${readinessReport?.durabilityRows?.find((row) => row.id === 'memory_durability')?.state || 'unknown'}`
  ];
  return `${lines.join('\n')}\n`;
}

function buildVerificationResultsMarkdown({ testOk, buildOk, tauriOk, releaseUpdaterOk }) {
  return [
    '# Verification Results',
    '',
    `- test: ${testOk ? 'passed' : 'not_run_or_failed'}`,
    `- build: ${buildOk ? 'passed' : 'not_run_or_failed'}`,
    `- tauri: ${tauriOk ? 'passed' : 'not_run_or_failed'}`,
    `- releaseUpdater: ${releaseUpdaterOk ? 'passed' : 'setup_required_or_not_run'}`,
    '',
    'Build artifacts remain local and truth-labeled.'
  ].join('\n') + '\n';
}

function buildRemainingBlockersMarkdown(readinessReport, workspaceValidation) {
  const blockers = [
    ...(Array.isArray(readinessReport?.liveBlockers) ? readinessReport.liveBlockers : []),
    ...(workspaceValidation?.ok ? [] : ['workspace_root_invalid']),
    ...(readinessReport?.releaseState?.state === 'ready' ? [] : ['updater_setup_required']),
    ...(readinessReport?.connectorSummary ? [] : [])
  ];
  const unique = [...new Set(blockers.filter(Boolean))];
  return [
    '# Remaining Blockers',
    '',
    ...(unique.length ? unique.map((item) => `- ${item}`) : ['- none recorded'])
  ].join('\n') + '\n';
}

function buildInstallAndRunMarkdown() {
  return [
    '# Install and Run',
    '',
    '1. Install the desktop build from the NSIS or MSI bundle produced by `npx.cmd tauri build`.',
    '2. Launch the installed app or `src-tauri/target/release/app.exe`.',
    '3. Open the Ecosystem tab.',
    '4. Use `Self-Development Mode` to validate the workspace root and run the scan.',
    '5. If updater signing is configured, run `npm.cmd run release:updater` after setting the required env vars.',
    '6. Do not treat setup-required states as production completion.'
  ].join('\n') + '\n';
}

export async function writeRc0EvidencePackage({
  workspaceRoot,
  cycle,
  readinessReport,
  workspaceValidation,
  verificationResults = { testOk: false, buildOk: false, tauriOk: false, releaseUpdaterOk: false }
}) {
  const dateTag = isoDateTag(cycle?.generatedAtMs || Date.now());
  const proofState = cycle?.overallState === 'failed'
    ? 'failed'
    : !workspaceValidation?.ok
      ? 'setup_required'
      : (cycle?.exportError || cycle?.rc0Error)
        ? 'partial'
        : 'confirmed';
  const exportPaths = [
    `docs/handoff/ALPHONSO_NATIVE_SELFDEV_PROOF_${dateTag}.md`,
    `docs/handoff/ALPHONSO_SELFDEV_PACKETS_${dateTag}.json`,
    `docs/handoff/ALPHONSO_PRODUCTION_READINESS_SNAPSHOT_${dateTag}.json`,
    'release/rc0/README.md',
    'release/rc0/self-development-proof.md',
    'release/rc0/self-development-packets.json',
    'release/rc0/production-readiness.json',
    'release/rc0/connector-readiness.json',
    'release/rc0/updater-readiness.json',
    'release/rc0/workflow-durability-proof.md',
    'release/rc0/verification-results.md',
    'release/rc0/remaining-blockers.md',
    'release/rc0/install-and-run.md'
  ];
  const proofMarkdown = buildProofMarkdown({
    cycle,
    readinessReport,
    workspaceValidation,
    proofState,
    exportPaths
  });
  const packetJson = jsonPretty(Array.isArray(cycle?.packets) ? cycle.packets.slice(0, 10).map(packetSummary) : []);
  const productionSnapshot = buildReadinessSnapshot(cycle, readinessReport, workspaceValidation, exportPaths);
  const connectorSnapshot = buildConnectorReadinessSnapshot(readinessReport);
  const updaterSnapshot = buildUpdaterReadinessSnapshot(readinessReport);
  const workflowProof = buildWorkflowDurabilityMarkdown(readinessReport);
  const verificationMarkdown = buildVerificationResultsMarkdown(verificationResults);
  const blockersMarkdown = buildRemainingBlockersMarkdown(readinessReport, workspaceValidation);
  const installMarkdown = buildInstallAndRunMarkdown();

  const outputs = [];
  const docsHandoff = [
    {
      relativePath: `docs/handoff/ALPHONSO_NATIVE_SELFDEV_PROOF_${dateTag}.md`,
      content: proofMarkdown
    },
    {
      relativePath: `docs/handoff/ALPHONSO_SELFDEV_PACKETS_${dateTag}.json`,
      content: packetJson
    },
    {
      relativePath: `docs/handoff/ALPHONSO_PRODUCTION_READINESS_SNAPSHOT_${dateTag}.json`,
      content: jsonPretty(productionSnapshot)
    }
  ];

  const rc0Files = [
    {
      relativePath: 'release/rc0/README.md',
      content: [
        '# Alphonso RC0 Evidence Package',
        '',
        'This folder contains the release-candidate proof bundle for the current native self-development cycle.',
        'It is safe to inspect locally and intentionally keeps secrets out of band.',
        '',
        '- Native runtime proof: `release/rc0/self-development-proof.md`',
        '- Packets: `release/rc0/self-development-packets.json`',
        '- Production readiness: `release/rc0/production-readiness.json`',
        '- Connector readiness: `release/rc0/connector-readiness.json`',
        '- Updater readiness: `release/rc0/updater-readiness.json`',
        '- Workflow proof: `release/rc0/workflow-durability-proof.md`',
        '- Verification results: `release/rc0/verification-results.md`',
        '- Remaining blockers: `release/rc0/remaining-blockers.md`',
        '- Install/run guidance: `release/rc0/install-and-run.md`'
      ].join('\n') + '\n'
    },
    { relativePath: 'release/rc0/self-development-proof.md', content: proofMarkdown },
    { relativePath: 'release/rc0/self-development-packets.json', content: packetJson },
    { relativePath: 'release/rc0/production-readiness.json', content: jsonPretty(productionSnapshot) },
    { relativePath: 'release/rc0/connector-readiness.json', content: jsonPretty(connectorSnapshot) },
    { relativePath: 'release/rc0/updater-readiness.json', content: jsonPretty(updaterSnapshot) },
    { relativePath: 'release/rc0/workflow-durability-proof.md', content: workflowProof },
    { relativePath: 'release/rc0/verification-results.md', content: verificationMarkdown },
    { relativePath: 'release/rc0/remaining-blockers.md', content: blockersMarkdown },
    { relativePath: 'release/rc0/install-and-run.md', content: installMarkdown }
  ];

  for (const entry of docsHandoff) {
    outputs.push(await writeHandoffArtifact({ workspaceRoot, fileName: entry.relativePath.split('/').pop(), content: entry.content }));
  }

  for (const entry of rc0Files) {
    outputs.push(await writeWorkspaceArtifact({ workspaceRoot, relativePath: entry.relativePath, content: entry.content }));
  }

  return {
    runtime: 'native_tauri',
    timestamp: new Date(Number(cycle?.generatedAtMs || Date.now())).toISOString(),
    workspaceRoot: workspaceRoot || cycle?.root || '',
    workspaceRootValid: Boolean(workspaceValidation?.ok),
    scanStatus: cycle?.overallState || 'unknown',
    filesScanned: Number(cycle?.auditReport?.filesScanned || 0),
    p0Count: Number(cycle?.auditSummary?.blockerCount || 0),
    p1Count: Number(cycle?.readinessSummary?.partialCount || 0),
    p2Count: Number(cycle?.readinessSummary?.needsSetupCount || 0),
    topPackets: Array.isArray(cycle?.packets) ? cycle.packets.slice(0, 10).map(packetSummary) : [],
    exportPaths,
    outputs
  };
}
