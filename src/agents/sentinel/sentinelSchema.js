import { TRUST_STATES } from '../../services/trustModel';

export const SENTINEL_ALERT_SCHEMA = {
  alertId: '',
  scope: 'global',
  severity: 'medium',
  summary: '',
  findings: [],
  recommendedAction: '',
  requiresApproval: true,
  confidenceLevel: TRUST_STATES.UNVERIFIED,
  verificationState: TRUST_STATES.UNVERIFIED,
  detectedAtMs: 0
};

