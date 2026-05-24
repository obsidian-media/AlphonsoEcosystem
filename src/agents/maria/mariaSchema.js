import { TRUST_STATES } from '../../services/trustModel';

export const MARIA_AUDIT_SCHEMA = {
  workflowId: '',
  packetId: '',
  summary: '',
  riskLevel: 'medium',
  approvalRequired: true,
  policyFindings: [],
  complianceNotes: [],
  confidenceLevel: TRUST_STATES.UNVERIFIED,
  verificationState: TRUST_STATES.UNVERIFIED,
  auditedAtMs: 0
};

