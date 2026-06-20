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

