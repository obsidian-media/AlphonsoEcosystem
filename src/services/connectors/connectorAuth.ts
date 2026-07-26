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
import { durableGet, durableSet } from '../../lib/durableStore.js';

const CREDS_KEY = 'alphonso_connector_credentials_v1';
const CRED_CACHE_TTL_MS = 60_000;

export interface ConnectorAuthProfile {
  enabled: boolean;
  allowlist: string[];
  mode: string;
}

export type ConnectorAuthProfiles = Record<string, ConnectorAuthProfile>;
export type ConnectorCredentials = Record<string, Record<string, string>>;

let _credCache: ConnectorCredentials | null = null;
let _credCacheHydratedAt = 0;

/**
 * Hydrates the in-memory credential cache from the OS-backed secure
 * credential store (Truth-First plan B3 — Windows Credential Manager /
 * macOS Keychain / Linux Secret Service via the Rust `keyring` crate,
 * `secure_credential_*` Tauri commands in `secure_credential_store.rs`).
 *
 * Name kept as `...FromSqlite` for backward compatibility with existing
 * callers (`ConnectorSetupPanel.tsx`, `useBootEffects.js`,
 * `useDataHydration.js`) even though credentials no longer live in SQLite —
 * only migration *from* SQLite/localStorage still touches those stores, and
 * only until this function's one-time migration sweep completes.
 *
 * Migration order, each a fallback for the one before it, each migrating
 * forward and deleting the old copy so it only ever happens once per
 * install: OS secure store (already-migrated state) -> legacy SQLite
 * `kv_store` (`kv_get`, pre-B3 storage) -> legacy `localStorage`
 * (pre-durableStore, the oldest storage location). A credential found in an
 * older location is written into the secure store and deleted from the
 * older location before this function returns.
 */
export async function hydrateConnectorCredentialsFromSqlite(force = false): Promise<void> {
  if (_credCache !== null && !force && (Date.now() - _credCacheHydratedAt) < CRED_CACHE_TTL_MS) return;
  try {
    const secureJson = await invoke('secure_credential_get', { key: CREDS_KEY }) as string | null;
    if (secureJson) {
      const parsed = JSON.parse(secureJson);
      if (parsed && typeof parsed === 'object') {
        _credCache = parsed;
        _credCacheHydratedAt = Date.now();
        return;
      }
    }

    // Not yet in the secure store — check the legacy SQLite kv_store (pre-B3).
    const kvJson = await invoke('kv_get', { key: CREDS_KEY }) as string | null;
    if (kvJson) {
      const parsed = JSON.parse(kvJson);
      if (parsed && typeof parsed === 'object') {
        _credCache = parsed;
        _credCacheHydratedAt = Date.now();
        // Only delete the legacy copy once the secure-store write is confirmed
        // to have succeeded — otherwise a failed write (Windows Credential
        // Manager blob-size limit, keychain/D-Bus unavailable, etc.) would
        // silently lose the credential forever: it only ever lived in the
        // in-memory cache for this session, with both older copies gone.
        const migrated = await invoke('secure_credential_set', { key: CREDS_KEY, value: kvJson })
          .then(() => true)
          .catch(() => false);
        if (migrated) {
          await invoke('kv_delete', { key: CREDS_KEY }).catch(() => {});
          try { localStorage.removeItem(CREDS_KEY); } catch { /* localStorage unavailable */ }
        }
        return;
      }
    }

    // Oldest location — legacy plain localStorage (pre-durableStore).
    const raw = localStorage.getItem(CREDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        _credCache = parsed;
        _credCacheHydratedAt = Date.now();
        const migrated = await invoke('secure_credential_set', { key: CREDS_KEY, value: raw })
          .then(() => true)
          .catch(() => false);
        if (migrated) {
          await invoke('kv_delete', { key: CREDS_KEY }).catch(() => {});
          localStorage.removeItem(CREDS_KEY);
        }
      }
    }
  } catch {
    // ignore — in-memory cache fallback already in place (e.g. running
    // outside Tauri, where none of these invoke() calls resolve)
  }
}

function readAllCredentials(): ConnectorCredentials {
  if (_credCache === null) {
    _credCache = {};
    _credCacheHydratedAt = Date.now();
  } else if ((Date.now() - _credCacheHydratedAt) >= CRED_CACHE_TTL_MS) {
    // Stale beyond TTL — trigger an async re-hydrate from the durable store so a
    // credential update made elsewhere (e.g. app restart racing a write) is
    // eventually picked up. Return the current value now; refresh applies on next read.
    hydrateConnectorCredentialsFromSqlite(true).catch(() => {});
  }
  return _credCache;
}

function writeAllCredentials(creds: ConnectorCredentials): void {
  _credCache = creds;
  _credCacheHydratedAt = Date.now();
  try {
    invoke('secure_credential_set', { key: CREDS_KEY, value: JSON.stringify(creds) }).catch((error) => {
      // The in-memory cache still has this write for the rest of the current
      // session, but nothing durable does — surface it so a failed persist
      // (Windows Credential Manager blob-size limit, keychain/D-Bus
      // unavailable, etc.) isn't mistaken for a successful save.
      console.error('Failed to persist connector credentials to the OS secure store:', error);
    });
  } catch {
    // OS secure credential store not available outside Tauri
  }
}

export function saveConnectorCredential(connectorId: string, key: string, value: unknown): void {
  const all = readAllCredentials();
  if (!all[connectorId]) all[connectorId] = {};
  all[connectorId][key] = String(value || '').trim();
  writeAllCredentials(all);
}

export function getConnectorCredential(connectorId: string, key: string): string {
  try {
    const all = readAllCredentials();
    return all?.[connectorId]?.[key] || '';
  } catch {
    return '';
  }
}

export function getConnectorCredentials(connectorId: string): Record<string, string> {
  try {
    const all = readAllCredentials();
    return all?.[connectorId] || {};
  } catch {
    return {};
  }
}

export const DEFAULT_AUTH_PROFILES: ConnectorAuthProfiles = {
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

export function readAuthProfiles(): ConnectorAuthProfiles {
  try {
    const raw = durableGet(CONNECTOR_AUTH_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_AUTH_PROFILES, ...(parsed || {}) };
  } catch {
    return { ...DEFAULT_AUTH_PROFILES };
  }
}

export function writeAuthProfiles(profiles: ConnectorAuthProfiles): void {
  durableSet(CONNECTOR_AUTH_KEY, JSON.stringify(profiles));
  const rows = Object.entries(profiles || {}).map(([id, profile]) => ({
    id: `auth-${id}`,
    ...profile
  }));
  persistScopeRows(CONNECTOR_AUTH_SCOPE, rows, (row: any) => ({
    id: row.id,
    data: row,
    status: row.enabled ? 'enabled' : 'disabled',
    confidence: TRUST_STATES.TEMPORARY,
    verificationState: TRUST_STATES.UNVERIFIED,
    timestampMs: timestampMs()
  }));
}

export async function hydrateConnectorAuthProfilesFromSqlite(): Promise<ConnectorAuthProfiles | null> {
  try {
    const json = await invoke('kv_get', { key: CONNECTOR_AUTH_KEY }) as string | null;
    if (!json) return null;
    const parsed = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

export function normalizeAllowlist(value: unknown): string[] {
  return String(value || '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 120);
}

export function authorizeConnectorRequest(connectorId: string): { enabled: boolean; isAuthorized: boolean; mode: string } {
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

export function isConnectorAuthenticated(connectorId: string): { ok: boolean; success: boolean; connector: string; enabled: boolean; mode: string } {
  const auth = authorizeConnectorRequest(connectorId);
  return {
    ok: Boolean(auth.isAuthorized),
    success: Boolean(auth.isAuthorized),
    connector: connectorId,
    enabled: Boolean(auth.enabled),
    mode: auth.mode || 'allowlist_required'
  };
}

export interface LogUnauthenticatedOptions {
  requestedBy?: string;
  commandId?: string | null;
  packetId?: string | null;
}

export function logUnauthenticatedConnectorRequest(
  connectorId: string,
  actionType: string,
  commandPreview = '',
  options: LogUnauthenticatedOptions = {}
) {
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

export function listConnectorAuthProfiles(): ConnectorAuthProfiles {
  return readAuthProfiles();
}

export function updateConnectorAuthProfile(connectorId: string, patch: Omit<Partial<ConnectorAuthProfile>, 'allowlist'> & { allowlist?: unknown } = {}): ConnectorAuthProfile {
  const profiles = readAuthProfiles();
  const current = profiles[connectorId] || { enabled: false, allowlist: [], mode: 'allowlist_required' };
  const next: ConnectorAuthProfile = {
    ...current,
    ...patch,
    allowlist: patch.allowlist ? normalizeAllowlist(patch.allowlist) : current.allowlist
  } as ConnectorAuthProfile;
  profiles[connectorId] = next;
  writeAuthProfiles(profiles);
  appendConnectorAudit(connectorId, 'auth_profile_updated', {
    enabled: next.enabled,
    allowlistCount: (next.allowlist || []).length,
    mode: next.mode || 'allowlist_required'
  });
  return next;
}
