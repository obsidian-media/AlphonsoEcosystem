import { invoke } from '@tauri-apps/api/core';
import { TRUST_STATES, timestampMs } from './trustModel';
import { persistScopeRows } from './runtimeLedgerService';

const LOG_KEY = 'alphonso_verification_logs_v1';
export const VERIFICATION_SCOPE = 'verification_logs_v1';

function readLogs() {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLogs(logs) {
  const rows = logs.slice(-250);
  localStorage.setItem(LOG_KEY, JSON.stringify(rows));
  persistScopeRows(VERIFICATION_SCOPE, rows, (row) => ({
    id: row.id,
    data: row,
    status: row.type || 'verification_log',
    confidence: row.trust || TRUST_STATES.TEMPORARY,
    verificationState: row.trust || TRUST_STATES.UNVERIFIED,
    timestampMs: Number(row.timestampMs || timestampMs())
  }));
}

export function getVerificationLogs() {
  return readLogs();
}

export function appendVerificationLog(entry) {
  const logs = readLogs();
  const payload = {
    id: `proof-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestampMs: timestampMs(),
    ...entry
  };
  logs.push(payload);
  writeLogs(logs);
  invoke('append_audit_log', {
    eventType: payload.type || 'verification_log',
    entry: payload
  }).catch(() => {
    // Fallback to local logs only when Tauri backend is unavailable.
  });
  return payload;
}

export async function readDurableAuditLog(limit = 200) {
  try {
    return await invoke('read_audit_log', { limit });
  } catch {
    return [];
  }
}

export async function verifyDurableAuditChain() {
  const startedAt = timestampMs();
  try {
    const payload = await invoke('verify_audit_chain');
    return appendVerificationLog({
      type: 'audit_chain_verification',
      source: 'tauri-command',
      trust: payload?.trust || TRUST_STATES.UNVERIFIED,
      startedAt,
      finishedAt: timestampMs(),
      payload
    });
  } catch (error) {
    return appendVerificationLog({
      type: 'audit_chain_verification',
      source: 'tauri-command',
      trust: TRUST_STATES.FAILED,
      startedAt,
      finishedAt: timestampMs(),
      payload: {
        error: String(error)
      }
    });
  }
}

export async function verifyOllamaRuntimeProof(endpoint) {
  const startedAt = timestampMs();

  try {
    const proof = await invoke('check_ollama_runtime', {
      endpoint
    });

    return appendVerificationLog({
      type: 'runtime_proof',
      source: 'tauri-command',
      trust: proof.reachable ? TRUST_STATES.VERIFIED : TRUST_STATES.FAILED,
      startedAt,
      finishedAt: timestampMs(),
      payload: proof
    });
  } catch (error) {
    return appendVerificationLog({
      type: 'runtime_proof',
      source: 'tauri-command',
      trust: TRUST_STATES.FAILED,
      startedAt,
      finishedAt: timestampMs(),
      payload: {
        error: String(error)
      }
    });
  }
}

export async function listOllamaModels(endpoint) {
  const startedAt = timestampMs();

  try {
    const proof = await invoke('ollama_list_models', {
      endpoint
    });

    return appendVerificationLog({
      type: 'runtime_models',
      source: 'tauri-command',
      trust: Array.isArray(proof?.models) && proof.models.length > 0 ? TRUST_STATES.VERIFIED : TRUST_STATES.UNVERIFIED,
      startedAt,
      finishedAt: timestampMs(),
      payload: proof
    });
  } catch (error) {
    return appendVerificationLog({
      type: 'runtime_models',
      source: 'tauri-command',
      trust: TRUST_STATES.FAILED,
      startedAt,
      finishedAt: timestampMs(),
      payload: {
        error: String(error)
      }
    });
  }
}

export function buildOllamaStartupGuide({
  ollamaStatus,
  models = [],
  selectedModel = ''
}) {
  const modelNames = Array.isArray(models)
    ? models.map((model) => (typeof model === 'string' ? model : model?.name)).filter(Boolean)
    : [];
  const selected = String(selectedModel || '').trim();
  const connected = ollamaStatus?.state === 'connected';
  const installed = selected ? modelNames.includes(selected) : modelNames.length > 0;
  const activeModel = selected || modelNames[0] || 'llama3.1';

  if (!connected) {
    return {
      title: 'Start Ollama locally',
      summary: 'Alphonso cannot generate until Ollama is reachable on this machine.',
      status: 'needs_runtime',
      command: 'ollama serve',
      steps: [
        'Open a local terminal on the same machine.',
        'Run `ollama serve` and keep the process alive.',
        'If the service is already installed, verify it is bound to the expected local port.',
        selected ? `After Ollama is up, pull the selected model with \`ollama pull ${selected}\`.` : 'After Ollama is up, pull a model you want Alphonso to use.'
      ]
    };
  }

  if (!modelNames.length) {
    return {
      title: 'Pull a local model',
      summary: 'Ollama is reachable, but no models are installed yet.',
      status: 'needs_model',
      command: `ollama pull ${activeModel}`,
      steps: [
        `Run \`ollama pull ${activeModel}\` on this machine.`,
        'Return to the model selector after the pull finishes.',
        'Then re-run the runtime check and try generation again.'
      ]
    };
  }

  if (selected && !installed) {
    return {
      title: 'Selected model not installed',
      summary: `The runtime is up, but the selected model "${selected}" is not present in the local inventory.`,
      status: 'needs_model',
      command: `ollama pull ${selected}`,
      steps: [
        `Run \`ollama pull ${selected}\` to install the chosen model.`,
        'Or switch Alphonso to one of the installed models shown below.',
        'After the pull, re-run the runtime check before testing chat or generation.'
      ]
    };
  }

  return {
    title: 'Ollama is ready',
    summary: `The runtime is reachable and ${installed ? `model "${activeModel}" is available` : 'a local model is available'}.`,
    status: 'ready',
    command: null,
    steps: [
      `Use \`${activeModel}\` in Alphonso for local generation.`,
      'If generation stalls, rerun the runtime check and verify the selected model still appears in the local list.'
    ]
  };
}

export async function verifyProcessProof(names) {
  const startedAt = timestampMs();

  try {
    const payload = await invoke('check_processes', {
      names
    });
    return appendVerificationLog({
      type: 'process_proof',
      source: 'tauri-command',
      trust: TRUST_STATES.VERIFIED,
      startedAt,
      finishedAt: timestampMs(),
      payload
    });
  } catch (error) {
    return appendVerificationLog({
      type: 'process_proof',
      source: 'tauri-command',
      trust: TRUST_STATES.FAILED,
      startedAt,
      finishedAt: timestampMs(),
      payload: {
        names,
        error: String(error)
      }
    });
  }
}

export async function verifyPathProof(paths) {
  const startedAt = timestampMs();

  try {
    const payload = await invoke('verify_paths', {
      paths
    });
    return appendVerificationLog({
      type: 'filesystem_proof',
      source: 'tauri-command',
      trust: TRUST_STATES.VERIFIED,
      startedAt,
      finishedAt: timestampMs(),
      payload
    });
  } catch (error) {
    return appendVerificationLog({
      type: 'filesystem_proof',
      source: 'tauri-command',
      trust: TRUST_STATES.FAILED,
      startedAt,
      finishedAt: timestampMs(),
      payload: {
        paths,
        error: String(error)
      }
    });
  }
}

export async function verifyCommandExecution(program, args, cwd = null) {
  const startedAt = timestampMs();

  try {
    const payload = await invoke('execute_command_verified', {
      program,
      args,
      cwd
    });
    return appendVerificationLog({
      type: 'command_execution',
      source: 'tauri-command',
      trust: payload.success ? TRUST_STATES.VERIFIED : TRUST_STATES.FAILED,
      startedAt,
      finishedAt: timestampMs(),
      payload
    });
  } catch (error) {
    return appendVerificationLog({
      type: 'command_execution',
      source: 'tauri-command',
      trust: TRUST_STATES.FAILED,
      startedAt,
      finishedAt: timestampMs(),
      payload: {
        program,
        args,
        cwd,
        error: String(error)
      }
    });
  }
}
