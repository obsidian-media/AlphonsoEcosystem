const nowIso = () => new Date().toISOString();

function createBaseOutput({
  type,
  agentId,
  projectId,
  title,
  summary,
  status = 'draft',
  confidence = 'inferred',
  riskLevel = 'medium',
  assumptions = [],
  verifiedFacts = [],
  openQuestions = [],
  recommendedNextSteps = [],
  requiresApproval = false,
  relatedFiles = [],
  proposedChanges = []
}) {
  return {
    type,
    id: `${type}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    createdAt: nowIso(),
    agentId,
    projectId,
    title,
    summary,
    status,
    confidence,
    riskLevel,
    assumptions,
    verifiedFacts,
    openQuestions,
    recommendedNextSteps,
    requiresApproval,
    relatedFiles,
    proposedChanges
  };
}

export const AgentOutputTypes = Object.freeze({
  PROJECT_BREAKDOWN: 'ProjectBreakdown',
  AGENT_TASK_PACKET: 'AgentTaskPacket',
  RESEARCH_REPORT: 'ResearchReport',
  CODE_PROPOSAL: 'CodeProposal',
  UI_PROPOSAL: 'UIProposal',
  AUDIT_REPORT: 'AuditReport',
  RISK_REPORT: 'RiskReport',
  APPROVAL_REQUEST: 'ApprovalRequest',
  BUILD_VERIFICATION_REPORT: 'BuildVerificationReport',
  RELEASE_READINESS_REPORT: 'ReleaseReadinessReport'
});

export function createAgentOutput(type, payload) {
  return createBaseOutput({ type, ...payload });
}

export function validateAgentOutput(output) {
  if (!output || typeof output !== 'object') return { valid: false, reason: 'Output must be an object.' };
  const required = ['id', 'createdAt', 'agentId', 'projectId', 'title', 'summary', 'status', 'confidence', 'riskLevel'];
  for (const key of required) {
    if (!output[key]) return { valid: false, reason: `Missing required field: ${key}` };
  }
  return { valid: true, reason: null };
}

