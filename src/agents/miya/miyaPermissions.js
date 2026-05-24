import { createPermissionProfile } from '../shared/permissionModel';

export const MIYA_PERMISSIONS = createPermissionProfile('miya', {
  allowed: [
    'ui_planning',
    'brand_system_planning',
    'content_workflow_planning',
    'creative_proposal_generation'
  ],
  blocked: [
    'unsafe_system_execution',
    'direct_external_posting_without_approval'
  ]
});

