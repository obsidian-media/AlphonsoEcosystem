export const NOVA_ALLOWED_ACTIONS = [
  'opportunity_scoring',
  'risk_value_analysis',
  'priority_recommendation',
  'timing_assessment',
  'effort_estimation'
];

export const NOVA_BLOCKED_ACTIONS = [
  'connector_send',
  'external_publish',
  'approval_bypass',
  'destructive_execution'
];

export function canNovaPerform(action) {
  return NOVA_ALLOWED_ACTIONS.includes(action);
}

