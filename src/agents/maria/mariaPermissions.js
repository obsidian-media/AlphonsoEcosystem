import { createPermissionProfile } from '../shared/permissionModel';

export const MARIA_PERMISSIONS = createPermissionProfile('maria', {
  allowed: [
    'requirements_planning',
    'roadmap_creation',
    'backlog_management',
    'acceptance_criteria_definition',
    'milestone_tracking',
    'documentation_assistance'
  ],
  blocked: [
    'external_publish',
    'external_message_send',
    'file_delete',
    'destructive_execution',
    'approval_bypass',
    'secret_access_without_scope'
  ]
});

export const MARIA_ALLOWED_ACTIONS = MARIA_PERMISSIONS.allowed;
export const MARIA_BLOCKED_ACTIONS = MARIA_PERMISSIONS.blocked;

export function canMariaPerform(action) {
  return MARIA_ALLOWED_ACTIONS.includes(action);
}
