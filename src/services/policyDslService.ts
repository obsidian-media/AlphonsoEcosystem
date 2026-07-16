export interface PolicyRule {
  id: string;
  description: string;
  match: Record<string, string>;
  effect: 'allow' | 'deny' | 'require_consent';
}

export interface PolicyResult {
  allowed: boolean;
  effect: 'allow' | 'deny' | 'require_consent';
  ruleId?: string;
  reason?: string;
}

// Module-level policy rules (embedded from policy.yaml — separate from policyEnforcementService)
const MODULE_POLICY_RULES: PolicyRule[] = [
  {
    id: 'block_delete_all',
    description: 'Block bulk delete operations',
    match: { action: 'delete', scope: 'all' },
    effect: 'deny',
  },
  {
    id: 'require_consent_external_publish',
    description: 'Require user consent before publishing to external services',
    match: { action: 'publish', target: 'external' },
    effect: 'require_consent',
  },
  {
    id: 'require_consent_financial',
    description: 'Require consent for any financial action',
    match: { action: 'payment' },
    effect: 'require_consent',
  },
  {
    id: 'allow_read_only',
    description: 'Allow all read-only operations',
    match: { action: 'read' },
    effect: 'allow',
  },
  {
    id: 'allow_internal_memory',
    description: 'Allow writing to internal memory stores',
    match: { action: 'write', target: 'memory' },
    effect: 'allow',
  },
  {
    id: 'deny_credential_export',
    description: 'Block exporting credentials or secrets',
    match: { action: 'export', target: 'credentials' },
    effect: 'deny',
  },
  {
    id: 'require_consent_agent_spawn',
    description: 'Require consent before spawning new agent processes',
    match: { action: 'spawn', target: 'agent' },
    effect: 'require_consent',
  },
  {
    id: 'allow_internal_default',
    description: 'Default allow for internal operations',
    match: { target: 'internal' },
    effect: 'allow',
  },
  // --- Connector action-type tiers (matched on the actual action-type string
  // connectors pass as `action`, e.g. 'external_publish'). These MUST precede
  // the low-risk catch-all below so irreversible/costly actions are classified
  // require_consent rather than silently allowed. This replaces the former
  // single blanket `allow` for all `target: 'external'` actions, which meant
  // this layer returned `allow` for *every* connector action — including
  // publishing and paid sends — and therefore failed OPEN if ever consulted as
  // authoritative. It is now risk-accurate; `gateConnectorAction` enforces the
  // require_consent tier (respecting an explicit `approved` flag).
  {
    id: 'require_consent_connector_publish',
    description: 'Publishing to an external service is effectively irreversible — require explicit consent',
    match: { action: 'external_publish' },
    effect: 'require_consent',
  },
  {
    id: 'require_consent_connector_paid',
    description: 'Paid/metered connector calls incur real cost — require explicit consent',
    match: { action: 'paid_connector_send' },
    effect: 'require_consent',
  },
  {
    id: 'allow_connector_external_default',
    description: 'Low-risk catch-all for connector external actions (external_send, message_send, external_write, local_image_generation, etc.). Real authorization (credentials, enablement, Zero-Cost Mode, per-action approval) is still enforced by the primary policy gate (evaluatePolicyGate); this layer is defense-in-depth. Kept as an explicit allow so an unrecognised low-risk action-type does not fail closed and silently break a connector — irreversible/costly types are classified above as require_consent, and the true default (no match at all) remains deny.',
    match: { target: 'external' },
    effect: 'allow',
  },
];

function ruleMatches(rule: PolicyRule, context: Record<string, string>): boolean {
  return Object.entries(rule.match).every(([k, v]) => context[k] === v);
}

export function loadPolicy(): PolicyRule[] {
  return MODULE_POLICY_RULES;
}

export function evaluateAction(
  action: string,
  context: Record<string, string>
): PolicyResult {
  const fullContext = { ...context, action };
  for (const rule of MODULE_POLICY_RULES) {
    if (ruleMatches(rule, fullContext)) {
      return {
        allowed: rule.effect === 'allow',
        effect: rule.effect,
        ruleId: rule.id,
        reason: rule.description,
      };
    }
  }
  return {
    allowed: false,
    effect: 'deny',
    reason: 'No matching policy rule — default deny',
  };
}

export function getPolicyRules(): PolicyRule[] {
  return MODULE_POLICY_RULES;
}
