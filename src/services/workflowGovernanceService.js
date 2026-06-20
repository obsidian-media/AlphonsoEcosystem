/**
 * Governance evaluation for workflow operations.
 * Checks connector availability, risk levels, zero-cost mode blocking,
 * and agent participation for the operations registry.
 *
 * @see ./workflowOperationsRegistryService — operations whose governance this service evaluates
 * @see ./workflowExecutionService — execution engine that gates runs through evaluateWorkflowGovernance
 * @see ./workflowBuilderService — visual builder workflows (not governed by this service)
 *
 * DIFFERENCE: This service evaluates governance for operations-registry workflows only.
 *             Visual builder workflows are executed directly without governance pre-checks.
 */

import { TRUST_STATES } from './trustModel';
import { listConnectors } from './connectorRegistryService';

export const WORKFLOW_EXECUTION_STATES = [
  'queued',
  'in_progress',
  'approval_required',
  'setup_required',
  'executed',
  'partial',
  'failed',
  'blocked',
  'completed'
];

const CONNECTOR_ID_MAP = {
  youtube: 'youtube',
  telegram: 'telegram',
  whatsapp: 'whatsapp',
  notion: 'notion',
  clickup: 'clickup',
  instagram: 'instagram',
  tiktok: 'tiktok',
  webhooks: 'webhooks',
  comfyui: 'comfyui_video',
  sd_webui: 'sd_webui'
};

export function evaluateWorkflowGovernance(workflow, options = {}) {
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) workflow = {};
  if (typeof options !== 'object' || options === null) options = {};
  const connectors = listConnectors();
  const connectorStatus = Object.fromEntries(connectors.map((connector) => [connector.id, connector.status]));
  const requiredConnectors = parseConnectorRequirements(workflow?.connectorRequirements || []);
  const unavailableConnectors = requiredConnectors
    .map((name) => CONNECTOR_ID_MAP[name] || name)
    .filter((id) => {
      const status = connectorStatus[id];
      return status !== 'configured';
    });

  const normalizedApprovals = Array.isArray(workflow?.requiredApprovals)
    ? workflow.requiredApprovals.filter((item) => String(item || '').toLowerCase() !== 'none_high_risk_default')
    : [];
  const requiresApproval = normalizedApprovals.length > 0;
  const riskLevel = String(workflow?.riskLevel || 'medium').toLowerCase();
  const zeroCostMode = Boolean(options?.zeroCostMode);
  const includesPaidPath = requiredConnectors.some((name) => ['chatgpt', 'claude', 'qwen', 'paid_provider'].includes(name));
  const blockedByZeroCost = zeroCostMode && includesPaidPath;

  const setupRequired = unavailableConnectors.length > 0;
  const blocked = blockedByZeroCost;

  return {
    ok: !blocked,
    workflowId: workflow?.id || null,
    riskLevel,
    requiresApproval,
    setupRequired,
    blocked,
    unavailableConnectors,
    blockedByZeroCost,
    confidence: setupRequired || blocked ? TRUST_STATES.PENDING : TRUST_STATES.VERIFIED,
    verificationState: setupRequired || blocked ? TRUST_STATES.PENDING : TRUST_STATES.VERIFIED,
    notes: [
      setupRequired ? 'One or more connector paths are not configured.' : 'Connector requirements satisfied for local foundation.',
      blockedByZeroCost ? 'Zero-cost mode blocks paid/metered provider path.' : 'Zero-cost policy check passed.'
    ],
    normalizedApprovals
  };
}

export function getAgentWorkflowParticipation(workflow) {
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) return [];
  const sequence = Array.isArray(workflow.agentSequence) ? workflow.agentSequence : [];
  return sequence.map((agent, index) => ({
    agent,
    order: index + 1,
    canExecute: !['shayan_approval', 'user_approval'].includes(agent),
    requiresHumanApprovalStage: agent === 'shayan_approval' || agent === 'user_approval'
  }));
}

function parseConnectorRequirements(rows) {
  return rows
    .map((row) => String(row || '').toLowerCase().split('?')[0].trim())
    .filter(Boolean)
    .filter((value) => value !== 'none_required' && value !== 'depends_on_automation_target');
}
