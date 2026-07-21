import { invoke } from '@tauri-apps/api/core';
import { appendAgentActivity } from '../agentActivityService';
import { AGENTS } from '../agentBusService';
import { TRUST_STATES, timestampMs } from '../trustModel';
import { persistScopeRows } from '../runtimeLedgerService';
import { evaluatePolicyGate } from '../policyEnforcementService';
import { appendOrchestrationReceipt } from '../orchestrationReceiptService';
import { requireApproval } from '../approval/approvalService';
import { hydrateConnectorAuthProfilesFromSqlite, getConnectorCredential } from './connectorAuth.js';
import { durableSet } from '../../lib/durableStore.js';
import { evaluateAction as evaluateDslAction } from '../policyDslService';

// Read credentials saved via UI (separate from OS env vars). Delegates to
// connectorAuth.js's SQLite-backed credential store — do NOT read
// 'alphonso_connector_credentials_v1' from localStorage directly here; that key
// is cleared after KV hydration (credentials are KV/SQLite-primary), so a direct
// localStorage read always returns empty and makes verification wrongly report
// a saved credential as missing.
function getStoredCredential(connectorId, key) {
  try {
    const val = getConnectorCredential(connectorId, key);
    return typeof val === 'string' ? val.trim() : '';
  } catch {
    return '';
  }
}

export const CONNECTOR_KEY = 'alphonso_connector_registry_v2';
export const CONNECTOR_AUDIT_KEY = 'alphonso_connector_audit_v2';
export const CONNECTOR_AUTH_KEY = 'alphonso_connector_auth_profiles_v1';
export const CONNECTOR_SCOPE = 'connector_registry_v2';
export const CONNECTOR_AUDIT_SCOPE = 'connector_audit_v2';
export const CONNECTOR_AUTH_SCOPE = 'connector_auth_profiles_v1';

const SQLITE_WRITE_DEBOUNCE_MS = 300;
let connectorSqliteWriteTimer = null;

export const DEFAULT_CONNECTORS = [
  {
    id: 'telegram',
    name: 'Telegram Bridge',
    status: 'not_configured',
    transport: 'bot_api',
    requiredEnv: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_ALLOWED_CHAT_IDS'],
    permissions: ['inbound_messages', 'jose_routing', 'approval_requests'],
    disabledReason: 'Token and allowed chat IDs are not configured in the app environment.'
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Bridge',
    status: 'not_configured',
    transport: 'whatsapp_cloud_api_or_twilio',
    requiredEnv: ['WHATSAPP_PROVIDER', 'WHATSAPP_ALLOWED_NUMBERS'],
    permissions: ['inbound_messages', 'jose_routing', 'approval_requests'],
    disabledReason: 'WhatsApp Cloud API or Twilio credentials are not configured.'
  },
  {
    id: 'youtube',
    name: 'YouTube Connector',
    status: 'not_configured',
    transport: 'youtube_data_api_v3',
    requiredEnv: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN', 'YOUTUBE_CHANNEL_ID'],
    permissions: ['upload_video', 'metadata_update', 'approval_requests'],
    disabledReason: 'OAuth credentials are not configured.'
  },
  {
    id: 'mobile_bridge',
    name: 'Mobile Bridge',
    status: 'foundation_only',
    transport: 'future_secure_local_relay',
    requiredEnv: [],
    permissions: ['remote_approvals', 'runtime_status', 'active_tasks', 'voice_notes'],
    disabledReason: 'Mobile transport is not implemented yet.'
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT Connector',
    status: 'not_configured',
    transport: 'openai_api_adapter',
    requiredEnv: ['OPENAI_API_KEY'],
    permissions: ['prompt_exchange', 'approval_requests'],
    disabledReason: 'Placeholder connector. Leave visible; not part of the active cloud lane.'
  },
  {
    id: 'claude',
    name: 'Claude Connector',
    status: 'not_configured',
    transport: 'anthropic_api_adapter',
    requiredEnv: ['ANTHROPIC_API_KEY'],
    permissions: ['prompt_exchange', 'approval_requests'],
    disabledReason: 'Placeholder connector. Leave visible; not part of the active cloud lane.'
  },
  {
    id: 'qwen',
    name: 'Alibaba Qwen Connector',
    status: 'not_configured',
    transport: 'dashscope_openai_compatible_adapter',
    requiredEnv: ['DASHSCOPE_API_KEY'],
    permissions: ['prompt_exchange', 'approval_requests', 'paid_connector_send'],
    disabledReason: 'DashScope/Qwen API key is not configured in the backend environment.'
  },
  {
    id: 'notion',
    name: 'Notion Connector',
    status: 'not_configured',
    transport: 'notion_api_adapter',
    requiredEnv: ['NOTION_API_KEY', 'NOTION_PARENT_PAGE_ID'],
    permissions: ['docs_read', 'docs_write', 'approval_requests'],
    disabledReason: 'Notion API key and parent page id are not configured.'
  },
  {
    id: 'clickup',
    name: 'ClickUp Connector',
    status: 'not_configured',
    transport: 'clickup_api_adapter',
    requiredEnv: ['CLICKUP_API_KEY', 'CLICKUP_LIST_ID'],
    permissions: ['task_read', 'task_write', 'approval_requests'],
    disabledReason: 'ClickUp API key and list id are not configured.'
  },
  {
    id: 'sd_webui',
    name: 'Local SD WebUI Image',
    status: 'foundation_only',
    transport: 'automatic1111_local_api',
    requiredEnv: [],
    permissions: ['local_image_generation'],
    disabledReason: 'Requires local Stable Diffusion WebUI API runtime (default: http://127.0.0.1:7860).'
  },
  {
    id: 'comfyui_video',
    name: 'Local ComfyUI Image + Video',
    status: 'foundation_only',
    transport: 'comfyui_local_api',
    requiredEnv: [],
    permissions: ['local_image_generation', 'local_video_generation'],
    disabledReason: 'Requires local ComfyUI runtime + model/workflow JSON (default: http://127.0.0.1:8188).'
  },
  {
    id: 'runway',
    name: 'Runway Cloud Video',
    status: 'not_configured',
    transport: 'runway_api',
    requiredEnv: ['RUNWAYML_API_SECRET'],
    permissions: ['cloud_video_generation', 'approval_requests'],
    disabledReason: 'Runway API secret is not configured in the backend environment.'
  },
  {
    id: 'github',
    name: 'GitHub Connector',
    status: 'not_configured',
    transport: 'github_rest_api_v3',
    requiredEnv: ['GITHUB_TOKEN'],
    permissions: ['repo_read', 'repo_write', 'issue_read', 'issue_write', 'pr_read', 'pr_write', 'release_read', 'release_write', 'code_search', 'approval_requests'],
    disabledReason: 'GitHub personal access token is not configured.'
  },
  {
    id: 'slack',
    name: 'Slack Connector',
    status: 'not_configured',
    transport: 'slack_web_api',
    requiredEnv: ['SLACK_BOT_TOKEN'],
    permissions: ['channel_read', 'channel_write', 'message_send', 'file_upload', 'reaction_add', 'approval_requests'],
    disabledReason: 'Slack bot token is not configured.'
  },
  {
    id: 'discord',
    name: 'Discord Connector',
    status: 'not_configured',
    transport: 'discord_rest_api_v10',
    requiredEnv: ['DISCORD_BOT_TOKEN'],
    permissions: ['channel_read', 'channel_write', 'message_send', 'message_edit', 'message_delete', 'reaction_add', 'approval_requests'],
    disabledReason: 'Discord bot token is not configured.'
  },
  {
    id: 'generic_webhook',
    name: 'Generic Webhook',
    status: 'not_configured',
    transport: 'generic_webhook_gateway_poll',
    requiredEnv: ['GENERIC_WEBHOOK_DRAIN_URL'],
    permissions: ['inbound_events'],
    disabledReason: 'Generic webhook gateway drain URL is not configured. Deploy gateway/generic-webhook/ and set the drain URL.'
  },
  {
    id: 'ollama',
    name: 'Ollama (Local Inference)',
    status: 'foundation_only',
    transport: 'ollama_local_api',
    requiredEnv: [],
    permissions: ['local_inference', 'model_management'],
    disabledReason: 'Requires local Ollama runtime (default: http://127.0.0.1:11434).'
  },
  {
    id: 'brave_search',
    name: 'Brave Search',
    status: 'not_configured',
    transport: 'brave_search_api',
    requiredEnv: ['BRAVE_SEARCH_API_KEY'],
    permissions: ['web_search'],
    disabledReason: 'Brave Search API key is not configured.'
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    status: 'not_configured',
    transport: 'perplexity_api',
    requiredEnv: ['PERPLEXITY_API_KEY'],
    permissions: ['web_search', 'prompt_exchange'],
    disabledReason: 'Perplexity API key is not configured.'
  },
  {
    id: 'tavily',
    name: 'Tavily',
    status: 'not_configured',
    transport: 'tavily_search_api',
    requiredEnv: ['TAVILY_API_KEY'],
    permissions: ['web_search'],
    disabledReason: 'Tavily API key is not configured.'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    status: 'not_configured',
    transport: 'deepseek_api',
    requiredEnv: ['DEEPSEEK_API_KEY'],
    permissions: ['prompt_exchange', 'web_search'],
    disabledReason: 'DeepSeek API key is not configured.'
  },
  {
    id: 'n8n',
    name: 'n8n Automation',
    status: 'foundation_only',
    transport: 'n8n_rest_api',
    requiredEnv: ['N8N_BASE_URL'],
    permissions: ['workflow_trigger', 'workflow_read'],
    disabledReason: 'Requires local or self-hosted n8n instance (default: http://localhost:5678).'
  }
];

export const CIRCUIT_BREAKER_THRESHOLD = 5;
export const CIRCUIT_BREAKER_RESET_MS = 300000;

const circuitBreakerState = {};

function getCircuitBreakerKey(connectorId, actionType) {
  return `${connectorId}::${actionType || 'default'}`;
}

export function recordConnectorFailure(connectorId, actionType = 'default') {
  const key = getCircuitBreakerKey(connectorId, actionType);
  const now = Date.now();
  const state = circuitBreakerState[key] || { failures: 0, disabledUntil: null };
  if (state.disabledUntil && now < state.disabledUntil) {
    state.failures += 1;
  } else if (state.disabledUntil && now >= state.disabledUntil) {
    state.failures = 1;
    state.disabledUntil = null;
  } else {
    state.failures += 1;
  }
  if (state.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    state.disabledUntil = now + CIRCUIT_BREAKER_RESET_MS;
    appendConnectorAudit(connectorId, 'circuit_breaker_opened', {
      failures: state.failures,
      disabledUntil: state.disabledUntil,
      actionType
    });
  }
  circuitBreakerState[key] = state;
}

export function recordConnectorSuccess(connectorId, actionType = 'default') {
  const key = getCircuitBreakerKey(connectorId, actionType);
  const state = circuitBreakerState[key];
  if (state) {
    if (!state.disabledUntil || Date.now() >= state.disabledUntil) {
      delete circuitBreakerState[key];
    } else {
      state.failures = Math.max(0, state.failures - 1);
      circuitBreakerState[key] = state;
    }
  }
}

export function resetConnectorCircuitState(connectorId, actionType = 'default') {
  const key = getCircuitBreakerKey(connectorId, actionType);
  delete circuitBreakerState[key];
}

export function getConnectorCircuitState(connectorId, actionType = 'default') {
  const key = getCircuitBreakerKey(connectorId, actionType);
  const state = circuitBreakerState[key];
  if (!state) {
    return { ok: true, failures: 0, disabledUntil: null, open: false };
  }
  const now = Date.now();
  if (state.disabledUntil && now < state.disabledUntil) {
    return {
      ok: false,
      failures: state.failures,
      disabledUntil: state.disabledUntil,
      open: true,
      remainingMs: state.disabledUntil - now
    };
  }
  if (state.disabledUntil && now >= state.disabledUntil) {
    delete circuitBreakerState[key];
    return { ok: true, failures: 0, disabledUntil: null, open: false };
  }
  return { ok: true, failures: state.failures, disabledUntil: null, open: false };
}

export function readRows(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeRows(key, rows) {
  const nextRows = rows.slice(-500);
  try {
    invoke('kv_set', { key, value: JSON.stringify(nextRows) }).catch(() => {});
  } catch {
    // SQLite not available in browser
  }
  localStorage.setItem(key, JSON.stringify(nextRows));
  persistToSqliteDebounced(key, nextRows);
  const scope = key === CONNECTOR_KEY
    ? CONNECTOR_SCOPE
    : key === CONNECTOR_AUDIT_KEY
      ? CONNECTOR_AUDIT_SCOPE
      : null;
  if (scope) {
    persistScopeRows(scope, nextRows, (row) => ({
      id: row.id,
      data: row,
      status: row.status || row.action || 'recorded',
      confidence: row.trust || TRUST_STATES.TEMPORARY,
      verificationState: row.trust || TRUST_STATES.UNVERIFIED,
      timestampMs: Number(row.updatedAtMs || row.timestampMs || timestampMs())
    }));
  }
}

function persistToSqliteDebounced(key, data) {
  clearTimeout(connectorSqliteWriteTimer);
  connectorSqliteWriteTimer = setTimeout(() => {
    invoke('kv_set', { key, value: JSON.stringify(data) }).catch(() => {});
  }, SQLITE_WRITE_DEBOUNCE_MS);
}

export async function hydrateConnectorRegistryFromSqlite() {
  try {
    const json = await invoke('kv_get', { key: CONNECTOR_KEY });
    if (!json) return null;
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function hydrateConnectorAuditFromSqlite() {
  try {
    const json = await invoke('kv_get', { key: CONNECTOR_AUDIT_KEY });
    if (!json) return null;
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function initializeConnectorRegistryFromSqlite() {
  try {
    const [registry, audit, auth] = await Promise.all([
      hydrateConnectorRegistryFromSqlite(),
      hydrateConnectorAuditFromSqlite(),
      hydrateConnectorAuthProfilesFromSqlite()
    ]);
    if (registry && registry.length > 0) {
      const existing = readRows(CONNECTOR_KEY);
      if (existing.length === 0) {
        durableSet(CONNECTOR_KEY, JSON.stringify(registry));
      }
    }
    if (audit && audit.length > 0) {
      const existing = readRows(CONNECTOR_AUDIT_KEY);
      if (existing.length === 0) {
        durableSet(CONNECTOR_AUDIT_KEY, JSON.stringify(audit));
      }
    }
    if (auth && Object.keys(auth).length > 0) {
      const raw = localStorage.getItem(CONNECTOR_AUTH_KEY);
      const existing = raw ? JSON.parse(raw) : {};
      if (Object.keys(existing).length === 0) {
        durableSet(CONNECTOR_AUTH_KEY, JSON.stringify(auth));
      }
    }
  } catch {
    // SQLite not available in browser dev mode — localStorage remains primary.
  }
}

function upsertConnectorRows(existing) {
  const merged = [
    ...existing,
    ...DEFAULT_CONNECTORS.filter((item) => !existing.some((row) => row.id === item.id))
  ].map((connector) => ({
    ...connector,
    trust: connector.status === 'configured' ? TRUST_STATES.VERIFIED : TRUST_STATES.PLACEHOLDER,
    updatedAtMs: connector.updatedAtMs || timestampMs(),
    envPresence: connector.envPresence || {}
  }));
  writeRows(CONNECTOR_KEY, merged);
  return merged;
}

export function listConnectors() {
  const existing = readRows(CONNECTOR_KEY);
  return upsertConnectorRows(existing);
}

export function listConnectorAudit() {
  return readRows(CONNECTOR_AUDIT_KEY);
}

export function setConnectorStatus(connectorId, status, note = '') {
  const connectors = listConnectors().map((connector) => (
    connector.id === connectorId
      ? { ...connector, status, note, updatedAtMs: timestampMs(), trust: TRUST_STATES.TEMPORARY }
      : connector
  ));
  writeRows(CONNECTOR_KEY, connectors);
  appendConnectorAudit(connectorId, 'status_updated', { status, note });
  return connectors.find((connector) => connector.id === connectorId);
}

export function appendConnectorAudit(connectorId, action, details = {}) {
  appendAgentActivity({ agent: 'connector', action: `${connectorId}: ${action}`, detail: details?.summary || details?.reason || '' });
  const rows = readRows(CONNECTOR_AUDIT_KEY);
  const entry = {
    id: `connector-audit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    connectorId,
    action,
    details,
    timestampMs: timestampMs(),
    trust: TRUST_STATES.TEMPORARY
  };
  rows.push(entry);
  writeRows(CONNECTOR_AUDIT_KEY, rows);
  return entry;
}

export function gateConnectorAction(connectorId, actionType, commandPreview, options = {}) {
  try {
    const auth = options.auth || { enabled: false, isAuthorized: false, mode: 'allowlist_required' };
    // DSL policy layer — evaluated before the main gate as an extra rule set
    const dslResult = evaluateDslAction(actionType, { connectorId, target: 'external' });
    if (dslResult.effect === 'deny') {
      return { ok: false, blocked: true, reason: dslResult.reason || 'DSL policy denied', riskLevel: 'high' };
    }
    // Enforce the require_consent tier (irreversible/costly actions such as
    // external_publish / paid_connector_send). Blocks unless the caller has an
    // explicit approval; the ApprovalModal flow re-invokes with approved:true.
    if (dslResult.effect === 'require_consent' && !options.approved) {
      const reason = dslResult.reason || 'This action requires explicit consent';
      appendConnectorAudit(connectorId, 'policy_block', {
        actionType,
        commandPreview: String(commandPreview || '').slice(0, 200),
        reason,
        riskLevel: 'high',
        dsl: 'require_consent'
      });
      return { ok: false, blocked: true, reason, riskLevel: 'high', requiresConsent: true };
    }
    const gate = evaluatePolicyGate({
      connectorId,
      actionType,
      commandPreview,
      approved: Boolean(options.approved),
      auth
    });
    appendConnectorAudit(connectorId, gate.ok ? 'policy_allow' : 'policy_block', {
      actionType,
      commandPreview: String(commandPreview || '').slice(0, 200),
      approved: Boolean(options.approved),
      reason: gate.reason || null,
      riskLevel: gate.riskLevel
    });
    appendOrchestrationReceipt({
      workflowId: 'connector_policy',
      commandId: options.commandId || null,
      packetId: options.packetId || null,
      eventType: gate.ok ? 'connector_policy_allow' : 'connector_policy_block',
      status: gate.ok ? 'allowed' : 'blocked',
      agent: AGENTS.JOSE,
      connectorId,
      actionType,
      riskLevel: gate.riskLevel || 'medium',
      approved: Boolean(options.approved),
      blocked: !gate.ok,
      setupRequired: Boolean(gate.setupRequired),
      details: {
        reason: gate.reason || null,
        authMode: auth.mode || 'allowlist_required'
      },
      confidence: gate.confidence || TRUST_STATES.VERIFIED,
      verificationState: gate.verificationState || TRUST_STATES.UNVERIFIED
    });
    return gate;
  } catch {
    return { ok: false, blocked: true, reason: 'Policy gate internal error' };
  }
}

export async function verifyConnectorEnvironment(connectorId) {
  const connector = listConnectors().find((item) => item.id === connectorId);
  if (!connector) return null;
  if (!connector.requiredEnv?.length) {
    const foundationOnly = ['mobile_bridge', 'sd_webui', 'comfyui_video'].includes(connector.id);
    let health = null;
    if (['sd_webui', 'comfyui_video'].includes(connector.id)) {
      try {
        health = await invoke('connector_check_local_runtime_health', { connectorId: connector.id });
      } catch (error) {
        health = {
          ok: false,
          connectorId: connector.id,
          provider: connector.id === 'sd_webui' ? 'automatic1111' : 'comfyui',
          endpoint: connector.id === 'sd_webui' ? 'http://127.0.0.1:7860' : 'http://127.0.0.1:8188',
          probePath: connector.id === 'sd_webui' ? '/sdapi/v1/samplers' : '/system_stats',
          checkedAtMs: timestampMs(),
          trust: TRUST_STATES.FAILED,
          message: 'Local runtime health probe failed.',
          error: String(error)
        };
      }
    }
    return {
      connectorId,
      ok: foundationOnly ? Boolean(health?.ok ?? false) : true,
      envPresence: {},
      status: foundationOnly ? 'foundation_only' : 'configured',
      checkedAtMs: timestampMs(),
      lastTestAtMs: timestampMs(),
      lastTestStatus: foundationOnly
        ? (health?.ok ? 'verified' : health ? 'failed' : 'foundation_only')
        : 'configured',
      lastTestError: health?.error || null,
      health,
      trust: foundationOnly
        ? (connector.id === 'mobile_bridge' ? TRUST_STATES.PLACEHOLDER : health?.ok ? TRUST_STATES.VERIFIED : TRUST_STATES.FAILED)
        : TRUST_STATES.VERIFIED
    };
  }

  let envPresence = {};
  try {
    envPresence = await invoke('check_env_vars_presence', { names: connector.requiredEnv }) ?? {};
  } catch (error) {
    appendConnectorAudit(connector.id, 'env_check_failed', { error: String(error) });
    // Fall through to credential-store check even if Tauri invoke fails
  }

  // Merge UI-saved credentials into presence map — credentials saved via the
  // settings panel live in localStorage, not in the OS env. Both count as
  // "present" for verification purposes.
  const mergedPresence = {};
  for (const name of connector.requiredEnv) {
    mergedPresence[name] = Boolean(envPresence[name]) || Boolean(getStoredCredential(connectorId, name));
  }
  envPresence = mergedPresence;

  let ok = connector.requiredEnv.every((name) => Boolean(envPresence[name]));
  let missing = connector.requiredEnv.filter((name) => !envPresence[name]);
  if (connector.id === 'whatsapp') {
    const cloudSet = ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'];
    const twilioSet = ['WHATSAPP_TWILIO_ACCOUNT_SID', 'WHATSAPP_TWILIO_AUTH_TOKEN', 'WHATSAPP_TWILIO_FROM'];
    let providerPresence = {};
    try { providerPresence = await invoke('check_env_vars_presence', { names: [...cloudSet, ...twilioSet] }) ?? {}; } catch { /* ignore */ }
    // merge stored credentials for WhatsApp provider keys
    for (const name of [...cloudSet, ...twilioSet]) {
      providerPresence[name] = Boolean(providerPresence[name]) || Boolean(getStoredCredential('whatsapp', name));
    }
    envPresence = { ...envPresence, ...providerPresence };
    const cloudReady = cloudSet.every((name) => Boolean(providerPresence[name]));
    const twilioReady = twilioSet.every((name) => Boolean(providerPresence[name]));
    ok = ok && (cloudReady || twilioReady);
    missing = [
      ...missing,
      ...(cloudReady || twilioReady ? [] : ['WHATSAPP_ACCESS_TOKEN|WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_TWILIO_*'])
    ];
  }
  const status = ok ? 'configured' : 'not_configured';
  const connectors = listConnectors().map((item) => (
    item.id === connector.id
      ? {
        ...item,
        status,
        envPresence,
        lastTestAtMs: timestampMs(),
        lastTestStatus: ok ? 'verified' : 'setup_required',
        lastTestError: ok ? null : 'Connector environment is incomplete.',
        updatedAtMs: timestampMs(),
        trust: ok ? TRUST_STATES.VERIFIED : TRUST_STATES.UNVERIFIED,
        disabledReason: ok
          ? `${connector.name} env requirements verified in runtime environment.`
          : `${connector.name} env requirements are incomplete.`
      }
      : item
  ));
  writeRows(CONNECTOR_KEY, connectors);
  appendConnectorAudit(connector.id, 'env_verified', {
    ok,
    missing,
    requiredCount: connector.requiredEnv.length
  });
  return {
    connectorId: connector.id,
    ok,
    envPresence,
    status,
    checkedAtMs: timestampMs(),
    lastTestAtMs: timestampMs(),
    lastTestStatus: ok ? 'verified' : 'setup_required',
    lastTestError: ok ? null : 'Connector environment is incomplete.',
    trust: ok ? TRUST_STATES.VERIFIED : TRUST_STATES.UNVERIFIED
  };
}

export async function requireConnectorReady(connectorId, actionType, commandPreview = '', options = {}) {
  const envProof = await verifyConnectorEnvironment(connectorId);
  if (envProof?.ok) return { ok: true };

  const reason = `Connector ${connectorId} is not configured in runtime env.`;
  appendConnectorAudit(connectorId, 'setup_required', {
    actionType,
    commandPreview: String(commandPreview || '').slice(0, 180),
    missingEnv: Object.entries(envProof?.envPresence || {})
      .filter(([, present]) => !present)
      .map(([key]) => key),
    status: envProof?.status || 'not_configured'
  });
  appendOrchestrationReceipt({
    workflowId: 'connector_policy',
    commandId: options.commandId || null,
    packetId: options.packetId || null,
    eventType: 'connector_setup_required',
    status: 'setup_required',
    agent: AGENTS.JOSE,
    connectorId,
    actionType,
    riskLevel: 'high',
    approved: Boolean(options.approved),
    blocked: true,
    setupRequired: true,
    details: {
      reason,
      connectorStatus: envProof?.status || 'not_configured'
    },
    confidence: TRUST_STATES.UNVERIFIED,
    verificationState: TRUST_STATES.PLACEHOLDER
  });
  return {
    ok: false,
    connectorId,
    blocked: true,
    setupRequired: true,
    trust: TRUST_STATES.PLACEHOLDER,
    error: reason
  };
}

export async function requireConnectorApproval(connectorId, actionType, summary, options = {}) {
  return requireApproval({
    actionType,
    approved: Boolean(options.approved),
    force: true,
    summary,
    reason: options.reason || '',
    riskLevel: options.riskLevel || 'high',
    requestedBy: options.requestedBy || 'jose',
    workflowId: options.workflowId || 'connector_policy',
    commandId: options.commandId || null,
    packetId: options.packetId || null,
    metadata: {
      connectorId,
      target: options.target || null,
      ...options.metadata
    }
  });
}
