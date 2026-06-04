import { TRUST_STATES } from './trustModel';

const SETTINGS_KEY = 'alphonso_settings';

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

const HIGH_RISK_ACTION_PATTERNS: RegExp[] = [
  /upload/i,
  /publish/i,
  /post/i,
  /send/i,
  /external/i,
  /connector/i,
  /delete/i,
  /remove/i
];

export interface RuntimePolicySettings {
  approvalMode: boolean;
  zeroCostMode: boolean;
  safeMode: boolean;
  localOnlyMode: boolean;
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
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      approvalMode: parsed.approvalMode !== false,
      zeroCostMode: parsed.zeroCostMode !== false,
      safeMode: parsed.safeMode !== false,
      localOnlyMode: parsed.localOnlyMode !== false
    };
  } catch {
    return {
      approvalMode: true,
      zeroCostMode: true,
      safeMode: true,
      localOnlyMode: true
    };
  }
}

export function classifyConnectorRisk(connectorId: string, actionType: string = ''): ConnectorRiskLevel {
  const id = String(connectorId || '').toLowerCase();
  const action = String(actionType || '').toLowerCase();
  if (id === 'youtube' || action.includes('publish') || action.includes('upload')) return 'high';
  if (id === 'telegram' || id === 'whatsapp') return 'high';
  if (id === 'chatgpt' || id === 'claude' || id === 'qwen' || id === 'notion' || id === 'clickup') return 'medium';
  return 'low';
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
