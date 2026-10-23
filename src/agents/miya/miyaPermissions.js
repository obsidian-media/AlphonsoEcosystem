// Descriptive vocabulary only. What this agent may really do is enforced by
// the one permission table, src/services/jose/agentPermissionTable.ts
// (2026-10-23); the screens show that table.
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

