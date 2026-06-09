import { invoke } from '@tauri-apps/api/core';
import { AGENTS } from '../agentBusService';
import { TRUST_STATES, timestampMs } from '../trustModel';
import { persistScopeRows } from '../runtimeLedgerService';
import { appendOrchestrationReceipt } from '../orchestrationReceiptService';
import { appendConnectorAuditEntry } from '../connectorAuditLogService';
import {
  CONNECTOR_AUTH_KEY,
  CONNECTOR_AUTH_SCOPE,
  appendConnectorAudit,
  readRows,
  writeRows
} from './connectorRegistry.js';

export const DEFAULT_AUTH_PROFILES = {
  telegram: { enabled: false, allowlist: [], mode: 'allowlist_required' },
  whatsapp: { enabled: false, allowlist: [], mode: 'allowlist_required' },
  youtube: { enabled: false, allowlist: [], mode: 'allowlist_required' },
  chatgpt: { enabled: false, allowlist: [], mode: 'allowlist_required' },
  claude: { enabled: false, allowlist: [], mode: 'allowlist_required' },
  qwen: { enabled: false, allowlist: [], mode: 'allowlist_required' },
  notion: { enabled: false, allowlist: [], mode: 'allowlist_required' },
  clickup: { enabled: false, allowlist: [], mode: 'allowlist_required' },
  sd_webui: { enabled: true, allowlist: [], mode: 'local_only' },
  comfyui_video: { enabled: true, allowlist: [], mode: 'local_only' },
  runway: { enabled: false, allowlist: [], mode: 'allowlist_required' }
};

const SQLITE_WRITE_DEBOUNCE_MS = 300;
let authProfilesSqliteWriteTimer = null;

export function readAuthProfiles() {
  try {
    const raw = localStorage.getItem(CONNECTOR_AUTH_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_AUTH_PROFILES, ...(parsed || {}) };
  } catch {
    return { ...DEFAULT_AUTH_PROFILES };
  }
}

export function writeAuthProfiles(profiles) {
  try {
    invoke('kv_set', { key: CONNECTOR_AUTH_KEY, value: JSON.stringify(profiles) }).catch(() => {});
  } catch {
    // SQLite not available in browser
  }
  localStorage.setItem(CONNECTOR_AUTH_KEY, JSON.stringify(profiles));
  clearTimeout(authProfilesSqliteWriteTimer);
  authProfilesSqliteWriteTimer = setTimeout(() => {
    invoke('kv_set', { key: CONNECTOR_AUTH_KEY, value: JSON.stringify(profiles) }).catch(() => {});
  }, SQLITE_WRITE_DEBOUNCE_MS);
  const rows = Object.entries(profiles || {}).map(([id, profile]) => ({
    id: `auth-${id}`,
    ...profile
  }));
  persistScopeRows(CONNECTOR_AUTH_SCOPE, rows, (row) => ({
    id: row.id,
    data: row,
    status: row.enabled ? 'enabled' : 'disabled',
    confidence: TRUST_STATES.TEMPORARY,
    verificationState: TRUST_STATES.UNVERIFIED,
    timestampMs: timestampMs()
  }));
}

export async function hydrateConnectorAuthProfilesFromSqlite() {
  try {
    const json = await invoke('kv_get', { key: CONNECTOR_AUTH_KEY });
    if (!json) return null;
    const parsed = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

export function normalizeAllowlist(value) {
  return String(value || '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 120);
}

export function authorizeConnectorRequest(connectorId) {
  const profiles = readAuthProfiles();
  const profile = profiles?.[connectorId] || { enabled: false, allowlist: [], mode: 'allowlist_required' };
  if (profile.mode === 'local_only') {
    return { enabled: true, isAuthorized: true, mode: 'local_only' };
  }
  if (!profile.enabled) {
    return { enabled: false, isAuthorized: false, mode: profile.mode || 'allowlist_required' };
  }
  return { enabled: true, isAuthorized: true, mode: profile.mode || 'allowlist_required' };
}

export function isConnectorAuthenticated(connectorId) {
  const auth = authorizeConnectorRequest(connectorId);
  return {
    ok: Boolean(auth.isAuthorized),
    success: Boolean(auth.isAuthorized),
    connector: connectorId,
    enabled: Boolean(auth.enabled),
    mode: auth.mode || 'allowlist_required'
  };
}

export function logUnauthenticatedConnectorRequest(connectorId, actionType, commandPreview = '', options = {}) {
  const detail = {
    connector: connectorId,
    action: actionType,
    reason: 'not_authenticated',
    timestamp: timestampMs(),
    commandPreview: String(commandPreview || '').slice(0, 200),
    requestedBy: options.requestedBy || 'jose'
  };
  appendConnectorAudit(connectorId, 'request_rejected', detail);
  appendOrchestrationReceipt({
    workflowId: 'connector_policy',
    commandId: options.commandId || null,
    packetId: options.packetId || null,
    eventType: 'connector_request_rejected',
    status: 'blocked',
    agent: AGENTS.JOSE,
    connectorId,
    actionType,
    riskLevel: 'high',
    approved: false,
    blocked: true,
    setupRequired: false,
    details: detail,
    confidence: TRUST_STATES.FAILED,
    verificationState: TRUST_STATES.FAILED
  });
  return {
    success: false,
    ok: false,
    error: 'not_authenticated',
    connector: connectorId,
    blocked: true,
    trust: TRUST_STATES.FAILED
  };
}

export function listConnectorAuthProfiles() {
  return readAuthProfiles();
}

export function updateConnectorAuthProfile(connectorId, patch = {}) {
  const profiles = readAuthProfiles();
  const current = profiles[connectorId] || { enabled: false, allowlist: [], mode: 'allowlist_required' };
  const next = {
    ...current,
    ...patch,
    allowlist: patch.allowlist ? normalizeAllowlist(patch.allowlist) : current.allowlist
  };
  profiles[connectorId] = next;
  writeAuthProfiles(profiles);
  appendConnectorAudit(connectorId, 'auth_profile_updated', {
    enabled: next.enabled,
    allowlistCount: (next.allowlist || []).length,
    mode: next.mode || 'allowlist_required'
  });
  return next;
}
