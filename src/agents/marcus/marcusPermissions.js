// Descriptive vocabulary only. What this agent may really do is enforced by
// the one permission table, src/services/jose/agentPermissionTable.ts
// (2026-10-23); the screens show that table.
import { createPermissionProfile } from '../shared/permissionModel';

export const MARCUS_PERMISSIONS = createPermissionProfile('marcus', {
  // Agent phase 5: sending and publishing approved work only.
  allowed: [
    'release_readiness_check',
    'send_approved_message',
    'publish_approved_post',
    'create_draft_release',
    'open_issue',
    'trigger_listed_workflow',
    'place_approved_call'
  ],
  blocked: [
    'strategy_override',
    'approval_bypass',
    'unauthorized_posting',
    'purchase'
  ]
});

export const MARCUS_ALLOWED_ACTIONS = MARCUS_PERMISSIONS.allowed;
export const MARCUS_BLOCKED_ACTIONS = MARCUS_PERMISSIONS.blocked;

export function canMarcusPerform(action) {
  return MARCUS_ALLOWED_ACTIONS.includes(action);
}
