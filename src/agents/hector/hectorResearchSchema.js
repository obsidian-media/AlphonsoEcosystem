import { TRUST_STATES } from '../../services/trustModel';

export const HECTOR_RESEARCH_SCHEMA = {
  researchQuestion: '',
  summary: '',
  sources: [],
  urls: [],
  dateChecked: '',
  confidenceLevel: TRUST_STATES.UNVERIFIED,
  riskLevel: 'medium',
  verifiedFacts: [],
  inferredPoints: [],
  joseApprovalNeeded: [],
  recommendedNextStep: '',
  status: 'draft_created',
  runState: 'idle',
  currentSourceUrl: null,
  runLog: [],
  lastRunSummary: ''
};

export const HECTOR_SOURCE_TYPES = [
  'official_docs',
  'public_repo',
  'vendor_pricing',
  'news_current',
  'market_comparison',
  'evergreen_reference'
];
