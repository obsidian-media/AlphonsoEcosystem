import { TRUST_STATES, timestampMs } from './trustModel';
import { listMemoryItems, pushMemoryItem } from './memoryService';

export const WORKFLOW_MEMORY_CATEGORIES = [
  'workflow_timeline_memory',
  'workflow_artifact_memory',
  'workflow_governance_memory',
  'workflow_receipt_memory'
];

export function appendWorkflowMemory({
  workflowId,
  workflowRunId,
  title,
  content,
  category = 'workflow_timeline_memory',
  sourceAgent = 'jose',
  confidence = TRUST_STATES.TEMPORARY,
  verificationState = TRUST_STATES.UNVERIFIED,
  projectReference = 'alphonso-ecosystem',
  expiryRule = null,
  expiresAt = null
}) {
  return pushMemoryItem({
    title: title || `Workflow memory: ${workflowId || 'unknown'}`,
    category: mapWorkflowMemoryCategory(category),
    content: {
      workflowId: workflowId || null,
      workflowRunId: workflowRunId || null,
      value: content ?? null
    },
    source: 'workflow-execution',
    sourceAgent,
    confidence,
    verificationState,
    projectReference,
    workflowOwner: workflowId || null,
    expiryRule,
    expiresAt,
    sensitivity: 'internal',
    retentionPolicy: 'workflow_audit_retention',
    privacyStatus: 'local_governed',
    updatedAtMs: timestampMs()
  });
}

export function listWorkflowMemory(workflowId, workflowRunId = null) {
  return listMemoryItems()
    .filter((item) => {
      const payload = item?.content;
      const record = payload && typeof payload === 'object' ? payload : null;
      if (!record) return false;
      if (record.workflowId !== workflowId) return false;
      if (workflowRunId && record.workflowRunId !== workflowRunId) return false;
      return true;
    })
    .slice()
    .reverse();
}

function mapWorkflowMemoryCategory(category) {
  if (WORKFLOW_MEMORY_CATEGORIES.includes(category)) return 'timeline_memory';
  return category || 'timeline_memory';
}
