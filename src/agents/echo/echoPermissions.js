// Descriptive vocabulary only. What this agent may really do is enforced by
// the one permission table, src/services/jose/agentPermissionTable.ts
// (2026-10-23); the screens show that table.
export const ECHO_ALLOWED_ACTIONS = [
  'memory_preservation',
  'decision_capture',
  'retention_classification',
  'confidence_normalization',
  'knowledge_indexing'
];

export const ECHO_BLOCKED_ACTIONS = [
  'external_publish',
  'connector_send',
  'approval_bypass',
  'destructive_execution'
];

export function canEchoPerform(action) {
  return ECHO_ALLOWED_ACTIONS.includes(action);
}

