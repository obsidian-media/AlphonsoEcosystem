import { TRUST_STATES } from '../../services/trustModel';

export const NOVA_OPPORTUNITY_SCHEMA = {
  opportunityId: '',
  title: '',
  summary: '',
  valueScore: 0,
  riskScore: 0,
  timingScore: 0,
  effortScore: 0,
  priorityTier: 'watchlist',
  recommendation: '',
  confidenceLevel: TRUST_STATES.UNVERIFIED,
  verificationState: TRUST_STATES.UNVERIFIED,
  analyzedAtMs: 0
};

