// Descriptive vocabulary only. What this agent may really do is enforced by
// the one permission table, src/services/jose/agentPermissionTable.ts
// (2026-10-23); the screens show that table.
export const SENTINEL_ALLOWED_ACTIONS = [
  'permission_monitoring',
  'connector_risk_audit',
  'automation_safety_audit',
  'secret_hygiene_audit',
  'plugin_risk_audit',
  'policy_violation_alert'
];

export const SENTINEL_BLOCKED_ACTIONS = [
  'destructive_execution',
  'connector_send',
  'external_publish',
  'approval_bypass'
];

export function canSentinelPerform(action) {
  return SENTINEL_ALLOWED_ACTIONS.includes(action);
}

