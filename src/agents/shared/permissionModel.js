export const BASE_ALLOWED_ACTIONS = Object.freeze([
  'generate_plan',
  'generate_code',
  'generate_ui',
  'generate_report',
  'generate_research_summary',
  'generate_audit_report',
  'create_task_packet',
  'propose_file_changes'
]);

export const BASE_BLOCKED_ACTIONS = Object.freeze([
  'delete_files',
  'overwrite_files',
  'access_private_accounts',
  'send_messages',
  'make_purchases',
  'deploy_production',
  'run_external_automation',
  'expose_secrets'
]);

export const BASE_APPROVAL_REQUIRED_ACTIONS = Object.freeze([
  'file_write',
  'dependency_install',
  'terminal_command',
  'deployment',
  'external_api_connection',
  'production_config_change',
  'secret_rotation',
  'payout_payment_action',
  'external_posting_uploading'
]);

export function createPermissionProfile(agentId, overrides = {}) {
  return {
    agentId,
    allowed: [...BASE_ALLOWED_ACTIONS, ...(overrides.allowed || [])],
    blocked: [...BASE_BLOCKED_ACTIONS, ...(overrides.blocked || [])],
    approvalRequired: [...BASE_APPROVAL_REQUIRED_ACTIONS, ...(overrides.approvalRequired || [])]
  };
}

