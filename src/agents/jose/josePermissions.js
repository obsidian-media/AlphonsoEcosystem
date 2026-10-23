// Descriptive vocabulary only. What this agent may really do is enforced by
// the one permission table, src/services/jose/agentPermissionTable.ts
// (2026-10-23); the screens show that table.
import { createPermissionProfile } from '../shared/permissionModel';

export const JOSE_PERMISSIONS = createPermissionProfile('jose', {
  allowed: [
    'plan_project',
    'decompose_work',
    'route_tasks',
    'synthesize_outputs',
    'create_approval_gate'
  ],
  blocked: [
    'approval_bypass',
    'direct_external_publish',
    'unsupervised_file_delete'
  ],
  approvalRequired: [
    'external_connector_execution',
    'high_risk_action_override'
  ]
});

