import { TRUST_STATES, timestampMs } from './trustModel';
import { invoke } from '@tauri-apps/api/core';
import { persistScopeRows } from './runtimeLedgerService';

const PLUGINS_KEY = 'alphonso_plugins_v1';
const AUDIT_KEY = 'alphonso_plugin_audit_v1';
export const PLUGINS_SCOPE = 'plugins_registry_v1';
export const PLUGIN_AUDIT_SCOPE = 'plugin_audit_v1';

const DEFAULT_PLUGINS = [
  {
    id: 'core.runtime-verifier',
    name: 'Runtime Verifier',
    description: 'Core local verification and runtime proof plugin.',
    version: '1.0.0',
    author: 'Alphonso Core',
    enabled: true,
    permissions: ['runtime.read', 'process.read', 'filesystem.read'],
    panels: ['operator.runtime', 'trust.receipts'],
    tools: ['verify_ollama', 'check_processes', 'verify_paths'],
    workflows: ['runtime_health_check'],
    memoryHandlers: ['runtime_memory'],
    status: 'installed',
    trust: TRUST_STATES.VERIFIED,
    manifestVersion: '1.0.0'
  },
  {
    id: 'core.memory-ledger',
    name: 'Memory Ledger',
    description: 'Structured local memory ledger foundation.',
    version: '1.0.0',
    author: 'Alphonso Core',
    enabled: true,
    permissions: ['memory.read', 'memory.write'],
    panels: ['memory.dashboard'],
    tools: [],
    workflows: ['session_memory_capture'],
    memoryHandlers: ['project_memory', 'task_memory', 'runtime_memory'],
    status: 'installed',
    trust: TRUST_STATES.VERIFIED,
    manifestVersion: '1.0.0'
  },
  {
    id: 'connector.telegram',
    name: 'Telegram Connector',
    description: 'Safe Telegram inbound route foundation. External transport is not configured.',
    version: '0.1.0',
    author: 'Alphonso Core',
    enabled: false,
    permissions: ['connector.inbound', 'approval.request'],
    panels: ['connectors.telegram'],
    tools: [],
    workflows: ['telegram_to_jose_route'],
    memoryHandlers: [],
    status: 'not_configured',
    trust: TRUST_STATES.PLACEHOLDER,
    manifestVersion: '1.0.0'
  },
  {
    id: 'connector.whatsapp',
    name: 'WhatsApp Connector',
    description: 'Safe WhatsApp Cloud API/Twilio route foundation. External transport is not configured.',
    version: '0.1.0',
    author: 'Alphonso Core',
    enabled: false,
    permissions: ['connector.inbound', 'approval.request'],
    panels: ['connectors.whatsapp'],
    tools: [],
    workflows: ['whatsapp_to_jose_route'],
    memoryHandlers: [],
    status: 'not_configured',
    trust: TRUST_STATES.PLACEHOLDER,
    manifestVersion: '1.0.0'
  },
  {
    id: 'connector.chatgpt',
    name: 'ChatGPT Connector',
    description: 'ChatGPT bridge foundation. Live transport is not wired yet.',
    version: '0.1.0',
    author: 'Alphonso Core',
    enabled: false,
    permissions: ['connector.inbound', 'approval.request'],
    panels: ['connectors.chatgpt'],
    tools: [],
    workflows: ['chatgpt_to_jose_route'],
    memoryHandlers: [],
    status: 'not_configured',
    trust: TRUST_STATES.PLACEHOLDER,
    manifestVersion: '1.0.0'
  },
  {
    id: 'connector.claude',
    name: 'Claude Connector',
    description: 'Claude bridge foundation. Live transport is not wired yet.',
    version: '0.1.0',
    author: 'Alphonso Core',
    enabled: false,
    permissions: ['connector.inbound', 'approval.request'],
    panels: ['connectors.claude'],
    tools: [],
    workflows: ['claude_to_jose_route'],
    memoryHandlers: [],
    status: 'not_configured',
    trust: TRUST_STATES.PLACEHOLDER,
    manifestVersion: '1.0.0'
  },
  {
    id: 'connector.notion',
    name: 'Notion Connector',
    description: 'Notion connector foundation. Live transport is not wired yet.',
    version: '0.1.0',
    author: 'Alphonso Core',
    enabled: false,
    permissions: ['connector.inbound', 'approval.request'],
    panels: ['connectors.notion'],
    tools: [],
    workflows: ['notion_to_jose_route'],
    memoryHandlers: [],
    status: 'not_configured',
    trust: TRUST_STATES.PLACEHOLDER,
    manifestVersion: '1.0.0'
  },
  {
    id: 'connector.clickup',
    name: 'ClickUp Connector',
    description: 'ClickUp connector foundation. Live transport is not wired yet.',
    version: '0.1.0',
    author: 'Alphonso Core',
    enabled: false,
    permissions: ['connector.inbound', 'approval.request'],
    panels: ['connectors.clickup'],
    tools: [],
    workflows: ['clickup_to_jose_route'],
    memoryHandlers: [],
    status: 'not_configured',
    trust: TRUST_STATES.PLACEHOLDER,
    manifestVersion: '1.0.0'
  }
];

export const PLUGIN_MANIFEST_FIELDS = [
  'id',
  'name',
  'description',
  'version',
  'author',
  'permissions',
  'panels',
  'tools',
  'workflows',
  'memoryHandlers',
  'status'
];

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : fallback;
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  if (key === PLUGINS_KEY || key === AUDIT_KEY) {
    const scope = key === PLUGINS_KEY ? PLUGINS_SCOPE : PLUGIN_AUDIT_SCOPE;
    const rows = Array.isArray(value) ? value : [];
    persistScopeRows(scope, rows, (row) => ({
      id: row.id || `${scope}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      data: row,
      status: row.status || row.action || 'recorded',
      confidence: row.trust || TRUST_STATES.TEMPORARY,
      verificationState: row.trust || TRUST_STATES.UNVERIFIED,
      timestampMs: Number(row.timestampMs || Date.now())
    }));
  }
}

export function listPlugins() {
  const plugins = read(PLUGINS_KEY, []);
  if (plugins.length === 0) {
    write(PLUGINS_KEY, DEFAULT_PLUGINS);
    return DEFAULT_PLUGINS;
  }
  const missingDefaults = DEFAULT_PLUGINS.filter((item) => !plugins.some((plugin) => plugin.id === item.id));
  if (missingDefaults.length > 0) {
    const merged = [...plugins, ...missingDefaults];
    write(PLUGINS_KEY, merged);
    return merged;
  }
  return plugins;
}

export function listPluginAudit() {
  return read(AUDIT_KEY, []);
}

export function appendPluginAuditEntry(entry = {}) {
  const current = read(AUDIT_KEY, []);
  const next = {
    id: entry.id || `audit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestampMs: Number(entry.timestampMs || timestampMs()),
    pluginId: entry.pluginId || 'unknown',
    action: entry.action || 'event',
    trust: entry.trust || TRUST_STATES.TEMPORARY,
    details: entry.details || {}
  };
  const updated = [...current, next].slice(-300);
  write(AUDIT_KEY, updated);
  return next;
}

export function togglePlugin(pluginId, enabled) {
  const plugins = listPlugins().map((plugin) => (
    plugin.id === pluginId ? { ...plugin, enabled } : plugin
  ));

  write(PLUGINS_KEY, plugins);
  appendPluginAuditEntry({
    pluginId,
    action: enabled ? 'enabled' : 'disabled',
    trust: TRUST_STATES.VERIFIED
  });
  return plugins;
}

export async function discoverDiskPluginManifests(workspaceRoot) {
  try {
    const manifests = await invoke('discover_plugins_from_disk', {
      workspaceRoot: workspaceRoot || null
    });
    return Array.isArray(manifests) ? manifests : [];
  } catch {
    return [];
  }
}

export async function executePluginToolRun({
  manifestPath,
  pluginId,
  toolId,
  extraArgs = [],
  workspaceRoot
}) {
  return invoke('execute_plugin_tool', {
    manifestPath,
    pluginId,
    toolId,
    extraArgs,
    workspaceRoot: workspaceRoot || null
  });
}

export async function validatePluginManifestDisk(manifestPath) {
  return invoke('validate_plugin_manifest_disk', {
    manifestPath
  });
}
