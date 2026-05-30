import { normalizeMemoryRecord, listDurableMemoryRecords, upsertDurableMemoryRecords } from '../durableMemoryService';
import { TRUST_STATES, timestampMs } from '../trustModel';
import { writeHandoffArtifact } from '../workspaceArtifactService';

const WORKSHOP_CATEGORY = 'project_memory';
const WORKSHOP_SOURCE = 'project_execution_workshop';

function toSessionMemoryRecord(session) {
  const now = timestampMs();
  return normalizeMemoryRecord({
    id: session?.id || `workshop-${now}-${Math.random().toString(16).slice(2, 8)}`,
    title: `${session?.projectName || 'Project'} execution session`,
    content: session,
    category: WORKSHOP_CATEGORY,
    sourceAgent: 'jose',
    source: WORKSHOP_SOURCE,
    timestampMs: now,
    confidence: TRUST_STATES.INFERRED,
    verificationState: TRUST_STATES.VERIFIED,
    projectReference: session?.projectId || null
  });
}

export async function persistWorkshopSessionToDurableMemory(session) {
  const record = toSessionMemoryRecord(session);
  const proof = await upsertDurableMemoryRecords([record]);
  return { record, proof };
}

export async function listWorkshopSessions(limit = 10) {
  const rows = await listDurableMemoryRecords({
    category: WORKSHOP_CATEGORY,
    sourceAgent: 'jose'
  });
  return rows
    .filter((row) => row?.source === WORKSHOP_SOURCE)
    .sort((a, b) => Number(b.timestampMs || 0) - Number(a.timestampMs || 0))
    .slice(0, Math.max(1, limit))
    .map((row) => ({
      id: row.id,
      title: row.title,
      projectId: row.projectReference || null,
      timestampMs: Number(row.timestampMs || 0),
      content: row.content
    }));
}

export async function exportExecutionPacketToFile({ workspaceRoot, fileName, content, format = 'json' }) {
  const safeName = String(fileName || `execution-packet-${Date.now()}.${format === 'md' ? 'md' : 'json'}`)
    .replace(/[^\w.-]/g, '_');
  return writeHandoffArtifact({
    workspaceRoot,
    fileName: safeName,
    content: String(content || '')
  });
}
