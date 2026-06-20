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

