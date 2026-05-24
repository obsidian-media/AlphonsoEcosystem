import { invoke } from '@tauri-apps/api/core';
import { listConnectors, listConnectorAuthProfiles, listConnectorAudit, verifyConnectorEnvironment } from './connectorRegistryService';
import { listToolConnectionTypes, listToolConnections } from './toolConnectionService';
import { listWorkflowReceipts } from './workflowReceiptService';
import { listWorkflowRuns } from './workflowExecutionService';
import { listOrchestrationReceipts } from './orchestrationReceiptService';
import { getLastRepoAudit, summarizeRepoAudit } from './repoAuditService';
import { TRUST_STATES, timestampMs } from './trustModel';
import { persistScopeRows } from './runtimeLedgerService';

const PRODUCTION_READINESS_KEY = 'alphonso_production_readiness_v1';
export const PRODUCTION_READINESS_SCOPE = 'production_readiness_v1';

function readRows() {
  try {
    const raw = localStorage.getItem(PRODUCTION_READINESS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRows(rows) {
  const next = rows.slice(-60);
  localStorage.setItem(PRODUCTION_READINESS_KEY, JSON.stringify(next));
  persistScopeRows(PRODUCTION_READINESS_SCOPE, next, (row) => ({
    id: row.id,
    data: row,
    status: row.overallState || row.status || 'recorded',
    confidence: row.trust || TRUST_STATES.TEMPORARY,
    verificationState: row.trust || TRUST_STATES.UNVERIFIED,
    timestampMs: Number(row.generatedAtMs || timestampMs())
  }));
}

function normalizeState(state) {
  const clean = String(state || '').trim().toLowerCase();
  if (['ready', 'partial', 'setup_required', 'blocked', 'failed', 'unknown'].includes(clean)) {
    return clean;
  }
  return 'unknown';
}

function worstState(current, next) {
  const order = {
    failed: 5,
    blocked: 4,
    setup_required: 3,
    partial: 2,
    unknown: 1,
    ready: 0
  };
  return order[normalizeState(next)] > order[normalizeState(current)] ? normalizeState(next) : normalizeState(current);
}

function buildCommandProofs(verificationLogs = []) {
  const commandLogs = Array.isArray(verificationLogs)
    ? verificationLogs.filter((entry) => String(entry?.type || '') === 'command_execution')
    : [];

  const latestFor = (matchers = []) => {
    const row = commandLogs.slice().reverse().find((entry) => {
      const payload = entry?.payload || {};
      const program = String(payload?.program || '').toLowerCase();
      const args = Array.isArray(payload?.args) ? payload.args.map((arg) => String(arg || '').toLowerCase()) : [];
      return matchers.every((matcher) => matcher(program, args, payload));
    });
    if (!row) return null;
    const payload = row.payload || {};
    return {
      status: row.trust || 'unknown',
      ok: Boolean(payload.success),
      program: payload.program || '',
      args: Array.isArray(payload.args) ? payload.args : [],
      cwd: payload.cwd || null,
      exitCode: typeof payload.exit_code === 'number' ? payload.exit_code : payload.exitCode ?? null,
      stdout: payload.stdout || '',
      stderr: payload.stderr || '',
      timestampMs: row.timestampMs || payload.finished_at_ms || payload.finishedAtMs || timestampMs()
    };
  };

  return {
    build: latestFor([
      (program, args) => program.includes('npm') && args.includes('run') && args.includes('build')
    ]),
    test: latestFor([
      (program, args) => program.includes('npm') && args.includes('run') && args.includes('test')
    ]),
    tauriBuild: latestFor([
      (program, args) => program.includes('npx') && args.includes('tauri') && args.includes('build')
    ]),
    releaseUpdater: latestFor([
      (program, args) => program.includes('npm') && args.includes('run') && args.includes('release:updater')
    ])
  };
}

export function summarizeCommandProofs(verificationLogs = []) {
  return buildCommandProofs(verificationLogs);
}

function envPresenceStatus(envPresence = {}) {
  const names = Object.keys(envPresence);
  const ready = names.length > 0 && names.every((name) => Boolean(envPresence[name]));
  const missing = names.filter((name) => !envPresence[name]);
  if (ready) return { state: 'ready', missing };
  if (names.length === 0) return { state: 'unknown', missing };
  return { state: 'setup_required', missing };
}

function buildConnectorRows({ connectors = [], authProfiles = {}, toolConnections = [], connectorProofs = {}, connectorAudit = [] }) {
  const rows = [];
  const webhookTypes = listToolConnectionTypes();
  const toolConnectionTypes = new Set(toolConnections.map((connection) => String(connection.type || '').trim()).filter(Boolean));

  connectors.forEach((connector) => {
    const proof = connectorProofs[connector.id] || {};
    const auth = authProfiles[connector.id] || { enabled: false, allowlist: [], mode: 'allowlist_required' };
    const latestAudit = connectorAudit
      .slice()
      .reverse()
      .find((entry) => entry.connectorId === connector.id);
    const envStatus = envPresenceStatus(proof.envPresence || {});
    const foundationOnly = connector.status === 'foundation_only';
    const localRuntime = ['sd_webui', 'comfyui_video'].includes(connector.id)
      ? 'ready'
      : null;
    const authRequired = ['telegram', 'whatsapp', 'youtube', 'notion', 'clickup', 'chatgpt', 'claude', 'runway'].includes(connector.id);
    const authState = authRequired
      ? (auth.enabled && (Array.isArray(auth.allowlist) ? auth.allowlist.length > 0 : true) ? 'ready' : 'setup_required')
      : 'ready';
    const state = localRuntime || (proof.ok ? authState : envStatus.state);
    rows.push({
      id: connector.id,
      name: connector.name,
      kind: 'connector',
      state: normalizeState(state),
      status: connector.status || 'unknown',
      configured: foundationOnly ? 'foundation_only' : connector.status === 'configured' ? 'configured' : 'not_configured',
      envStatus: envStatus.state,
      authEnabled: Boolean(auth.enabled),
      authMode: auth.mode || 'allowlist_required',
      allowlistStatus: Boolean(auth.enabled) && Array.isArray(auth.allowlist) && auth.allowlist.length > 0 ? 'configured' : 'setup_required',
      allowlistCount: Array.isArray(auth.allowlist) ? auth.allowlist.length : 0,
      requiredEnv: Array.isArray(connector.requiredEnv) ? connector.requiredEnv : [],
      missingEnv: proof.missingEnv || envStatus.missing || [],
      failureReason: proof.error || connector.disabledReason || null,
      approvalRequired: ['upload_video', 'metadata_update', 'docs_write', 'task_write', 'inbound_messages'].some((value) => {
        const permissions = Array.isArray(connector.permissions) ? connector.permissions : [];
        return permissions.includes(value);
      }),
      testActionAvailable: true,
      testAction: connector.id === 'youtube'
        ? 'connector_upload_youtube'
        : connector.id === 'notion'
          ? 'connector_send_notion'
          : connector.id === 'clickup'
            ? 'connector_send_clickup'
            : connector.id === 'telegram'
              ? 'connector_send_telegram'
              : connector.id === 'whatsapp'
                ? 'connector_send_whatsapp'
                : connector.id === 'runway'
                  ? 'connector_generate_runway_video'
                : connector.id === 'sd_webui'
          ? 'connector_generate_sdwebui_image'
          : connector.id === 'comfyui_video'
            ? 'connector_queue_comfyui_video'
            : 'status_check',
      lastTestResult: latestAudit?.action || proof.status || 'unknown',
      lastTestAtMs: connector.lastTestAtMs || proof.checkedAtMs || latestAudit?.timestampMs || null,
      receiptStatus: latestAudit?.action ? 'recorded' : 'unknown',
      zeroCostPolicy: connector.id === 'chatgpt' || connector.id === 'claude' ? 'blocked' : 'local_or_free'
    });
  });

  toolConnections.forEach((connection) => {
    rows.push({
      id: connection.id,
      name: connection.label || connection.id,
      kind: 'tool_connection',
      state: connection.active
        ? connection.lastTestStatus === 'verified'
          ? 'ready'
          : connection.lastTestStatus === 'failed'
            ? 'failed'
            : 'setup_required'
        : 'setup_required',
      status: connection.active ? 'active' : 'disabled',
      envStatus: connection.webhookUrl ? 'configured' : 'setup_required',
      authEnabled: true,
      authMode: 'approval_required',
      allowlistCount: Array.isArray(connection.notifyOn) ? connection.notifyOn.length : 0,
      requiredEnv: [],
      missingEnv: connection.webhookUrl ? [] : ['webhookUrl'],
      failureReason: connection.lastTestError || (!connection.active ? 'Connection is disabled.' : null),
      approvalRequired: true,
      testAction: 'sendToolConnectionMessage',
      zeroCostPolicy: 'local_or_free'
    });
  });

  webhookTypes.forEach((type) => {
    if (toolConnectionTypes.has(type.id)) return;
    rows.push({
      id: type.id,
      name: type.label,
      kind: 'tool_connection_type',
      state: 'setup_required',
      status: 'not_configured',
      configured: 'not_configured',
      envStatus: 'setup_required',
      authEnabled: true,
      authMode: 'approval_required',
      allowlistStatus: 'setup_required',
      allowlistCount: 0,
      requiredEnv: ['webhookUrl'],
      missingEnv: ['webhookUrl'],
      failureReason: 'Webhook URL is not configured.',
      approvalRequired: true,
      testActionAvailable: false,
      testAction: 'status_check',
      lastTestResult: 'unknown',
      lastTestAtMs: null,
      receiptStatus: 'unknown',
      zeroCostPolicy: 'local_or_free'
    });
  });

  return rows.filter(Boolean);
}

function summarizeReadiness(rows = []) {
  const counts = {
    ready: 0,
    partial: 0,
    setup_required: 0,
    blocked: 0,
    failed: 0,
    unknown: 0
  };
  rows.forEach((row) => {
    const state = normalizeState(row.state);
    counts[state] = (counts[state] || 0) + 1;
  });
  return counts;
}

function buildDurabilityRows({ workflowRuns = [], workflowReceipts = [], orchestrationReceipts = [], repoAuditReport = null, workspaceFoundation = {}, verificationLogs = [] }) {
  const runStates = Array.isArray(workflowRuns) ? workflowRuns.map((row) => normalizeState(row.status)) : [];
  const receiptStates = Array.isArray(workflowReceipts) ? workflowReceipts.map((row) => normalizeState(row.status)) : [];
  const orchestrationStates = Array.isArray(orchestrationReceipts) ? orchestrationReceipts.map((row) => normalizeState(row.status)) : [];

  const workflowState = runStates.length === 0
    ? 'unknown'
    : runStates.some((state) => ['blocked', 'failed'].includes(state))
      ? 'blocked'
      : runStates.some((state) => ['setup_required', 'partial', 'approval_required'].includes(state))
        ? 'partial'
        : 'ready';

  const receiptState = receiptStates.length === 0
    ? 'unknown'
    : receiptStates.some((state) => ['blocked', 'failed'].includes(state))
      ? 'blocked'
      : receiptStates.some((state) => ['setup_required', 'partial'].includes(state))
        ? 'partial'
        : 'ready';

  const orchestrationState = orchestrationStates.length === 0
    ? 'unknown'
    : orchestrationStates.some((state) => ['blocked', 'failed'].includes(state))
      ? 'blocked'
      : orchestrationStates.some((state) => ['setup_required', 'partial', 'pending'].includes(state))
        ? 'partial'
        : 'ready';

  const repoSummary = summarizeRepoAudit(repoAuditReport);
  const commandProofs = buildCommandProofs(verificationLogs);

  return [
    {
      id: 'build',
      label: 'Build',
      state: commandProofs.build?.ok ? 'ready' : commandProofs.build ? 'failed' : 'unknown',
      evidence: commandProofs.build ? `${commandProofs.build.program} ${commandProofs.build.args.join(' ')}`.trim() : 'No build proof recorded.',
      detail: commandProofs.build?.stderr || commandProofs.build?.stdout || null
    },
    {
      id: 'test',
      label: 'Test',
      state: commandProofs.test?.ok ? 'ready' : commandProofs.test ? 'failed' : 'unknown',
      evidence: commandProofs.test ? `${commandProofs.test.program} ${commandProofs.test.args.join(' ')}`.trim() : 'No test proof recorded.',
      detail: commandProofs.test?.stderr || commandProofs.test?.stdout || null
    },
    {
      id: 'tauri_build',
      label: 'Tauri Build',
      state: commandProofs.tauriBuild?.ok ? 'ready' : commandProofs.tauriBuild ? 'failed' : 'unknown',
      evidence: commandProofs.tauriBuild ? `${commandProofs.tauriBuild.program} ${commandProofs.tauriBuild.args.join(' ')}`.trim() : 'No Tauri build proof recorded.',
      detail: commandProofs.tauriBuild?.stderr || commandProofs.tauriBuild?.stdout || null
    },
    {
      id: 'installer',
      label: 'Installer',
      state: 'unknown',
      evidence: 'Artifact proof is collected from release scans.',
      detail: null
    },
    {
      id: 'workflow_durability',
      label: 'Workflow Durability',
      state: workflowState,
      evidence: `${workflowRuns.length} runs, ${workflowReceipts.length} receipts`,
      detail: null
    },
    {
      id: 'workflow_receipts',
      label: 'Workflow Receipts',
      state: receiptState,
      evidence: `${workflowReceipts.length} workflow receipts`,
      detail: receiptStates.length > 0 ? 'Receipt states reload from local storage and runtime ledger.' : 'No workflow receipts recorded yet.'
    },
    {
      id: 'approval_policy',
      label: 'Approval Coverage',
      state: orchestrationState,
      evidence: `${orchestrationReceipts.length} orchestration receipts`,
      detail: null
    },
    {
      id: 'memory_durability',
      label: 'Memory Durability',
      state: workspaceFoundation?.workspaceProof?.trust === 'verified'
        ? 'ready'
        : workspaceFoundation?.workspaceProof?.trust === 'partial'
          ? 'partial'
          : 'setup_required',
      evidence: workspaceFoundation?.workspaceProof?.lastRunAt
        ? `Workspace proof at ${workspaceFoundation.workspaceProof.lastRunAt}`
        : 'Workspace proof has not been confirmed yet.',
      detail: null
    },
    {
      id: 'repo_audit',
      label: 'Repo Truth Audit',
      state: repoSummary.blockerCount > 0
        ? 'blocked'
        : repoSummary.issueCount > 0 || repoSummary.needsSetupCount > 0
          ? 'partial'
          : 'ready',
      evidence: `${repoSummary.issueCount} truth issues, ${repoSummary.needsSetupCount} setup-needed markers`,
      detail: repoSummary.filesScanned ? `${repoSummary.filesScanned} files scanned` : 'No audit run yet.'
    }
  ];
}

function deriveOverallState({ readinessRows = [], releaseState = 'unknown', repoAuditReport = null }) {
  const repoSummary = summarizeRepoAudit(repoAuditReport);
  let state = 'ready';
  readinessRows.forEach((row) => {
    state = worstState(state, row.state);
  });
  state = worstState(state, releaseState);
  if (repoSummary.blockerCount > 0) {
    state = worstState(state, 'failed');
  } else if (repoSummary.issueCount > 0 || repoSummary.needsSetupCount > 0) {
    state = worstState(state, 'partial');
  }
  return normalizeState(state);
}

async function checkEnvPresence(names = []) {
  if (!Array.isArray(names) || names.length === 0) return {};
  try {
    return await invoke('check_env_vars_presence', { names });
  } catch {
    return {};
  }
}

function buildReleaseRoot(root) {
  const cleanRoot = String(root || '').trim().replace(/[\\/]+$/, '');
  if (!cleanRoot) return null;
  return {
    bundleDir: `${cleanRoot}/src-tauri/target/release/bundle/nsis`,
    manifestDir: `${cleanRoot}/release/updater/windows-x86_64`
  };
}

function collectReleaseReadiness({ settings = {}, workspaceRoot = '', releaseProof = null, signingEnv = {}, updateCheckState = {} } = {}) {
  const pubkeyConfigured = Boolean(settings?.updaterPubkey);
  const endpointConfigured = Boolean(settings?.updaterEndpoint);
  const signingReady = Boolean(signingEnv?.TAURI_SIGNING_PRIVATE_KEY);
  const signingPasswordReady = Boolean(signingEnv?.TAURI_SIGNING_PRIVATE_KEY_PASSWORD);
  const manifestReady = Boolean(releaseProof?.manifestValid && releaseProof?.latestJsonFound);
  const installerReady = Boolean(releaseProof?.installerFound);
  const signatureReady = Boolean(releaseProof?.signatureFound);
  const hostedManifestReady = Boolean(updateCheckState?.configured && endpointConfigured && pubkeyConfigured);
  const releaseReady = Boolean(signingReady && signingPasswordReady && installerReady && signatureReady && manifestReady && hostedManifestReady);
  const releaseState = releaseReady
    ? 'ready'
    : !workspaceRoot
      ? 'setup_required'
      : signingReady || signingPasswordReady || installerReady || signatureReady || manifestReady || hostedManifestReady
        ? 'partial'
        : 'setup_required';

  return {
    id: 'release_readiness',
    label: 'Release / Updater',
    state: releaseState,
    evidence: [
      `signing=${signingReady ? 'ready' : 'missing'}`,
      `signing_password=${signingPasswordReady ? 'ready' : 'missing'}`,
      `installer=${installerReady ? 'ready' : 'missing'}`,
      `signature=${signatureReady ? 'ready' : 'missing'}`,
      `manifest=${manifestReady ? 'ready' : 'missing'}`,
      `hosted=${hostedManifestReady ? 'ready' : 'missing'}`
    ].join(' | '),
    detail: releaseProof?.error || null,
    missing: {
      signing: [
        signingReady ? null : 'TAURI_SIGNING_PRIVATE_KEY',
        signingPasswordReady ? null : 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD'
      ].filter(Boolean),
      updater: endpointConfigured && pubkeyConfigured ? [] : [
        !endpointConfigured ? 'ALPHONSO_UPDATE_BASE_URL or updaterEndpoint' : null,
        !pubkeyConfigured ? 'updaterPubkey' : null
      ].filter(Boolean)
    }
  };
}

function saveReport(report) {
  const rows = readRows();
  const next = [report, ...rows.filter((row) => row.id !== report.id)];
  writeRows(next);
  return report;
}

export function listProductionReadinessReports() {
  return readRows();
}

export function getLastProductionReadinessReport() {
  return readRows()[0] || null;
}

export async function collectProductionReadinessSnapshot({
  root,
  settings = {},
  updateCheckState = {},
  verificationLogs = [],
  workspaceFoundation = {},
  repoAuditReport = null
} = {}) {
  const generatedAtMs = timestampMs();
  const rootInfo = buildReleaseRoot(root);
  const connectorProofs = {};
  const connectors = listConnectors();
  const authProfiles = listConnectorAuthProfiles();
  const connectorAudit = listConnectorAudit();

  const envProofs = await Promise.all(
    connectors.map(async (connector) => {
      try {
        const proof = await verifyConnectorEnvironment(connector.id);
        return [connector.id, proof];
      } catch (error) {
        return [connector.id, {
          connectorId: connector.id,
          ok: false,
          envPresence: {},
          status: 'failed',
          checkedAtMs: generatedAtMs,
          trust: TRUST_STATES.FAILED,
          error: String(error)
        }];
      }
    })
  );

  envProofs.forEach(([connectorId, proof]) => {
    connectorProofs[connectorId] = proof;
  });

  const toolConnections = listToolConnections();
  const readinessRows = buildConnectorRows({
    connectors,
    authProfiles,
    toolConnections,
    connectorProofs,
    connectorAudit
  });

  const workflowRuns = listWorkflowRuns();
  const workflowReceipts = listWorkflowReceipts();
  const orchestrationReceipts = listOrchestrationReceipts();

  let releaseProof = null;
  let signingEnv = {};
  if (rootInfo) {
    try {
      releaseProof = await invoke('inspect_updater_release', {
        bundleDir: rootInfo.bundleDir,
        manifestDir: rootInfo.manifestDir
      });
    } catch (error) {
      releaseProof = {
        bundleDir: rootInfo.bundleDir,
        manifestDir: rootInfo.manifestDir,
        installerFound: false,
        signatureFound: false,
        latestJsonFound: false,
        manifestValid: false,
        trust: 'failed',
        error: String(error)
      };
    }
  }

  try {
    signingEnv = await checkEnvPresence([
      'TAURI_SIGNING_PRIVATE_KEY',
      'TAURI_SIGNING_PRIVATE_KEY_PASSWORD',
      'ALPHONSO_UPDATE_BASE_URL',
      'GITHUB_REPOSITORY',
      'GITHUB_TOKEN'
    ]);
  } catch {
    signingEnv = {};
  }

  const releaseState = collectReleaseReadiness({
    settings,
    workspaceRoot: root || '',
    releaseProof,
    signingEnv,
    updateCheckState
  });
  const durabilityRows = buildDurabilityRows({
    workflowRuns,
    workflowReceipts,
    orchestrationReceipts,
    repoAuditReport,
    workspaceFoundation,
    verificationLogs
  });
  const repoSummary = summarizeRepoAudit(repoAuditReport || getLastRepoAudit());
  const overallState = deriveOverallState({
    readinessRows: [...readinessRows, releaseState, ...durabilityRows],
    releaseState: releaseState.state,
    repoAuditReport
  });

  const connectorSummary = summarizeReadiness(readinessRows);
  const report = {
    id: `production-readiness-${generatedAtMs}`,
    generatedAtMs,
    root: root || '',
    repoAudit: repoAuditReport || getLastRepoAudit(),
    repoAuditSummary: repoSummary,
    releaseProof,
    signingEnv: {
      TAURI_SIGNING_PRIVATE_KEY: Boolean(signingEnv.TAURI_SIGNING_PRIVATE_KEY),
      ALPHONSO_UPDATE_BASE_URL: Boolean(signingEnv.ALPHONSO_UPDATE_BASE_URL),
      GITHUB_REPOSITORY: Boolean(signingEnv.GITHUB_REPOSITORY),
      GITHUB_TOKEN: Boolean(signingEnv.GITHUB_TOKEN)
    },
    updateCheckState,
    readinessRows: [...readinessRows, releaseState, ...durabilityRows],
    connectorSummary,
    workflowSummary: {
      runs: workflowRuns.length,
      receipts: workflowReceipts.length,
      orchestrationReceipts: orchestrationReceipts.length
    },
    overallState,
    trust: overallState === 'ready' ? TRUST_STATES.VERIFIED : overallState === 'failed' || overallState === 'blocked' ? TRUST_STATES.FAILED : TRUST_STATES.UNVERIFIED,
    blockedCount: repoSummary.blockerCount,
    partialCount: repoSummary.partialCount,
    needsSetupCount: repoSummary.needsSetupCount,
    issueCount: repoSummary.issueCount,
    liveBlockers: [
      ...(repoSummary.blockerFiles || []),
      ...(['blocked', 'failed'].includes(releaseState.state) ? ['release / updater'] : [])
    ].slice(0, 20),
    releaseState,
    durabilityRows
  };

  saveReport(report);
  return report;
}

export function summarizeProductionReadiness(report) {
  if (!report) {
    return {
      overallState: 'unknown',
      blockerCount: 0,
      issueCount: 0,
      needsSetupCount: 0,
      workflowReady: 'unknown',
      releaseReady: 'unknown'
    };
  }

  return {
    overallState: normalizeState(report.overallState),
    blockerCount: Number(report.blockedCount || 0),
    issueCount: Number(report.issueCount || 0),
    needsSetupCount: Number(report.needsSetupCount || 0),
    workflowReady: report.durabilityRows?.find((row) => row.id === 'workflow_durability')?.state || 'unknown',
    releaseReady: report.releaseState?.state || 'unknown'
  };
}

export function getProductionReadinessStateLabel(state) {
  const normalized = normalizeState(state);
  if (normalized === 'ready') return 'ready';
  if (normalized === 'partial') return 'partial';
  if (normalized === 'setup_required') return 'setup_required';
  if (normalized === 'blocked') return 'blocked';
  if (normalized === 'failed') return 'failed';
  return 'unknown';
}
