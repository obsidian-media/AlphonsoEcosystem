import { createPermissionProfile } from '../shared/permissionModel';

export const MARCUS_PERMISSIONS = createPermissionProfile('marcus', {
  allowed: [
    'generate_audit_report',
    'security_review',
    'risk_detection',
    'integration_validation',
    'release_readiness_check'
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
