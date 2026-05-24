import { createAgentOutput, AgentOutputTypes } from '../../agents/shared/agentOutputSchemas';

function countMatches(text, patterns) {
  const lower = String(text || '').toLowerCase();
  return patterns.reduce((count, pattern) => (lower.includes(pattern) ? count + 1 : count), 0);
}

export function generateRiskScore(input) {
  const text = JSON.stringify(input || {});
  const paymentSignals = countMatches(text, ['paypal', 'stripe', 'payout', 'cashout', 'payment']);
  const authSignals = countMatches(text, ['auth', 'session', 'token', 'firebase auth']);
  const dataSignals = countMatches(text, ['firestore', 'database', 'pii', 'user data']);
  const deploySignals = countMatches(text, ['deploy', 'production', 'vercel']);
  const dependencySignals = countMatches(text, ['dependency', 'package', 'library']);

  const score = paymentSignals * 22 + authSignals * 12 + dataSignals * 14 + deploySignals * 10 + dependencySignals * 6;
  if (score >= 70) return { score, level: 'critical' };
  if (score >= 45) return { score, level: 'high' };
  if (score >= 20) return { score, level: 'medium' };
  return { score, level: 'low' };
}

export function generateAuditChecklist(project) {
  return [
    'Environment variable handling and secret exposure checks',
    'Auth and session protection checks',
    'Firestore/data access rule review',
    'Payout/payment fraud control review',
    'Dependency and supply-chain review',
    'Deployment and rollback readiness checks',
    'Acceptance criteria completeness checks'
  ].map((item, index) => ({
    id: `audit-${index + 1}`,
    item,
    required: true,
    status: 'pending',
    projectId: project?.id || null
  }));
}

export function auditProjectPlan(plan) {
  const risk = generateRiskScore(plan);
  return createAgentOutput(AgentOutputTypes.AUDIT_REPORT, {
    agentId: 'marcus',
    projectId: plan?.id || 'unknown-project',
    title: `${plan?.projectName || 'Project'} audit plan`,
    summary: `Risk level assessed as ${risk.level} (score ${risk.score}).`,
    status: 'ready',
    confidence: 'inferred',
    riskLevel: risk.level,
    assumptions: ['Deterministic risk heuristics'],
    verifiedFacts: ['Plan object received locally'],
    openQuestions: ['Which controls are already implemented in runtime?'],
    recommendedNextSteps: ['Review checklist', 'Approve mitigations before execution'],
    requiresApproval: risk.level === 'high' || risk.level === 'critical',
    relatedFiles: [],
    proposedChanges: [{ kind: 'checklist', value: generateAuditChecklist(plan) }]
  });
}

export function auditCodeProposal(codeProposal) {
  const risk = generateRiskScore(codeProposal);
  return createAgentOutput(AgentOutputTypes.AUDIT_REPORT, {
    agentId: 'marcus',
    projectId: codeProposal?.projectId || 'unknown-project',
    title: 'Code proposal safety audit',
    summary: `Code proposal audit result: ${risk.level} risk.`,
    status: 'ready',
    confidence: 'inferred',
    riskLevel: risk.level,
    assumptions: ['Static proposal inspection only'],
    verifiedFacts: [],
    openQuestions: ['Are tests and rollback paths included?'],
    recommendedNextSteps: ['Request approval for risky actions', 'Add verification checklist'],
    requiresApproval: risk.level !== 'low',
    relatedFiles: codeProposal?.relatedFiles || [],
    proposedChanges: []
  });
}

export function auditSecurityModel(securityModel) {
  return auditCodeProposal({
    ...securityModel,
    projectId: securityModel?.projectId || 'unknown-project'
  });
}

export function auditReleaseReadiness(project) {
  const risk = generateRiskScore(project);
  return createAgentOutput(AgentOutputTypes.RELEASE_READINESS_REPORT, {
    agentId: 'marcus',
    projectId: project?.id || 'unknown-project',
    title: `${project?.projectName || 'Project'} release readiness`,
    summary: risk.level === 'low'
      ? 'Release candidate is near-ready pending final verification.'
      : `Release candidate requires remediation before production (${risk.level} risk).`,
    status: risk.level === 'low' ? 'ready' : 'review_required',
    confidence: 'inferred',
    riskLevel: risk.level,
    assumptions: ['No live deployment action executed'],
    verifiedFacts: ['Release readiness assessed from project packet'],
    openQuestions: ['Have all approvals been captured?'],
    recommendedNextSteps: ['Run verification checklist', 'Confirm approval history'],
    requiresApproval: true,
    relatedFiles: [],
    proposedChanges: [{ kind: 'release_readiness_checklist', value: generateAuditChecklist(project) }]
  });
}

