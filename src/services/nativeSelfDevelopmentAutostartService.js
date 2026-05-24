import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { getDefaultWorkspaceRoot } from './workspaceRootService';
import { getVerificationLogs } from './verificationService';
import { getWorkspaceFoundation } from './workspaceIntelligenceService';
import { runSelfDevelopmentCycle } from './selfDevelopmentService';
import { PROOF_AUTHORITY } from './nativeRc0ProofService';
import { timestampMs } from './trustModel';

const SETTINGS_KEY = 'alphonso_settings';
const PROOF_STATE_KEY = 'alphonso_native_selfdev_proof';
const AUTOSTART_FLAG_KEY = 'alphonso_native_selfdev_autostart_running';

function readStoredJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

async function readRuntimeEnvValue(name) {
  try {
    const proof = await invoke('read_runtime_env_value', { name });
    return String(proof?.value || '').trim();
  } catch {
    return '';
  }
}

async function emitProofStage(stageFileName, payload = {}) {
  const workspaceRoot = String(payload.workspaceRoot || payload.workspace_root || getDefaultWorkspaceRoot() || '').trim();
  if (!workspaceRoot) return null;

  const stage = String(stageFileName || '').replace(/\.json$/i, '');
  const content = {
    timestamp: new Date().toISOString(),
    stage,
    status: payload.status || 'recorded',
    processId: payload.processId ?? null,
    workspaceRoot,
    error: payload.error ?? null,
    durationMs: payload.durationMs ?? null,
    ...payload
  };

  try {
    void emit('alphonso-native-proof-stage', {
      fileName: stageFileName,
      ...content
    });
  } catch {
    // Native proof should still continue via the file-write bridge below.
  }

  try {
    void invoke('write_workspace_text_file', {
      workspaceRoot,
      relativePath: `release/rc0/proof/${stageFileName}`,
      content: JSON.stringify(content, null, 2)
    });
    return content;
  } catch {
    return null;
  }
}

function markProofState(value) {
  try {
    localStorage.setItem(PROOF_STATE_KEY, JSON.stringify(value));
  } catch {
    // ignore localStorage failures in native proof bootstrap
  }
}

function markAutostartFlag(value) {
  try {
    localStorage.setItem(AUTOSTART_FLAG_KEY, value ? '1' : '0');
  } catch {
    // ignore localStorage failures in native proof bootstrap
  }
  window.__ALPHONSO_NATIVE_SELFDEV_AUTORUN_RUNNING__ = Boolean(value);
}

export function isNativeSelfDevelopmentAutostartRunning() {
  return Boolean(window.__ALPHONSO_NATIVE_SELFDEV_AUTORUN_RUNNING__);
}

export async function startNativeSelfDevelopmentAutostart() {
  if (typeof window === 'undefined') return { started: false, reason: 'window_unavailable' };
  if (isNativeSelfDevelopmentAutostartRunning()) return { started: false, reason: 'already_running' };
  const rc0ProofValue = await readRuntimeEnvValue('ALPHONSO_RC0_PROOF');
  if (rc0ProofValue === '1') {
    return { started: false, reason: 'rc0_proof_mode_active' };
  }

  const storedSettings = readStoredJson(SETTINGS_KEY, {});
  const proofWorkspaceRoot = String(storedSettings?.workspaceRoot || getDefaultWorkspaceRoot() || '').trim() || getDefaultWorkspaceRoot();
  const startedAtMs = timestampMs();

  markAutostartFlag(true);
  markProofState({
    runtime: 'native_tauri',
    proofMode: 'automated_native',
    autorun: true,
    state: 'running',
    workspaceRoot: proofWorkspaceRoot,
    workspaceRootValid: null,
    filesScanned: 0,
    p0Count: 0,
    p1Count: 0,
    p2Count: 0,
    exportPath: null,
    proofReceiptsWritten: false,
    timestampMs: startedAtMs,
    note: 'Native proof bootstrap started before React mounted.'
  });

  await emitProofStage('05_autorun_effect_started.json', {
    status: 'running',
    workspaceRoot: proofWorkspaceRoot,
    note: 'Native proof bootstrap started before React mounted.'
  });

  const autorunValue = await readRuntimeEnvValue('ALPHONSO_SELFDEV_AUTORUN');
  const exitValue = await readRuntimeEnvValue('ALPHONSO_SELFDEV_EXIT_ON_COMPLETE');

  await emitProofStage('05_autorun_env_checked.json', {
    status: autorunValue === '1' ? 'ready' : 'setup_required',
    workspaceRoot: proofWorkspaceRoot,
    note: autorunValue === '1'
      ? 'Autorun env detected by the native proof bootstrap.'
      : 'Autorun env not enabled or not readable in the native proof bootstrap.',
    autorunValue: autorunValue === '1',
    exitValue: exitValue === '1'
  });

  if (autorunValue !== '1') {
    const skipped = {
      runtime: 'native_tauri',
      proofMode: 'automated_native',
      autorun: false,
      state: 'setup_required',
      workspaceRoot: proofWorkspaceRoot,
      workspaceRootValid: null,
      filesScanned: 0,
      p0Count: 0,
      p1Count: 0,
      p2Count: 0,
      exportPath: null,
      proofReceiptsWritten: false,
      timestampMs: timestampMs(),
      note: 'ALPHONSO_SELFDEV_AUTORUN is not enabled in this native runtime.'
    };
    markProofState(skipped);
    await emitProofStage('proof_error.json', {
      stage: 'native_autorun',
      status: 'setup_required',
      workspaceRoot: proofWorkspaceRoot,
      error: skipped.note
    });
    return { started: true, state: skipped.state, reason: skipped.note };
  }

  await emitProofStage('05_autorun_triggered.json', {
    status: 'running',
    workspaceRoot: proofWorkspaceRoot,
    note: 'Native autorun branch reached before workspace validation.'
  });

  try {
    const cycle = await runSelfDevelopmentCycle({
      root: proofWorkspaceRoot,
      settings: storedSettings,
      updateCheckState: { checking: false, checkedAtMs: startedAtMs },
      verificationLogs: getVerificationLogs(),
      workspaceFoundation: getWorkspaceFoundation(),
      proofHooks: {
        writeStage: emitProofStage
      }
    });

    const proof = {
      runtime: 'native_tauri',
      proofAuthority: PROOF_AUTHORITY.JS_BRIDGE,
      proofMode: 'automated_native',
      autorun: true,
      state: 'partial',
      workspaceRoot: cycle?.root || proofWorkspaceRoot,
      workspaceRootValid: Boolean(cycle?.validation?.ok),
      filesScanned: Number(cycle?.auditSummary?.filesScanned || 0),
      p0Count: Number(cycle?.auditSummary?.blockerCount || 0),
      p1Count: Number(cycle?.readinessSummary?.partialCount || 0),
      p2Count: Number(cycle?.readinessSummary?.needsSetupCount || 0),
      topPackets: Array.isArray(cycle?.packets) ? cycle.packets.slice(0, 10).map((packet) => ({
        id: packet.id,
        title: packet.title,
        priority: packet.priority,
        riskLevel: packet.riskLevel
      })) : [],
      exportPath: cycle?.exportProof?.file_path || cycle?.exportProof?.filePath || null,
      proofReceiptsWritten: false,
      rc0Proof: cycle?.rc0Proof || null,
      timestampMs: cycle?.generatedAtMs || timestampMs(),
      note: cycle?.rc0Error
        ? `JS bridge RC0 export error: ${cycle.rc0Error}`
        : 'JS bridge scan recorded. Rust RC0 engine and release/rc0/proof/*.json remain proof authority.'
    };

    markProofState(proof);
    await emitProofStage('native-selfdev-complete.json', {
      status: proof.state,
      workspaceRoot: proof.workspaceRoot,
      filesScanned: proof.filesScanned,
      p0Count: proof.p0Count,
      p1Count: proof.p1Count,
      p2Count: proof.p2Count,
      exportPath: proof.exportPath,
      note: proof.note
    });

    return { started: true, state: proof.state, cycle };
  } catch (error) {
    const failed = {
      runtime: 'native_tauri',
      proofMode: 'automated_native',
      autorun: true,
      state: 'failed',
      workspaceRoot: proofWorkspaceRoot,
      workspaceRootValid: false,
      filesScanned: 0,
      p0Count: 0,
      p1Count: 0,
      p2Count: 0,
      exportPath: null,
      proofReceiptsWritten: false,
      timestampMs: timestampMs(),
      error: String(error)
    };
    markProofState(failed);
    await emitProofStage('proof_error.json', {
      stage: 'native_autorun',
      status: 'failed',
      workspaceRoot: proofWorkspaceRoot,
      error: String(error)
    });
    return { started: true, state: failed.state, error: failed.error };
  } finally {
    if (String(exitValue) === '1') {
      try {
        window.close();
      } catch {
        // ignore close failures for supervised proof mode
      }
    }
    markAutostartFlag(false);
  }
}
