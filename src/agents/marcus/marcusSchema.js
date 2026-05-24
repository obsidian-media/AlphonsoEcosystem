import { TRUST_STATES } from '../../services/trustModel';

export const MARCUS_EXECUTION_SCHEMA = {
  workflowId: '',
  assignmentId: '',
  connectorId: '',
  approvedBy: '',
  status: 'queued',
  resultUrl: null,
  summary: '',
  confidenceLevel: TRUST_STATES.UNVERIFIED,
  verificationState: TRUST_STATES.UNVERIFIED,
  executedAtMs: 0
};

