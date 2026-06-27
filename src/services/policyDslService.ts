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
