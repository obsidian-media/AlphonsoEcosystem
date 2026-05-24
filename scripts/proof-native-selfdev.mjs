import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const PROJECT_ROOT = process.cwd();
const APP_EXE = join(PROJECT_ROOT, 'src-tauri', 'target', 'release', 'app.exe');
const RC0_DIR = join(PROJECT_ROOT, 'release', 'rc0');
const PROOF_DIR = join(RC0_DIR, 'proof');
const HANDOFF_DIR = join(PROJECT_ROOT, 'docs', 'handoff');
const DEFAULT_TIMEOUT_MS = 600000;

const STAGES = [
  '01_process_started.json',
  '02_env_detected.json',
  '03_tauri_started.json',
  '04_frontend_loaded.json',
  '05_native_proof_engine_started.json',
  '06_workspace_validated.json',
  '07_scan_started.json',
  '08_scan_completed.json',
  '09_packets_generated.json',
  '10_rc0_package_written.json'
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function stagePath(fileName) {
  return join(PROOF_DIR, fileName);
}

function latestMatchingFile(dir, prefix, suffix, minMtimeMs = 0) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(suffix))
    .map((name) => {
      const filePath = join(dir, name);
      try {
        return { filePath, mtimeMs: statSync(filePath).mtimeMs };
      } catch {
        return { filePath, mtimeMs: 0 };
      }
    })
    .filter((entry) => entry.mtimeMs >= minMtimeMs)
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  return files[0]?.filePath || null;
}

function writeProofRequest(workspaceRoot, outputDir) {
  writeJson(join(RC0_DIR, 'proof-request.json'), {
    mode: 'native-rc0',
    workspaceRoot,
    outputDir,
    createdAt: new Date().toISOString()
  });
}

function cleanProofArtifacts() {
  for (const fileName of [
    'native-proof-run-status.json',
    'proof-timeout-report.md',
    'proof-request.json',
    ...STAGES,
    'proof_error.json'
  ]) {
    const filePath = fileName.startsWith('0') || fileName === 'proof_error.json'
      ? stagePath(fileName)
      : join(RC0_DIR, fileName);
    if (existsSync(filePath)) {
      try {
        unlinkSync(filePath);
      } catch {}
    }
  }
}

function stageSummary(fileName, startedAtMs) {
  const filePath = stagePath(fileName);
  if (!existsSync(filePath)) {
    return { fileName, filePath, present: false, timestampMs: null };
  }
  try {
    const stats = statSync(filePath);
    return {
      fileName,
      filePath,
      present: stats.mtimeMs >= startedAtMs,
      timestampMs: stats.mtimeMs
    };
  } catch {
    return { fileName, filePath, present: false, timestampMs: null };
  }
}

async function waitForStage(fileName, timeoutMs, startedAtMs, isChildExited) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const summary = stageSummary(fileName, startedAtMs);
    if (summary.present) {
      return summary;
    }
    if (isChildExited()) {
      return summary;
    }
    await sleep(1000);
  }
  return stageSummary(fileName, startedAtMs);
}

function stagePayload(fileName, startedAtMs, extra = {}) {
  const stage = fileName.replace(/\.json$/i, '');
  return {
    timestamp: new Date().toISOString(),
    stage,
    status: extra.status || 'recorded',
    processId: extra.processId ?? null,
    workspaceRoot: extra.workspaceRoot || PROJECT_ROOT,
    error: extra.error ?? null,
    durationMs: typeof extra.durationMs === 'number' ? extra.durationMs : null,
    ...extra
  };
}

function writeTimeoutReport({
  lastCompletedStage,
  nextExpectedStage,
  childExitCode,
  childExitSignal,
  stageSummaries,
  probableCause,
  nextFixRecommendation,
  startedAtMs
}) {
  const content = [
    '# Native Proof Timeout Report',
    '',
    `- last completed stage: ${lastCompletedStage || 'none'}`,
    `- expected next sentinel: ${nextExpectedStage || 'none'}`,
    `- child exit code: ${childExitCode === null ? 'running' : childExitCode}`,
    `- child exit signal: ${childExitSignal || 'none'}`,
    `- probable cause: ${probableCause || 'unknown'}`,
    `- next fix recommendation: ${nextFixRecommendation || 'review native proof startup path'}`,
    '',
    '## Stage Status',
    ...stageSummaries.map((summary) => `- ${summary.fileName}: ${summary.present ? 'present' : 'missing'}${summary.timestampMs ? ` @ ${new Date(summary.timestampMs).toISOString()}` : ''}`),
    '',
    `Generated: ${new Date().toISOString()}`,
    `Started at: ${new Date(startedAtMs).toISOString()}`
  ].join('\n') + '\n';
  writeJson(join(RC0_DIR, 'native-proof-run-status.json'), {
    runtime: 'native_tauri',
    timestamp: new Date().toISOString(),
    started: true,
    complete: false,
    error: true,
    lastCompletedStage,
    nextExpectedStage,
    childExitCode,
    childExitSignal,
    probableCause,
    nextFixRecommendation,
    stageSummaries,
    timeoutReportPath: join(RC0_DIR, 'proof-timeout-report.md')
  });
  ensureDir(join(RC0_DIR, 'proof-timeout-report.md'));
  writeFileSync(join(RC0_DIR, 'proof-timeout-report.md'), content, 'utf8');
}

function probableCauseFromStage(stageName) {
  switch (stageName) {
    case '01_process_started.json':
      return 'The native app process did not stay alive long enough for Tauri startup or the launcher exited early.';
    case '02_env_detected.json':
      return 'The Rust startup hook did not detect the RC0 proof environment or proof request.';
    case '03_tauri_started.json':
      return 'Tauri setup ran, but the native proof engine was not started.';
    case '04_frontend_loaded.json':
      return 'The frontend mounted, but the Rust proof engine never began its own stage writes.';
    case '05_native_proof_engine_started.json':
      return 'The native RC0 proof engine never wrote its startup sentinel.';
    case '06_workspace_validated.json':
      return 'Workspace validation did not complete or the workspace root was invalid.';
    case '07_scan_started.json':
      return 'Validation completed, but the scan did not start.';
    case '08_scan_completed.json':
      return 'The repo audit stalled before completing.';
    case '09_packets_generated.json':
      return 'The scan completed, but packet generation stalled.';
    case '10_rc0_package_written.json':
      return 'The RC0 package write stalled after the export path.';
    default:
      return 'Unknown stage boundary.';
  }
}

function nextFixFromStage(stageName) {
  switch (stageName) {
    case '01_process_started.json':
      return 'Inspect the native app launch path and early startup logs.';
    case '02_env_detected.json':
      return 'Verify ALPHONSO_RC0_PROOF and proof-request propagation into the native process.';
    case '03_tauri_started.json':
      return 'Check why the Rust proof engine did not start from the Tauri setup hook.';
    case '04_frontend_loaded.json':
      return 'Inspect the Rust proof engine bootstrap and stage-writing path.';
    case '05_native_proof_engine_started.json':
      return 'Inspect the startup hook and the proof-request/env gating in Rust.';
    case '06_workspace_validated.json':
      return 'Validate workspace root resolution and proof-stage write permissions.';
    case '07_scan_started.json':
      return 'Inspect validateWorkspaceRoot and scan kickoff timing.';
    case '08_scan_completed.json':
      return 'Audit repo scanning for long-running or blocked filesystem work.';
    case '09_packets_generated.json':
      return 'Audit packet grouping and generation for stalls.';
    case '10_rc0_package_written.json':
      return 'Inspect RC0 package writing and workspace artifact paths.';
    default:
      return 'Review the latest stage file and native proof logs.';
  }
}

function childProcessStatus(exitCode, exitSignal) {
  if (exitCode === null && exitSignal === null) return 'running';
  if (exitCode === 0) return 'exited_success';
  return 'exited_nonzero';
}

async function main() {
  mkdirSync(PROOF_DIR, { recursive: true });
  mkdirSync(HANDOFF_DIR, { recursive: true });
  if (!existsSync(APP_EXE)) {
    throw new Error(`Native app executable not found at ${APP_EXE}. Run npm.cmd run build and npx.cmd tauri build first.`);
  }

  const startedAtMs = Date.now();
  const workspaceRoot = PROJECT_ROOT;
  const outputDir = RC0_DIR;
  cleanProofArtifacts();
  writeProofRequest(workspaceRoot, outputDir);

  const child = spawn(APP_EXE, [], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      ALPHONSO_RC0_PROOF: '1',
      ALPHONSO_WORKSPACE_ROOT: workspaceRoot,
      ALPHONSO_PROOF_OUTPUT_DIR: outputDir
    },
    stdio: 'inherit',
    windowsHide: true
  });

  const processStartedPayload = stagePayload('01_process_started.json', startedAtMs, {
    status: 'running',
    processId: child.pid || null,
    workspaceRoot,
    outputDir,
    proofRequestFound: true
  });
  writeJson(stagePath('01_process_started.json'), processStartedPayload);

  let exitCode = null;
  let exitSignal = null;
  child.on('exit', (code, signal) => {
    exitCode = code;
    exitSignal = signal;
  });

  const stageDefinitions = [
    { fileName: '02_env_detected.json', timeoutMs: 30000 },
    { fileName: '03_tauri_started.json', timeoutMs: 60000 },
    { fileName: '04_frontend_loaded.json', timeoutMs: 90000 },
    { fileName: '05_native_proof_engine_started.json', timeoutMs: 90000 },
    { fileName: '06_workspace_validated.json', timeoutMs: 90000 },
    { fileName: '07_scan_started.json', timeoutMs: 90000 },
    { fileName: '08_scan_completed.json', timeoutMs: 300000 },
    { fileName: '09_packets_generated.json', timeoutMs: 120000 },
    { fileName: '10_rc0_package_written.json', timeoutMs: 120000 }
  ];

  const stageSummaries = [stageSummary('01_process_started.json', startedAtMs)];
  let lastCompletedStage = '01_process_started.json';
  let timeoutStage = null;

  for (const stage of stageDefinitions) {
    const summary = await waitForStage(stage.fileName, stage.timeoutMs, startedAtMs, () => exitCode !== null);
    stageSummaries.push(summary);
    if (!summary.present) {
      timeoutStage = stage.fileName;
      break;
    }
    lastCompletedStage = stage.fileName;
  }

  if (timeoutStage) {
    const nextExpectedStage = timeoutStage;
    const probableCause = probableCauseFromStage(timeoutStage);
    const nextFixRecommendation = nextFixFromStage(timeoutStage);
    writeTimeoutReport({
      lastCompletedStage,
      nextExpectedStage,
      childExitCode: exitCode,
      childExitSignal: exitSignal,
      stageSummaries,
      probableCause,
      nextFixRecommendation,
      startedAtMs
    });
    writeJson(join(RC0_DIR, 'native-proof-run-status.json'), {
      runtime: 'native_tauri',
      timestamp: new Date().toISOString(),
      started: true,
      complete: false,
      error: true,
      lastCompletedStage,
      nextExpectedStage,
      childExitCode: exitCode,
      childExitSignal: exitSignal,
      childStatus: childProcessStatus(exitCode, exitSignal),
      probableCause,
      nextFixRecommendation,
      proofArtifacts: stageSummaries.filter((summary) => summary.present).map((summary) => summary.filePath),
      timeoutStage
    });
    try {
      child.kill();
    } catch {}
    throw new Error(`Timed out waiting for ${timeoutStage}. Last completed stage: ${lastCompletedStage}.`);
  }

  const proofFiles = STAGES.map((fileName) => stagePath(fileName));
  const proofArtifacts = [
    ...proofFiles,
    join(RC0_DIR, 'self-development-proof.md'),
    join(RC0_DIR, 'self-development-packets.json'),
    join(RC0_DIR, 'production-readiness.json'),
    join(RC0_DIR, 'connector-readiness.json'),
    join(RC0_DIR, 'updater-readiness.json'),
    join(RC0_DIR, 'workflow-durability-proof.md'),
    join(RC0_DIR, 'verification-results.md'),
    join(RC0_DIR, 'remaining-blockers.md'),
    join(RC0_DIR, 'install-and-run.md')
  ].filter((filePath) => existsSync(filePath));

  const packetsPath = join(RC0_DIR, 'self-development-packets.json');
  const productionPath = join(RC0_DIR, 'production-readiness.json');
  const proof = {
    proofPath: join(RC0_DIR, 'self-development-proof.md'),
    packetsPath,
    productionPath,
    handoffProofPath: latestMatchingFile(HANDOFF_DIR, 'ALPHONSO_NATIVE_SELFDEV_PROOF_', '.md', startedAtMs),
    handoffPacketsPath: latestMatchingFile(HANDOFF_DIR, 'ALPHONSO_SELFDEV_PACKETS_', '.json', startedAtMs),
    handoffProductionPath: latestMatchingFile(HANDOFF_DIR, 'ALPHONSO_PRODUCTION_READINESS_SNAPSHOT_', '.json', startedAtMs)
  };

  const packets = readJsonIfExists(proof.packetsPath) || [];
  const production = readJsonIfExists(proof.productionPath) || {};

  try {
    child.kill();
  } catch {}

  const summary = {
    runtime: 'native_tauri',
    timestamp: new Date().toISOString(),
    appExecutable: APP_EXE,
    exitCode,
    exitSignal,
    childStatus: childProcessStatus(exitCode, exitSignal),
    proof,
    filesScanned: Number(production.filesScanned || 0),
    p0Count: Number(production.p0Count || 0),
    p1Count: Number(production.p1Count || 0),
    p2Count: Number(production.p2Count || 0),
    topPackets: Array.isArray(packets) ? packets.slice(0, 10).map((packet) => ({
      id: packet.id,
      title: packet.title,
      priority: packet.priority,
      riskLevel: packet.riskLevel,
      files: Array.isArray(packet.files) ? packet.files : []
    })) : [],
    proofArtifacts
  };

  writeJson(join(RC0_DIR, 'native-proof-run-status.json'), {
    runtime: 'native_tauri',
    timestamp: new Date().toISOString(),
    started: true,
    complete: true,
    error: false,
    lastCompletedStage: '10_rc0_package_written.json',
    proofArtifacts,
    childStatus: childProcessStatus(exitCode, exitSignal)
  });

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  writeJson(join(RC0_DIR, 'native-proof-run-status.json'), {
    runtime: 'native_tauri',
    timestamp: new Date().toISOString(),
    started: false,
    complete: false,
    error: true,
    message: String(error)
  });
  process.stderr.write(`[proof-native-selfdev] Failed: ${String(error)}\n`);
  process.exit(1);
});
