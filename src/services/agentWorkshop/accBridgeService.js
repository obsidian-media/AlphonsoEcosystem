import { invoke } from '@tauri-apps/api/core';
import { writeWorkspaceArtifact } from '../workspaceArtifactService';
import { timestampMs } from '../trustModel';
import { randomHex } from '../../lib/randomId';

const BRIDGE_CONFIG_KEY = 'alphonso_acc_bridge_config_v1';
const BRIDGE_PACKET_KEY = 'alphonso_acc_bridge_packets_v1';
const DEFAULT_PATH_PREFIX = '/api/alphonso-bridge';
const DEFAULT_TIMEOUT_MS = 15000;

const DEFAULT_CONFIG = {
  enabled: false,
  baseUrl: '',
  pathPrefix: DEFAULT_PATH_PREFIX,
  token: '',
  timeoutMs: DEFAULT_TIMEOUT_MS
};

function nowIso() {
  return new Date().toISOString();
}

function safeStorage() {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function readJson(key, fallback) {
  const storage = safeStorage();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  const storage = safeStorage();
  if (!storage) return value;
  storage.setItem(key, JSON.stringify(value));
  return value;
}

function trimTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function normalizePathPrefix(value) {
  const text = String(value || '').trim();
  if (!text) return DEFAULT_PATH_PREFIX;
  return text.startsWith('/') ? text : `/${text}`;
}

function mergeConfig(next = {}) {
  const current = getAccBridgeConfig();
  const merged = {
    ...current,
    ...next,
    baseUrl: trimTrailingSlash(next.baseUrl ?? current.baseUrl),
    pathPrefix: normalizePathPrefix(next.pathPrefix ?? current.pathPrefix),
    token: String(next.token ?? current.token ?? '').trim(),
    timeoutMs: Number(next.timeoutMs || current.timeoutMs || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
  };
  merged.enabled = Boolean(next.enabled ?? current.enabled);
  return merged;
}

function appendPacket(packet) {
  const rows = readJson(BRIDGE_PACKET_KEY, []);
  rows.push(packet);
  writeJson(BRIDGE_PACKET_KEY, rows.slice(-120));
  return packet;
}

function replacePacket(packetId, updates) {
  const rows = readJson(BRIDGE_PACKET_KEY, []);
  const nextRows = rows.map((row) => (
    row.id === packetId
      ? { ...row, ...updates, updatedAt: nowIso(), updatedAtMs: timestampMs() }
      : row
  ));
  writeJson(BRIDGE_PACKET_KEY, nextRows.slice(-120));
  return nextRows.find((row) => row.id === packetId) || null;
}

function createPacketId(prefix) {
  return `${prefix}-${Date.now()}-${randomHex(6)}`;
}

function buildPacket(kind, payload = {}, options = {}) {
  return {
    id: createPacketId(kind),
    kind,
    source: 'alphonso-content-catalyst',
    status: 'queued',
    remoteStatus: 'pending',
    jobId: options.jobId || payload?.jobId || payload?.job_id || null,
    workflowId: options.workflowId || payload?.workflowId || 'content-catalyst',
    workspaceRoot: options.workspaceRoot || null,
    requestId: options.requestId || payload?.requestId || null,
    payload,
    bridge: {
      configured: isAccBridgeConfigured(),
      baseUrlConfigured: Boolean(getAccBridgeConfig().baseUrl),
      tokenConfigured: Boolean(getAccBridgeConfig().token),
      pathPrefix: getAccBridgeConfig().pathPrefix
    },
    createdAt: nowIso(),
    createdAtMs: timestampMs(),
    updatedAt: nowIso(),
    updatedAtMs: timestampMs()
  };
}

async function writePacketArtifact(packet, workspaceRoot) {
  if (!workspaceRoot) return null;
  return writeWorkspaceArtifact({
    workspaceRoot,
    relativePath: `release/content-catalyst/bridge/${packet.id}.json`,
    content: JSON.stringify(packet, null, 2)
  });
}

/**
 * The saved Settings, in the shape the backend bridge commands take. Until
 * 2026-10-22 the backend read only environment variables, so a bridge set up
 * in Settings always failed there and only worked through the window
 * fallback below (QA Bug 64).
 */
function backendArgs(config = getAccBridgeConfig()) {
  return {
    baseUrl: config.baseUrl || null,
    token: config.token || null,
    pathPrefix: config.pathPrefix || null,
    timeoutMs: Number(config.timeoutMs) || null
  };
}

async function postPacket(packet, config) {
  try {
    const backendResult = await invoke('alphonso_bridge_send_packet', { packet, ...backendArgs(config) });
    if (backendResult == null) throw new Error('Tauri invoke returned empty');
    return {
      ok: Boolean(backendResult?.success ?? backendResult?.ok ?? true),
      httpStatus: backendResult?.httpStatus || 200,
      response: backendResult
    };
  } catch (invokeError) {
    const bridgeUrl = `${trimTrailingSlash(config.baseUrl)}${config.pathPrefix || DEFAULT_PATH_PREFIX}`;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutMs = Math.max(1000, Number(config.timeoutMs || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const response = await fetch(bridgeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.token}`
        },
        body: JSON.stringify(packet),
        signal: controller ? controller.signal : undefined
      });

      const responseText = await response.text();
      let parsedResponse = responseText;
      try {
        parsedResponse = responseText ? JSON.parse(responseText) : null;
      } catch {
        parsedResponse = responseText;
      }

      if (!response.ok) {
        return {
          ok: false,
          httpStatus: response.status,
          response: parsedResponse,
          error: typeof parsedResponse === 'object' && parsedResponse
            ? parsedResponse.error || parsedResponse.message || `HTTP ${response.status}`
            : `HTTP ${response.status}`
        };
      }

      return {
        ok: true,
        httpStatus: response.status,
        response: parsedResponse
      };
    } catch (error) {
      return {
        ok: false,
        error: String(error || invokeError)
      };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
}

export function getAccBridgeConfig() {
  return {
    ...DEFAULT_CONFIG,
    ...readJson(BRIDGE_CONFIG_KEY, {})
  };
}

export function updateAccBridgeConfig(patch = {}) {
  const current = getAccBridgeConfig();
  const next = mergeConfig({ ...current, ...patch });
  writeJson(BRIDGE_CONFIG_KEY, next);
  return next;
}

export function resetAccBridgeConfig() {
  writeJson(BRIDGE_CONFIG_KEY, DEFAULT_CONFIG);
  return getAccBridgeConfig();
}

export function isAccBridgeConfigured() {
  const config = getAccBridgeConfig();
  return Boolean(config.enabled && config.baseUrl && config.token);
}

export function getAccBridgeStatus() {
  const config = getAccBridgeConfig();
  const packets = readJson(BRIDGE_PACKET_KEY, []);
  const lastPacket = packets.length ? packets[packets.length - 1] : null;
  const configured = isAccBridgeConfigured();
  return {
    configured,
    enabled: Boolean(config.enabled),
    status: configured ? 'configured' : 'setup_required',
    baseUrlConfigured: Boolean(config.baseUrl),
    tokenConfigured: Boolean(config.token),
    pathPrefix: config.pathPrefix,
    timeoutMs: config.timeoutMs,
    lastSyncAtMs: lastPacket?.completedAtMs || lastPacket?.updatedAtMs || null,
    lastSyncStatus: lastPacket?.remoteStatus || lastPacket?.status || null,
    lastError: lastPacket?.error || null,
    packetCount: packets.length
  };
}

export async function refreshAccBridgeStatus() {
  const local = getAccBridgeStatus();
  // Turned off in Settings: report off even if environment variables exist.
  if (!local.enabled) return local;
  try {
    const proof = await invoke('alphonso_bridge_status', backendArgs());
    if (proof && typeof proof === 'object') {
      return {
        ...local,
        configured: Boolean(proof.configured),
        status: proof.status || local.status,
        baseUrlConfigured: Boolean(proof.baseUrlConfigured),
        tokenConfigured: Boolean(proof.tokenConfigured),
        pathPrefix: proof.pathPrefix || local.pathPrefix
      };
    }
  } catch {
    // fall through to local snapshot
  }
  return local;
}

/**
 * Ask ACC itself whether it answers and accepts the token (the Test button).
 * status: connected | unauthorized | setup_required_in_acc | unreachable |
 * setup_required | failed.
 */
export async function checkAccBridge() {
  const config = getAccBridgeConfig();
  try {
    const result = await invoke('alphonso_bridge_check', backendArgs(config));
    if (result && typeof result === 'object') return result;
  } catch {
    // Not in the desktop app: ask ACC from the window instead.
  }
  if (!config.baseUrl || !config.token) {
    return { ok: false, reachable: false, status: 'setup_required', error: "ACC's address and token are needed." };
  }
  try {
    const response = await fetch(`${trimTrailingSlash(config.baseUrl)}${config.pathPrefix || DEFAULT_PATH_PREFIX}/status`, {
      headers: { Authorization: `Bearer ${config.token}` }
    });
    const status = response.ok ? 'connected'
      : (response.status === 401 || response.status === 403) ? 'unauthorized'
        : response.status === 503 ? 'setup_required_in_acc' : 'failed';
    return { ok: response.ok, reachable: true, httpStatus: response.status, status };
  } catch (error) {
    return { ok: false, reachable: false, status: 'unreachable', error: String(error) };
  }
}

export function listAccBridgePackets(limit = 20) {
  const rows = readJson(BRIDGE_PACKET_KEY, []);
  return rows
    .slice()
    .reverse()
    .slice(0, Math.max(0, Number(limit) || 20));
}

export async function syncBridgePacket(kind, payload = {}, options = {}) {
  const config = getAccBridgeConfig();
  const packet = buildPacket(kind, payload, options);
  appendPacket(packet);
  await writePacketArtifact(packet, options.workspaceRoot);

  if (!isAccBridgeConfigured()) {
    const settled = replacePacket(packet.id, {
      status: 'setup_required',
      remoteStatus: 'not_wired',
      error: 'ACC bridge is not configured.',
      completedAtMs: timestampMs()
    }) || {
      ...packet,
      status: 'setup_required',
      remoteStatus: 'not_wired',
      error: 'ACC bridge is not configured.',
      completedAtMs: timestampMs()
    };
    await writePacketArtifact(settled, options.workspaceRoot);
    return {
      ok: false,
      status: 'setup_required',
      packet: settled,
      error: 'ACC bridge is not configured.'
    };
  }

  const transport = await postPacket(packet, config);
  const settled = replacePacket(packet.id, {
    status: transport.ok ? 'synced' : 'failed',
    remoteStatus: transport.ok ? 'synced' : 'failed',
    httpStatus: transport.httpStatus || null,
    response: transport.response || null,
    error: transport.error || null,
    completedAtMs: timestampMs()
  }) || {
    ...packet,
    status: transport.ok ? 'synced' : 'failed',
    remoteStatus: transport.ok ? 'synced' : 'failed',
    httpStatus: transport.httpStatus || null,
    response: transport.response || null,
    error: transport.error || null,
    completedAtMs: timestampMs()
  };
  await writePacketArtifact(settled, options.workspaceRoot);

  return {
    ok: transport.ok,
    status: settled.status,
    packet: settled,
    response: transport.response || null,
    error: transport.error || null
  };
}

export async function sendTaskToACC(taskPacket = {}, options = {}) {
  return syncBridgePacket('task', taskPacket, {
    ...options,
    jobId: taskPacket?.id || taskPacket?.jobId || taskPacket?.job_id || null,
    requestId: taskPacket?.requestId || taskPacket?.request_id || null
  });
}

export async function receiveACCResult(result = {}, options = {}) {
  return syncBridgePacket('result', result, {
    ...options,
    jobId: result?.jobId || result?.job_id || result?.id || null,
    requestId: result?.requestId || result?.request_id || null
  });
}

export async function syncApprovalState(payload = {}, options = {}) {
  return syncBridgePacket('approval', payload, {
    ...options,
    jobId: payload?.jobId || payload?.job_id || null,
    requestId: payload?.requestId || payload?.request_id || null
  });
}

export async function syncProjectMemory(payload = {}, options = {}) {
  return syncBridgePacket('memory', payload, {
    ...options,
    jobId: payload?.jobId || payload?.job_id || null,
    requestId: payload?.requestId || payload?.request_id || null
  });
}

export async function syncContentCatalystJob(jobSnapshot = {}, options = {}) {
  return syncBridgePacket('content_job', {
    job: jobSnapshot,
    eventType: options.eventType || 'update'
  }, {
    ...options,
    jobId: jobSnapshot?.id || null,
    requestId: jobSnapshot?.requestId || null
  });
}

// ── Starting ACC on this computer (Settings → Bridges, owner 2026-10-22) ──
// The folder is chosen in a dialog the backend opens itself and checked to be
// ACC; Start takes no path or command from the window.

const NOT_DESKTOP = { ok: false, error: 'Starting ACC needs the desktop app.' };

/** { folder, folderProblem, startedByAlphonso } */
export async function getAccLocalState() {
  try {
    return (await invoke('bridge_acc_state')) || { folder: null };
  } catch {
    return { folder: null, unavailable: true };
  }
}

export async function chooseAccFolder() {
  try {
    return await invoke('bridge_acc_choose_folder');
  } catch (error) {
    return { ...NOT_DESKTOP, error: String(error?.message || error || NOT_DESKTOP.error) };
  }
}

/**
 * Start the chosen ACC, then wait (up to `timeoutMs`) for it to answer.
 * Returns { ok, status, error } where status is checkAccBridge()'s status.
 */
export async function startAcc({ timeoutMs = 60000, intervalMs = 2000 } = {}) {
  let started;
  try {
    started = await invoke('bridge_acc_start');
  } catch (error) {
    return { ok: false, status: 'not_started', error: String(error?.message || error) };
  }
  if (!started?.ok) return { ok: false, status: 'not_started', error: started?.error || 'ACC was not started.' };
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await checkAccBridge();
    if (last.reachable) return { ok: last.ok, status: last.status, started: true };
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return { ok: false, status: 'unreachable', started: true, error: "ACC was started but didn't answer within a minute. Its output is in acc_bridge.log in Alphonso's settings folder." };
}

export async function stopAcc() {
  try {
    return await invoke('bridge_acc_stop');
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}
