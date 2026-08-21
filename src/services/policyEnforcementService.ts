import { invoke } from '@tauri-apps/api/core';
import { TRUST_STATES } from './trustModel';
import { canUseConnector } from './licenseService';
import { MemoryCache, createCacheKey } from './cacheService';

const SETTINGS_KEY = 'alphonso_settings';

const policyCache = new MemoryCache({ maxSize: 500 });
const RISK_CACHE_TTL = 300000;

// nvidia_nim and gemini are intentionally NOT in this set — both are
// genuinely free-tier (rate-limited, not billed on overage) as of
// 2026-07-25. See docs/superpowers/plans/2026-07-23-free-tier-cloud-providers.md
// before adding them here or removing them from here.
// hermes_agents is also intentionally NOT in this set — every profile is a
// local/self-hosted process the user runs on their own machine (same posture
// as Ollama), not a metered cloud API this app pays for per call.
const PAID_OR_METERED_CONNECTORS: Set<string> = new Set([
  'chatgpt',
  'claude',
  'qwen',
  'whatsapp',
  'notion',
  'clickup',
  'gmail',
  'google_drive',
  'airtable'
]);

// Only match genuinely outbound/destructive actions — not user-initiated commands
const HIGH_RISK_ACTION_PATTERNS: RegExp[] = [
  /external_publish/i,
  /external_send/i,
  /external_post/i,
  /external_upload/i,
  /^publish$/i,
  /^upload$/i,
  /delete_files/i,
  /deploy_production/i,
];

export interface RuntimePolicySettings {
  approvalMode: boolean;
  zeroCostMode: boolean;
  safeMode: boolean;
  localOnlyMode: boolean;
  previewMode: boolean;
}

export type ConnectorRiskLevel = 'high' | 'medium' | 'low';

export interface PolicyGateAuth {
  enabled: boolean;
  isAuthorized: boolean;
}

export interface PolicyGateInput {
  connectorId: string;
  actionType?: string;
  commandPreview?: string;
  approved?: boolean;
  auth?: PolicyGateAuth;
}

export interface PolicyGateResult {
  ok: boolean;
  blocked: boolean;
  setupRequired: boolean;
  reason: string | null;
  riskLevel: ConnectorRiskLevel;
  confidence: string;
  verificationState: string;
}

export function getRuntimePolicySettings(): RuntimePolicySettings {
  // Default approvalMode to true (fail-safe) so that on first boot — before
  // SettingsContext's useEffect writes 'alphonso_settings' to localStorage —
  // the policy service and the UI show the same value. The old default of
  // `false` created a race where the first connector calls were ungated even
  // though the UI showed approval mode as on.
  const defaults: RuntimePolicySettings = {
    approvalMode: true,
    zeroCostMode: true,
    safeMode: true,
    localOnlyMode: true,
    previewMode: true
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      approvalMode: parsed.approvalMode !== false,
      zeroCostMode: parsed.zeroCostMode !== false,
      safeMode: parsed.safeMode !== false,
      localOnlyMode: parsed.localOnlyMode !== false,
      previewMode: parsed.previewMode !== false
    };
  } catch {
    return defaults;
  }
}

export async function getRuntimePolicySettingsAsync(): Promise<RuntimePolicySettings> {
  const defaults: RuntimePolicySettings = {
    approvalMode: true,
    zeroCostMode: true,
    safeMode: true,
    localOnlyMode: true,
    previewMode: true
  };
  try {
    const raw = await invoke<string | null>('kv_get', { key: SETTINGS_KEY });
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        approvalMode: parsed.approvalMode !== false,
        zeroCostMode: parsed.zeroCostMode !== false,
        safeMode: parsed.safeMode !== false,
        localOnlyMode: parsed.localOnlyMode !== false,
        previewMode: parsed.previewMode !== false
      };
    }
  } catch { /* fall back to localStorage-backed sync read below */ }
  return getRuntimePolicySettings();
}

export async function setRuntimePolicySettings(settings: Partial<RuntimePolicySettings>): Promise<void> {
  const current = getRuntimePolicySettings();
  const next = { ...current, ...settings };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  try {
    await invoke('kv_set', { key: SETTINGS_KEY, value: JSON.stringify(next) });
  } catch { /* SQLite not available outside Tauri — localStorage write above already succeeded */ }
  policyCache.delete('policy:settings:sync');
  policyCache.keys().filter(k => k.startsWith('policy:gate:')).forEach(k => policyCache.delete(k));
}

export function classifyConnectorRisk(connectorId: string, actionType: string = ''): ConnectorRiskLevel {
  const id = String(connectorId || '').toLowerCase();
  const action = String(actionType || '').toLowerCase();
  const cacheKey = createCacheKey('policy:risk', id, action);
  const cachedRisk = policyCache.get(cacheKey);
  if (cachedRisk !== null) return cachedRisk as ConnectorRiskLevel;

  let risk: ConnectorRiskLevel = 'low';
  if (id === 'youtube' || action.includes('publish') || action.includes('upload')) risk = 'high';
  // hermes_agents: unlike a bare chat-completion connector, a Hermes profile
  // is a full standing agent (terminal, code_execution, delegation, cronjob,
  // memory — see docs/HERMES_AGENT_DELEGATION_PLAN.md §1b.2) that can run real
  // tools while producing its answer, depending on that profile's own tool
  // config this app cannot see client-side. Classified high unconditionally
  // (like telegram/whatsapp), not by actionType pattern, since any call can
  // trigger tool use regardless of what actionType string is passed.
  else if (id === 'telegram' || id === 'whatsapp' || id === 'hermes_agents') risk = 'high';
  else if (id === 'chatgpt' || id === 'claude' || id === 'qwen' || id === 'notion' || id === 'clickup' || id === 'github' || id === 'slack' || id === 'discord') risk = 'medium';

  policyCache.set(cacheKey, risk, RISK_CACHE_TTL);
  return risk;
}

export function evaluatePolicyGate({
  connectorId,
  actionType = '',
  commandPreview = '',
  approved = false,
  auth = { enabled: false, isAuthorized: false }
}: PolicyGateInput): PolicyGateResult {
  const policy = getRuntimePolicySettings();
  const id = String(connectorId || '').toLowerCase();
  const action = String(actionType || '').toLowerCase();
  const preview = String(commandPreview || '').toLowerCase();
  const riskLevel = classifyConnectorRisk(id, action);
  const requiresApproval = HIGH_RISK_ACTION_PATTERNS.some((pattern) => pattern.test(action) || pattern.test(preview));
  const paidOrMetered = PAID_OR_METERED_CONNECTORS.has(id);

  if (policy.zeroCostMode && paidOrMetered && !approved) {
    return {
      ok: false,
      blocked: true,
      setupRequired: false,
      reason: `Zero-Cost Mode blocked ${id} without explicit override.`,
      riskLevel,
      confidence: TRUST_STATES.VERIFIED,
      verificationState: TRUST_STATES.PENDING
    };
  }

  if (policy.approvalMode && (requiresApproval || riskLevel === 'high') && !approved) {
    return {
      ok: false,
      blocked: true,
      setupRequired: false,
      reason: 'Approval Mode requires explicit approval for this action.',
      riskLevel,
      confidence: TRUST_STATES.VERIFIED,
      verificationState: TRUST_STATES.PENDING
    };
  }

  if (auth?.enabled && !auth?.isAuthorized) {
    return {
      ok: false,
      blocked: true,
      setupRequired: false,
      reason: 'Connector authorization failed against allowlist.',
      riskLevel,
      confidence: TRUST_STATES.VERIFIED,
      verificationState: TRUST_STATES.FAILED
    };
  }

  if (!canUseConnector(id) && !approved) {
    return {
      ok: false,
      blocked: true,
      setupRequired: false,
      reason: `Connector '${id}' requires a Pro license. Upgrade at alphonso.dev/pro`,
      riskLevel,
      confidence: TRUST_STATES.VERIFIED,
      verificationState: TRUST_STATES.PENDING
    };
  }

  return {
    ok: true,
    blocked: false,
    setupRequired: false,
    reason: null,
    riskLevel,
    confidence: TRUST_STATES.VERIFIED,
    verificationState: TRUST_STATES.VERIFIED
  };
}
