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
] as const;

export type WorkflowExecutionState = typeof WORKFLOW_EXECUTION_STATES[number];

interface ConnectorInfo {
  id: string;
  status: string;
  [key: string]: unknown;
}

interface WorkflowInput {
  id?: string;
  connectorRequirements?: string[];
  requiredApprovals?: string[];
  riskLevel?: string;
  agentSequence?: string[];
  name?: string;
  purpose?: string;
  triggerTypes?: string[];
}

interface GovernanceOptions {
  zeroCostMode?: boolean;
  [key: string]: unknown;
}

export interface WorkflowGovernanceResult {
  ok: boolean;
  workflowId: string | null;
  riskLevel: string;
  requiresApproval: boolean;
  setupRequired: boolean;
  blocked: boolean;
  unavailableConnectors: string[];
  blockedByZeroCost: boolean;
  confidence: string;
  verificationState: string;
  notes: string[];
  normalizedApprovals: string[];
}

export interface AgentWorkflowParticipation {
  agent: string;
  order: number;
  canExecute: boolean;
  requiresHumanApprovalStage: boolean;
}

const CONNECTOR_ID_MAP: Record<string, string> = {
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

export function evaluateWorkflowGovernance(workflow: WorkflowInput | null, options: GovernanceOptions = {}): WorkflowGovernanceResult {
  const wf: WorkflowInput = (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) ? {} : workflow;
  const opts: GovernanceOptions = (typeof options !== 'object' || options === null) ? {} : options;
  const connectors = listConnectors() as ConnectorInfo[];
  const connectorStatus = Object.fromEntries(connectors.map((connector) => [connector.id, connector.status]));
  const requiredConnectors = parseConnectorRequirements(wf.connectorRequirements || []);
  const unavailableConnectors = requiredConnectors
    .map((name) => CONNECTOR_ID_MAP[name] || name)
    .filter((id) => {
      const status = connectorStatus[id];
      return status !== 'configured';
    });

  const normalizedApprovals = Array.isArray(wf.requiredApprovals)
    ? wf.requiredApprovals.filter((item) => String(item || '').toLowerCase() !== 'none_high_risk_default')
    : [];
  const requiresApproval = normalizedApprovals.length > 0;
  const riskLevel = String(wf.riskLevel || 'medium').toLowerCase();
  const zeroCostMode = Boolean(opts.zeroCostMode);
  const includesPaidPath = requiredConnectors.some((name) => ['chatgpt', 'claude', 'qwen', 'paid_provider'].includes(name));
  const blockedByZeroCost = zeroCostMode && includesPaidPath;

  const setupRequired = unavailableConnectors.length > 0;
  const blocked = blockedByZeroCost;

  return {
    ok: !blocked,
    workflowId: wf.id || null,
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

export function getAgentWorkflowParticipation(workflow: WorkflowInput | null): AgentWorkflowParticipation[] {
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) return [];
  const sequence = Array.isArray(workflow.agentSequence) ? workflow.agentSequence : [];
  return sequence.map((agent, index) => ({
    agent,
    order: index + 1,
    canExecute: !['user_approval', 'user_approval'].includes(agent),
    requiresHumanApprovalStage: agent === 'user_approval' || agent === 'user_approval'
  }));
}

function parseConnectorRequirements(rows: string[]): string[] {
  return rows
    .map((row) => String(row || '').toLowerCase().split('?')[0].trim())
    .filter(Boolean)
    .filter((value) => value !== 'none_required' && value !== 'depends_on_automation_target');
}
