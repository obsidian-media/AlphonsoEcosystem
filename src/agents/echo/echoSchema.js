import { TRUST_STATES } from '../../services/trustModel';

export const ECHO_MEMORY_SCHEMA = {
  memoryId: '',
  workflowId: '',
  sourceAgent: 'echo',
  title: '',
  content: '',
  category: 'timeline_memory',
  confidenceLevel: TRUST_STATES.UNVERIFIED,
  verificationState: TRUST_STATES.UNVERIFIED,
  retentionPolicy: 'standard_180d',
  sensitivity: 'internal',
  archivedAtMs: 0
};

