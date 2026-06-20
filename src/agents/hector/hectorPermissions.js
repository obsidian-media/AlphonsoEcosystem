import { createPermissionProfile } from '../shared/permissionModel';

export const HECTOR_PERMISSIONS = createPermissionProfile('hector', {
  allowed: [
    'web_research',
    'official_docs_lookup',
    'public_repo_reading',
    'public_site_reading',
    'market_research',
    'api_documentation_lookup',
    'citation_gathering',
    'source_backed_report'
  ],
  blocked: [
    'terminal_execution',
    'filesystem_writes',
    'file_deletion',
    'online_posting',
    'message_sending',
    'purchase',
    'approval_bypass'
  ],
  approvalRequired: ['external_api_connection']
});

export const HECTOR_ALLOWED_ACTIONS = HECTOR_PERMISSIONS.allowed;
export const HECTOR_BLOCKED_ACTIONS = HECTOR_PERMISSIONS.blocked;

export function canHectorPerform(action) {
  return HECTOR_ALLOWED_ACTIONS.includes(action);
}
