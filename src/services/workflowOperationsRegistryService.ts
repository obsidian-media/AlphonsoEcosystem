/**
 * Operations registry — 16 predefined workflow operations with full governance metadata.
 * Each operation defines an agent sequence, risk level, allowed/blocked actions,
 * connector requirements, approval gates, receipt types, and memory behavior.
 * These are governed templates, not visual graphs.
 *
 * @see ./workflowBuilderService — visual/node-based workflow builder (user-created, stored as nodes+edges in localStorage)
 * @see ./workflowRegistryService — predefined agent-chain workflows (25+ workflows routed through Jose)
 * @see ./workflowExecutionService — execution engine that runs operations AND visual workflows
 * @see ./workflowGovernanceService — evaluates governance for these operations
 *
 * DIFFERENCE: workflowOperationsRegistryService = 16 predefined governed operations with rich metadata.
 *             workflowBuilderService = user-built visual workflows (nodes/edges) for arbitrary automation graphs.
 *             They are complementary — templates vs free-form graphs.
 */

import { invoke } from '@tauri-apps/api/core';
import { TRUST_STATES, timestampMs } from './trustModel';
import { persistScopeRows } from './runtimeLedgerService';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkflowOperation {
  id: string;
  name: string;
  purpose: string;
  triggerTypes: string[];
  agentSequence: string[];
  requiredApprovals: string[];
  riskLevel: string;
  allowedActions: string[];
  blockedActions: string[];
  memoryBehavior: string[];
  receiptsGenerated: string[];
  connectorRequirements: string[];
  setupRequired: string[];
  finalReportFormat: string;
  status?: string;
  trust?: string;
  verificationState?: string;
  createdAtMs?: number;
  updatedAtMs?: number;
  [key: string]: unknown;
}

interface LedgerRow {
  id: string;
  data: WorkflowOperation;
  status: string;
  confidence: string;
  verificationState: string;
  timestampMs: number;
  [key: string]: unknown;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WORKFLOW_OPS_KEY = 'alphonso_workflow_operations_registry_v1';
export const WORKFLOW_OPS_SCOPE = 'workflow_operations_registry_v1';

const DEFAULT_WORKFLOW_OPERATIONS: WorkflowOperation[] = [
  {
    id: 'wf-marketing-operations',
    name: 'Marketing Operations',
    purpose: 'Research, strategy, packaging, audit, approval, execution, monitoring.',
    triggerTypes: ['manual_command', 'scheduled_campaign'],
    agentSequence: ['hector', 'miya', 'alphonso', 'maria', 'shayan_approval', 'marcus', 'jose'],
    requiredApprovals: ['external_publish', 'connector_write', 'public_engagement'],
    riskLevel: 'high',
    allowedActions: ['research', 'creative_package', 'local_packaging', 'governance_audit', 'approved_distribution'],
    blockedActions: ['unapproved_publish', 'silent_upload', 'unsafe_connector_execution'],
    memoryBehavior: ['campaign_memory', 'runtime_memory', 'timeline_memory'],
    receiptsGenerated: ['assignment_created', 'approval_required', 'pipeline_completed'],
    connectorRequirements: ['youtube?optional', 'telegram?optional', 'whatsapp?optional'],
    setupRequired: ['Connector credentials and allowlists when publishing externally.'],
    finalReportFormat: 'summary+approved_actions+artifacts+urls'
  },
  {
    id: 'wf-social-media-management',
    name: 'Social Media Management',
    purpose: 'Platform growth with approval-gated publishing.',
    triggerTypes: ['manual_command', 'calendar_trigger'],
    agentSequence: ['hector', 'miya', 'alphonso', 'maria', 'shayan_approval', 'marcus', 'jose'],
    requiredApprovals: ['post', 'upload', 'reply_public'],
    riskLevel: 'high',
    allowedActions: ['trend_research', 'content_direction', 'asset_packaging', 'audit', 'approved_publish'],
    blockedActions: ['unsupervised_posting', 'account_actions_without_approval'],
    memoryBehavior: ['creative_memory', 'source_memory', 'timeline_memory'],
    receiptsGenerated: ['connector_policy_allow_or_block', 'assignment_executed_reported'],
    connectorRequirements: ['instagram?future', 'tiktok?future', 'youtube?optional'],
    setupRequired: ['External social connectors are setup-required unless configured.'],
    finalReportFormat: 'summary+posted_urls+blocked_actions+risk'
  },
  {
    id: 'wf-content-production',
    name: 'Content Production',
    purpose: 'Idea to publish-ready package with audit checkpoints.',
    triggerTypes: ['manual_command'],
    agentSequence: ['hector', 'miya', 'alphonso', 'maria', 'shayan_approval', 'marcus', 'jose'],
    requiredApprovals: ['publish', 'external_distribution'],
    riskLevel: 'medium',
    allowedActions: ['topic_research', 'script_storyboard', 'asset_metadata_package', 'quality_audit'],
    blockedActions: ['auto_publish_without_approval'],
    memoryBehavior: ['creative_memory', 'project_memory', 'timeline_memory'],
    receiptsGenerated: ['agent_report_received', 'jose_merge_confirm_reported'],
    connectorRequirements: ['youtube?optional', 'telegram?optional'],
    setupRequired: ['Publishing URLs returned only when connector execution succeeds.'],
    finalReportFormat: 'package_summary+artifacts+approval_state+urls'
  },
  {
    id: 'wf-learning-skill-development',
    name: 'Learning & Skill Development',
    purpose: 'Research resources, build path, track progress, preserve outcomes.',
    triggerTypes: ['manual_command'],
    agentSequence: ['hector', 'miya', 'alphonso', 'echo', 'maria', 'jose'],
    requiredApprovals: ['none_high_risk_default'],
    riskLevel: 'low',
    allowedActions: ['resource_research', 'learning_plan', 'practice_setup', 'memory_preservation'],
    blockedActions: ['paid_connector_usage_without_approval'],
    memoryBehavior: ['project_memory', 'task_memory', 'timeline_memory'],
    receiptsGenerated: ['command_distributed', 'pipeline_completed'],
    connectorRequirements: ['none_required'],
    setupRequired: ['Optional paid providers remain blocked by zero-cost mode unless approved.'],
    finalReportFormat: 'learning_plan+milestones+next_steps'
  },
  {
    id: 'wf-startup-product-development',
    name: 'Startup/Product Development',
    purpose: 'Market + UX + roadmap + MVP build + governance + launch coordination.',
    triggerTypes: ['manual_command'],
    agentSequence: ['hector', 'miya', 'jose', 'alphonso', 'maria', 'marcus', 'echo'],
    requiredApprovals: ['external_publish', 'account_actions', 'paid_connectors'],
    riskLevel: 'high',
    allowedActions: ['market_research', 'product_vision', 'roadmap_decomposition', 'mvp_build', 'audit'],
    blockedActions: ['unsupervised_deploy', 'unsupervised_posting'],
    memoryBehavior: ['project_memory', 'orchestration_memory', 'timeline_memory'],
    receiptsGenerated: ['assignment_retry_requested', 'retry_exhausted_dead_letter'],
    connectorRequirements: ['notion?optional', 'clickup?optional', 'youtube?optional'],
    setupRequired: ['External connectors require credentials + authorization profile.'],
    finalReportFormat: 'roadmap+build_status+risk+approval_blockers'
  },
  {
    id: 'wf-opportunity-discovery',
    name: 'Opportunity Discovery',
    purpose: 'Scan opportunities, score, angle, audit, prioritize, approve pursuit.',
    triggerTypes: ['manual_command', 'scheduled_scan'],
    agentSequence: ['hector', 'nova', 'miya', 'maria', 'jose', 'shayan_approval'],
    requiredApprovals: ['opportunity_pursuit'],
    riskLevel: 'medium',
    allowedActions: ['research_scan', 'opportunity_scoring', 'strategy_angle', 'risk_audit'],
    blockedActions: ['automatic_market_engagement'],
    memoryBehavior: ['research_memory', 'opportunity_memory', 'timeline_memory'],
    receiptsGenerated: ['policy_gate_blocked', 'approval_required'],
    connectorRequirements: ['none_required'],
    setupRequired: ['Live external execution remains disabled without explicit approved path.'],
    finalReportFormat: 'score_matrix+recommendation+risk+next_action'
  },
  {
    id: 'wf-construction-operations',
    name: 'Construction Operations',
    purpose: 'Vendors/materials/regulations research, proposals, quotes, updates.',
    triggerTypes: ['manual_command'],
    agentSequence: ['hector', 'miya', 'alphonso', 'maria', 'marcus', 'jose'],
    requiredApprovals: ['client_send', 'contract_finalize', 'external_message'],
    riskLevel: 'high',
    allowedActions: ['vendor_research', 'proposal_design', 'quote_documentation', 'compliance_audit'],
    blockedActions: ['contract_commit_without_approval'],
    memoryBehavior: ['project_memory', 'workspace_memory', 'timeline_memory'],
    receiptsGenerated: ['connector_policy_allow_or_block', 'jose_merge_confirm_reported'],
    connectorRequirements: ['whatsapp?optional', 'telegram?optional'],
    setupRequired: ['Customer messaging connectors remain setup-required unless configured.'],
    finalReportFormat: 'proposal+quotes+risks+client_update_state'
  },
  {
    id: 'wf-knowledge-preservation',
    name: 'Knowledge Preservation',
    purpose: 'Organize and govern institutional memory lifecycle.',
    triggerTypes: ['manual_command', 'session_close'],
    agentSequence: ['echo', 'jose', 'maria', 'alphonso'],
    requiredApprovals: ['retention_policy_changes'],
    riskLevel: 'low',
    allowedActions: ['memory_organize', 'importance_tagging', 'retention_audit', 'retrieval_index_update'],
    blockedActions: ['silent_deletion'],
    memoryBehavior: ['all_categories'],
    receiptsGenerated: ['assignment_created', 'pipeline_completed'],
    connectorRequirements: ['none_required'],
    setupRequired: ['Vector/semantic indexing remains setup-required.'],
    finalReportFormat: 'memory_changes+retention_flags+retrieval_refs'
  },
  {
    id: 'wf-content-repurposing',
    name: 'Content Repurposing',
    purpose: 'Transform long-form content into platform-specific packages.',
    triggerTypes: ['manual_command'],
    agentSequence: ['miya', 'alphonso', 'maria', 'marcus', 'jose'],
    requiredApprovals: ['distribution', 'external_posting'],
    riskLevel: 'medium',
    allowedActions: ['repurposing_strategy', 'asset_packaging', 'audit', 'approved_distribution'],
    blockedActions: ['automatic_cross_posting'],
    memoryBehavior: ['creative_memory', 'timeline_memory'],
    receiptsGenerated: ['assignment_executed_reported', 'pipeline_completed'],
    connectorRequirements: ['youtube?optional', 'telegram?optional'],
    setupRequired: ['Publishing targets require configured connectors + approval.'],
    finalReportFormat: 'asset_pack+platform_plan+approval_state'
  },
  {
    id: 'wf-automation-governance',
    name: 'Automation Governance',
    purpose: 'Audit automation proposals before any execution path.',
    triggerTypes: ['manual_command', 'automation_proposal'],
    agentSequence: ['maria', 'sentinel', 'jose', 'shayan_approval', 'alphonso'],
    requiredApprovals: ['automation_activation', 'risky_local_action', 'external_connector_execution'],
    riskLevel: 'critical',
    allowedActions: ['risk_audit', 'security_impact_check', 'dependency_review', 'approved_execution'],
    blockedActions: ['auto_activation_without_approval'],
    memoryBehavior: ['orchestration_memory', 'runtime_memory', 'timeline_memory'],
    receiptsGenerated: ['approval_required', 'policy_gate_blocked', 'pipeline_completed'],
    connectorRequirements: ['depends_on_automation_target'],
    setupRequired: ['Execution adapters must be explicitly enabled and approved.'],
    finalReportFormat: 'risk_audit+approval_matrix+execution_receipts'
  },
  {
    id: 'wf-research-operations',
    name: 'Research Operations',
    purpose: 'Question to research synthesis with citation confidence and archival.',
    triggerTypes: ['manual_command', 'scheduled_scan'],
    agentSequence: ['hector', 'nova', 'maria', 'jose', 'echo'],
    requiredApprovals: ['external_write_if_any'],
    riskLevel: 'medium',
    allowedActions: ['citation_research', 'analysis', 'verification', 'synthesis', 'archival'],
    blockedActions: ['unverified_public_claims'],
    memoryBehavior: ['research_memory', 'source_memory', 'citation_memory', 'timeline_memory'],
    receiptsGenerated: ['queued', 'executed', 'partial', 'failed'],
    connectorRequirements: ['none_required'],
    setupRequired: ['External publication adapters remain setup-required unless configured.'],
    finalReportFormat: 'summary+citations+confidence+risk'
  },
  {
    id: 'wf-crisis-management-operations',
    name: 'Crisis Management Operations',
    purpose: 'Detect issue, classify severity, orchestrate diagnostics and containment.',
    triggerTypes: ['incident_alert', 'manual_command'],
    agentSequence: ['sentinel', 'maria', 'jose', 'alphonso', 'marcus', 'echo'],
    requiredApprovals: ['external_response', 'high_risk_runtime_actions'],
    riskLevel: 'critical',
    allowedActions: ['issue_detection', 'severity_review', 'orchestrated_response', 'diagnostics', 'incident_archive'],
    blockedActions: ['silent_recovery', 'external_response_without_approval'],
    memoryBehavior: ['runtime_memory', 'orchestration_memory', 'timeline_memory'],
    receiptsGenerated: ['blocked', 'approval_required', 'executed', 'failed'],
    connectorRequirements: ['telegram?optional', 'whatsapp?optional'],
    setupRequired: ['External crisis notifications are setup-required until messaging connectors are configured.'],
    finalReportFormat: 'incident_summary+severity+response_actions+recovery_state'
  },
  {
    id: 'wf-ecosystem-learning-operations',
    name: 'Ecosystem Learning Operations',
    purpose: 'Analyze workflow telemetry and suggest optimization improvements.',
    triggerTypes: ['scheduled_review', 'manual_command'],
    agentSequence: ['nova', 'echo', 'maria', 'jose'],
    requiredApprovals: ['apply_optimization_changes'],
    riskLevel: 'low',
    allowedActions: ['telemetry_analysis', 'history_comparison', 'validation', 'optimization_suggestions'],
    blockedActions: ['autonomous_policy_override'],
    memoryBehavior: ['timeline_memory', 'orchestration_memory', 'project_memory'],
    receiptsGenerated: ['queued', 'executed', 'partial'],
    connectorRequirements: ['none_required'],
    setupRequired: ['None for local analytics baseline.'],
    finalReportFormat: 'performance_trends+optimization_recommendations+confidence'
  },
  {
    id: 'wf-human-collaboration-operations',
    name: 'Human Collaboration Operations',
    purpose: 'Coordinate assignments and approvals across human and AI participants.',
    triggerTypes: ['manual_command', 'assignment_intake'],
    agentSequence: ['jose', 'maria', 'alphonso', 'miya', 'marcus', 'echo'],
    requiredApprovals: ['external_contributor_actions', 'public_or_client_delivery'],
    riskLevel: 'medium',
    allowedActions: ['assignment_planning', 'approval_handoff', 'execution_tracking', 'collaboration_receipts'],
    blockedActions: ['hidden_human_actions', 'unapproved_external_delivery'],
    memoryBehavior: ['task_memory', 'orchestration_memory', 'timeline_memory'],
    receiptsGenerated: ['queued', 'approved', 'executed', 'partial'],
    connectorRequirements: ['notion?optional', 'clickup?optional', 'telegram?optional'],
    setupRequired: ['External contributor integrations remain setup-required unless configured.'],
    finalReportFormat: 'assignment_status+handoffs+approvals+deliverables'
  },
  {
    id: 'wf-financial-intelligence-operations',
    name: 'Financial Intelligence Operations',
    purpose: 'Track usage cost structure and forecast risk/opportunity at workflow level.',
    triggerTypes: ['scheduled_review', 'manual_command'],
    agentSequence: ['nova', 'hector', 'maria', 'jose', 'echo'],
    requiredApprovals: ['paid_connector_enablement'],
    riskLevel: 'medium',
    allowedActions: ['cost_tracking', 'roi_analysis', 'forecasting', 'governance_review'],
    blockedActions: ['automatic_paid_connector_activation'],
    memoryBehavior: ['runtime_memory', 'project_memory', 'timeline_memory'],
    receiptsGenerated: ['queued', 'blocked', 'executed', 'setup_required'],
    connectorRequirements: ['none_required'],
    setupRequired: ['Real billing provider ingestion remains setup-required for live cloud cost data.'],
    finalReportFormat: 'cost_summary+roi_estimate+forecast+risk'
  },
  {
    id: 'wf-reputation-brand-monitoring-operations',
    name: 'Reputation & Brand Monitoring Operations',
    purpose: 'Monitor sentiment/anomalies and coordinate approved responses.',
    triggerTypes: ['scheduled_scan', 'manual_command', 'incident_alert'],
    agentSequence: ['hector', 'nova', 'sentinel', 'maria', 'marcus', 'jose'],
    requiredApprovals: ['public_response', 'external_posting'],
    riskLevel: 'high',
    allowedActions: ['monitoring', 'sentiment_analysis', 'anomaly_detection', 'risk_review', 'approved_response'],
    blockedActions: ['unapproved_public_response'],
    memoryBehavior: ['research_memory', 'timeline_memory', 'orchestration_memory'],
    receiptsGenerated: ['queued', 'approval_required', 'partial', 'executed'],
    connectorRequirements: ['telegram?optional', 'whatsapp?optional', 'youtube?optional'],
    setupRequired: ['Live social listening adapters are setup-required until connector providers are configured.'],
    finalReportFormat: 'sentiment_state+anomalies+risk+approved_response_plan'
  }
];

function readRows(): WorkflowOperation[] {
  try {
    const raw = localStorage.getItem(WORKFLOW_OPS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRows(rows: WorkflowOperation[]): void {
  const next = rows.slice(-120);
  try {
    invoke('kv_set', { key: WORKFLOW_OPS_KEY, value: JSON.stringify(next) }).catch(() => {});
  } catch {
    // SQLite not available in browser
  }
  localStorage.setItem(WORKFLOW_OPS_KEY, JSON.stringify(next));
  persistScopeRows(WORKFLOW_OPS_SCOPE, next, (row: WorkflowOperation): LedgerRow => ({
    id: row.id,
    data: row,
    status: row.status || 'active',
    confidence: row.trust || TRUST_STATES.TEMPORARY,
    verificationState: row.verificationState || TRUST_STATES.UNVERIFIED,
    timestampMs: Number(row.updatedAtMs || row.createdAtMs || timestampMs())
  }));
}

function seedDefaults(): WorkflowOperation[] {
  const existing = readRows();
  const byId = new Map(existing.map((item) => [item.id, item]));
  DEFAULT_WORKFLOW_OPERATIONS.forEach((workflow) => {
    const prior = byId.get(workflow.id);
    byId.set(workflow.id, {
      ...workflow,
      ...(prior || {}),
      id: workflow.id,
      name: workflow.name,
      purpose: workflow.purpose,
      triggerTypes: workflow.triggerTypes,
      agentSequence: workflow.agentSequence,
      requiredApprovals: workflow.requiredApprovals,
      riskLevel: workflow.riskLevel,
      allowedActions: workflow.allowedActions,
      blockedActions: workflow.blockedActions,
      memoryBehavior: workflow.memoryBehavior,
      receiptsGenerated: workflow.receiptsGenerated,
      connectorRequirements: workflow.connectorRequirements,
      setupRequired: workflow.setupRequired,
      finalReportFormat: workflow.finalReportFormat,
      status: prior?.status || 'active',
      trust: prior?.trust || TRUST_STATES.TEMPORARY,
      verificationState: prior?.verificationState || TRUST_STATES.UNVERIFIED,
      createdAtMs: prior?.createdAtMs || timestampMs(),
      updatedAtMs: timestampMs()
    });
  });
  const next = [...byId.values()];
  writeRows(next);
  return next;
}

export function listWorkflowOperations(): WorkflowOperation[] {
  return seedDefaults();
}

export function updateWorkflowOperationStatus(workflowId: string, status: string, patch: Partial<WorkflowOperation> = {}): WorkflowOperation | null {
  if (!workflowId || !status) return null;
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) patch = {};
  const rows = listWorkflowOperations().map((item) => (
    item.id === workflowId
      ? {
        ...item,
        ...patch,
        status,
        updatedAtMs: timestampMs()
      }
      : item
  ));
  writeRows(rows);
  return rows.find((item) => item.id === workflowId) || null;
}

export function getWorkflowOperation(workflowId: string): WorkflowOperation | null {
  return listWorkflowOperations().find((item) => item.id === workflowId) || null;
}
