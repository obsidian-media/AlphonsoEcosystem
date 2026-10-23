// Descriptive vocabulary only. What this agent may really do is enforced by
// the one permission table, src/services/jose/agentPermissionTable.ts
// (2026-10-23); the screens show that table.
import { createPermissionProfile } from '../shared/permissionModel';

export const ALPHONSO_PERMISSIONS = createPermissionProfile('alphonso', {
  allowed: [
    'implementation_planning',
    'build_test_planning',
    'verification_reporting',
    'propose_patch'
  ],
  blocked: [
    'silent_destructive_command',
    'production_deploy_without_approval'
  ]
});

