/**
 * Alphonso — Notion Co-Source Sync Service
 *
 * Stage-one truth model:
 *  - Notion is a co-source of truth with Alphonso until Alphonso is fully mature.
 *  - Notion = human-readable operating truth for tasks, workflow status,
 *    approvals, portfolio view, notes, and governance.
 *  - Alphonso = local execution truth for agent actions, receipts, memory,
 *    orchestration, runtime state, audit trail, and automation.
 *  - Neither side silently overwrites the other. Conflicts become
 *    Approval Needed / Conflict records.
 *
 * This service is the single contract for sync in both directions. It does
 * NOT issue network calls directly — every Notion write goes through
 * `sendNotionConnectorEntry` (the only policy-gated Notion path) and every
 * Notion read returns a normalized shape ready to be persisted into the
 * runtime ledger.
 *
 * Slice 1 of PHASE 1: contract, correlation IDs, sync metadata, pure helpers.
 * Network code and the runtime_ledger persistence layer land in slice 2.
 *
 * Companion services reused (do not duplicate):
 *  - `connectorRegistryService.sendNotionConnectorEntry`  — outbound write
 *  - `policyEnforcementService`                          — fail-closed gate
 *  - `runtimeLedgerService`                              — scope/id/data substrate
 *  - `memoryService.pushMemoryItem`                      — durable memory writes
 *  - `trustModel.TRUST_STATES`                           — trust + verification
 *  - `approval/approvalService`                          — approval + receipts
 */

import { TRUST_STATES, timestampMs } from './trustModel';
import { persistScopeRows, listScopeRecords } from './runtimeLedgerService';
import { pushMemoryItem } from './memoryService';
import { sendNotionConnectorEntry, isConnectorAuthenticated } from './connectorRegistryService';
import { createApprovalRequest } from './approval/approvalService';
import { buildNotionSyncEvent, recordEvent as recordCanonicalEvent } from './eventsService';

export const NOTION_SYNC_SCOPE = 'notion_sync_v1';

export const NOTION_SYNC_SOURCES = Object.freeze({
  NOTION_PULL: 'notion_pull',
  NOTION_PUSH: 'notion_push',
  ALPHONSO_LOCAL: 'alphonso_local',
  USER_OVERRIDE: 'user_override',
  CONFLICT_RESOLUTION: 'conflict_resolution'
});

export const NOTION_CONFLICT_STATES = Object.freeze({
  CLEAN: 'clean',
  PENDING_REVIEW: 'pending_review',
  APPROVED_NOTION: 'approved_notion',
  APPROVED_ALPHONSO: 'approved_alphonso',
  REJECTED: 'rejected'
});

export const NOTION_APPROVAL_STATES = Object.freeze({
  NOT_REQUIRED: 'not_required',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired'
});

export const NOTION_WORKFLOW_PHASES = Object.freeze([
  'Idea',
  'Discovery',
  'Planning',
  'Ready',
  'Active',
  'Review',
  'Testing',
  'Blocked',
  'Approval Needed',
  'Completed',
  'Archived'
]);

export const NOTION_RISK_LEVELS = Object.freeze(['Low', 'Medium', 'High', 'Blocked']);

export const NOTION_AGENT_OPTIONS = Object.freeze([
  'Alphonso',
  'Jose',
  'Hector',
  'Miya',
  'Maria',
  'Marcus',
  'Echo',
  'Sentinel',
  'Nova'
]);

export const NOTION_PORTFOLIO_OPTIONS = Object.freeze([
  'ACC',
  'Alphonso',
  'TapCash',
  'CostPilot',
  'Mint',
  'Obsidian Studio',
  'Obsidian Media',
  'Blazely Marketing',
  'Ehsan Portfolio',
  'Donya Portfolio',
  'Cullinan Construction Portfolio',
  'Cullinan Construction',
  'CanadaPostal Pro',
  'Founder Social Club',
  'Shiporex',
  'SessionGuard',
  'AI Manual Master Handbook'
]);

export const NOTION_PROPERTY_TYPES = Object.freeze({
  TITLE: 'title',
  RICH_TEXT: 'rich_text',
  STATUS: 'status',
  SELECT: 'select',
  NUMBER: 'number',
  URL: 'url',
  DATE: 'date'
});

/**
 * Canonical Notion database schema for the workflow database.
 * Mirrors the Gemini plan schema but is data-driven so future migrations
 * can be done in one place.
 */
export const NOTION_WORKFLOW_DATABASE_SCHEMA = Object.freeze([
  { name: 'Title', type: NOTION_PROPERTY_TYPES.TITLE, required: true },
  { name: 'Portfolio', type: NOTION_PROPERTY_TYPES.SELECT, options: NOTION_PORTFOLIO_OPTIONS },
  { name: 'Workflow Phase', type: NOTION_PROPERTY_TYPES.STATUS, options: NOTION_WORKFLOW_PHASES },
  { name: 'Risk Level', type: NOTION_PROPERTY_TYPES.SELECT, options: NOTION_RISK_LEVELS },
  { name: 'Assigned Agent', type: NOTION_PROPERTY_TYPES.SELECT, options: NOTION_AGENT_OPTIONS },
  { name: 'Task ID', type: NOTION_PROPERTY_TYPES.RICH_TEXT, correlation: true },
  { name: 'Project ID', type: NOTION_PROPERTY_TYPES.RICH_TEXT, correlation: true },
  { name: 'Workflow ID', type: NOTION_PROPERTY_TYPES.RICH_TEXT, correlation: true },
  { name: 'Notion Page ID', type: NOTION_PROPERTY_TYPES.RICH_TEXT, correlation: true },
  { name: 'Source', type: NOTION_PROPERTY_TYPES.RICH_TEXT, sync: true },
  { name: 'Last Synced At', type: NOTION_PROPERTY_TYPES.DATE, sync: true },
  { name: 'Last Actor', type: NOTION_PROPERTY_TYPES.RICH_TEXT, sync: true },
  { name: 'Conflict Status', type: NOTION_PROPERTY_TYPES.SELECT, options: Object.values(NOTION_CONFLICT_STATES), sync: true },
  { name: 'Approval Status', type: NOTION_PROPERTY_TYPES.SELECT, options: Object.values(NOTION_APPROVAL_STATES), sync: true },
  { name: 'Audit Score', type: NOTION_PROPERTY_TYPES.NUMBER, sync: true },
  { name: 'Blockers', type: NOTION_PROPERTY_TYPES.RICH_TEXT, sync: true }
]);

function safeString(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function safeId(value) {
  return safeString(value).trim();
}

function isHexId(value) {
  return /^[a-f0-9]{16,64}$/i.test(safeString(value));
}

function slugify(value) {
  return safeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

export function buildCorrelationId({ projectId = null, taskId = null, workflowId = null, notionPageId = null } = {}) {
  const project = safeId(projectId);
  const task = safeId(taskId);
  const workflow = safeId(workflowId);
  const notion = safeId(notionPageId);
  if (!project && !task && !workflow && !notion) {
    return null;
  }
  return {
    project_id: project || null,
    task_id: task || null,
    workflow_id: workflow || null,
    notion_page_id: notion || null
  };
}

export function correlationKey(correlation) {
  if (!correlation || typeof correlation !== 'object') return '';
  const project = safeId(correlation.project_id);
  const task = safeId(correlation.task_id);
  if (project && task) return `${project}::${task}`;
  if (project) return `${project}::project`;
  if (task) return `task::${task}`;
  return '';
}

export function parseNotionPageId(value) {
  const raw = safeId(value);
  if (!raw) return null;
  if (isHexId(raw)) return raw.toLowerCase();
  const match = raw.match(/[a-f0-9]{16,64}/i);
  if (match) return match[0].toLowerCase();
  return null;
}

export function extractNotionPageIdFromUrl(url) {
  if (!url) return null;
  const match = safeString(url).match(/[a-f0-9]{16,64}/i);
  return match ? match[0].toLowerCase() : null;
}

export function normalizeNotionPhase(value) {
  const raw = safeString(value).trim();
  if (!raw) return 'Idea';
  const lower = raw.toLowerCase();
  const match = NOTION_WORKFLOW_PHASES.find((phase) => phase.toLowerCase() === lower);
  if (match) return match;
  const alias = {
    'in progress': 'Active',
    'wip': 'Active',
    'doing': 'Active',
    'todo': 'Ready',
    'backlog': 'Idea',
    'in review': 'Review',
    'qa': 'Testing',
    'done': 'Completed',
    'closed': 'Completed',
    'canceled': 'Archived',
    'cancelled': 'Archived'
  };
  return alias[lower] || 'Idea';
}

export function normalizeRiskLevel(value) {
  const raw = safeString(value).trim();
  if (!raw) return 'Low';
  const lower = raw.toLowerCase();
  if (lower === 'block' || lower === 'blocked') return 'Blocked';
  if (lower === 'low') return 'Low';
  if (lower === 'medium' || lower === 'med') return 'Medium';
  if (lower === 'high') return 'High';
  return 'Low';
}

export function normalizeAssignedAgent(value) {
  const raw = safeString(value).trim();
  if (!raw) return 'Jose';
  const lower = raw.toLowerCase();
  const match = NOTION_AGENT_OPTIONS.find((agent) => agent.toLowerCase() === lower);
  return match || 'Jose';
}

export function normalizePortfolio(value) {
  const raw = safeString(value).trim();
  if (!raw) return 'Alphonso';
  const lower = raw.toLowerCase();
  const match = NOTION_PORTFOLIO_OPTIONS.find((portfolio) => portfolio.toLowerCase() === lower);
  return match || 'Alphonso';
}

export function buildSyncMetadata({
  source = NOTION_SYNC_SOURCES.ALPHONSO_LOCAL,
  lastActor = 'alphonso',
  provenance = null,
  conflictStatus = NOTION_CONFLICT_STATES.CLEAN,
  approvalStatus = NOTION_APPROVAL_STATES.NOT_REQUIRED,
  lastSyncedAtMs = null
} = {}) {
  const allowedSources = Object.values(NOTION_SYNC_SOURCES);
  const allowedConflicts = Object.values(NOTION_CONFLICT_STATES);
  const allowedApprovals = Object.values(NOTION_APPROVAL_STATES);
  return {
    source: allowedSources.includes(source) ? source : NOTION_SYNC_SOURCES.ALPHONSO_LOCAL,
    last_synced_at: Number(lastSyncedAtMs || timestampMs()),
    last_actor: safeString(lastActor).trim() || 'alphonso',
    provenance: safeString(provenance).trim() || null,
    conflict_status: allowedConflicts.includes(conflictStatus) ? conflictStatus : NOTION_CONFLICT_STATES.CLEAN,
    approval_status: allowedApprovals.includes(approvalStatus) ? approvalStatus : NOTION_APPROVAL_STATES.NOT_REQUIRED,
    trust: TRUST_STATES.TEMPORARY
  };
}

export function detectFieldConflict(localValue, remoteValue) {
  const local = safeString(localValue).trim();
  const remote = safeString(remoteValue).trim();
  if (!local && !remote) return 'both_empty';
  if (!local || !remote) return 'one_missing';
  return local === remote ? 'identical' : 'diverged';
}

export function buildConflictRecord({
  correlation,
  field,
  localValue,
  remoteValue,
  detectedAtMs = null
} = {}) {
  if (!correlation || !field) {
    return null;
  }
  return {
    correlation,
    field: safeString(field),
    local_value: localValue ?? null,
    remote_value: remoteValue ?? null,
    detection: detectFieldConflict(localValue, remoteValue),
    detected_at: Number(detectedAtMs || timestampMs()),
    resolution: NOTION_CONFLICT_STATES.PENDING_REVIEW
  };
}

export function buildNotionPageProperties({
  title,
  portfolio,
  phase,
  riskLevel,
  assignedAgent,
  correlation,
  syncMetadata,
  auditScore = null,
  blockers = null,
  parentPageId = null,
  parentDatabaseId = null,
  url = null
} = {}) {
  const properties = {};
  const safeTitle = safeString(title).trim() || 'Untitled task';
  properties.Title = {
    title: [{ type: 'text', text: { content: safeTitle } }]
  };
  properties.Portfolio = {
    select: { name: normalizePortfolio(portfolio) }
  };
  properties['Workflow Phase'] = {
    status: { name: normalizeNotionPhase(phase) }
  };
  properties['Risk Level'] = {
    select: { name: normalizeRiskLevel(riskLevel) }
  };
  properties['Assigned Agent'] = {
    select: { name: normalizeAssignedAgent(assignedAgent) }
  };
  if (correlation?.task_id) {
    properties['Task ID'] = {
      rich_text: [{ type: 'text', text: { content: String(correlation.task_id) } }]
    };
  }
  if (correlation?.project_id) {
    properties['Project ID'] = {
      rich_text: [{ type: 'text', text: { content: String(correlation.project_id) } }]
    };
  }
  if (correlation?.workflow_id) {
    properties['Workflow ID'] = {
      rich_text: [{ type: 'text', text: { content: String(correlation.workflow_id) } }]
    };
  }
  if (correlation?.notion_page_id) {
    properties['Notion Page ID'] = {
      rich_text: [{ type: 'text', text: { content: String(correlation.notion_page_id) } }]
    };
  }
  if (syncMetadata) {
    properties.Source = {
      rich_text: [{ type: 'text', text: { content: String(syncMetadata.source || '') } }]
    };
    properties['Last Synced At'] = {
      date: { start: new Date(Number(syncMetadata.last_synced_at || timestampMs())).toISOString() }
    };
    properties['Last Actor'] = {
      rich_text: [{ type: 'text', text: { content: String(syncMetadata.last_actor || '') } }]
    };
    properties['Conflict Status'] = {
      select: { name: String(syncMetadata.conflict_status || NOTION_CONFLICT_STATES.CLEAN) }
    };
    properties['Approval Status'] = {
      select: { name: String(syncMetadata.approval_status || NOTION_APPROVAL_STATES.NOT_REQUIRED) }
    };
    if (syncMetadata.provenance) {
      properties.Source = {
        rich_text: [{ type: 'text', text: { content: String(syncMetadata.provenance) } }]
      };
    }
  }
  if (auditScore !== null && auditScore !== undefined) {
    properties['Audit Score'] = { number: Number(auditScore) };
  }
  if (blockers) {
    properties.Blockers = {
      rich_text: [{ type: 'text', text: { content: safeString(blockers).slice(0, 1900) } }]
    };
  }
  const parent = parentDatabaseId
    ? { database_id: safeString(parentDatabaseId) }
    : parentPageId
      ? { page_id: safeString(parentPageId) }
      : null;
  return {
    parent,
    properties
  };
}

export function buildNotionSyncRecordId(correlation, source = NOTION_SYNC_SOURCES.ALPHONSO_LOCAL) {
  const key = correlationKey(correlation);
  if (!key) return null;
  return `notion-sync-${slugify(source)}-${slugify(key)}`;
}

export function buildNotionSyncMemoryRecord({
  title,
  content,
  correlation,
  syncMetadata,
  category = 'task_memory',
  sourceAgent = 'alphonso',
  projectReference = null
} = {}) {
  const safeSync = buildSyncMetadata(syncMetadata || {});
  const normalizedCorrelation = buildCorrelationId(correlation || {}) || {};
  return {
    id: buildNotionSyncRecordId(normalizedCorrelation, safeSync.source) || `notion-sync-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    title: safeString(title).trim() || 'Notion sync record',
    category,
    source: 'notion_sync',
    sourceAgent,
    projectReference: projectReference || normalizedCorrelation.project_id || 'alphonso-ecosystem',
    content: {
      value: content ?? null,
      __notion_sync: {
        correlation: normalizedCorrelation,
        sync: safeSync
      }
    },
    confidence: safeSync.trust || TRUST_STATES.TEMPORARY,
    verificationState: safeSync.trust || TRUST_STATES.UNVERIFIED,
    workflowOwner: normalizedCorrelation.workflow_id || null,
    sensitivity: 'internal',
    retentionPolicy: 'notion_sync_audit_retention',
    privacyStatus: 'local_governed',
    updatedAtMs: safeSync.last_synced_at
  };
}

export function isNotionSyncMemoryRecord(record) {
  if (!record || typeof record !== 'object') return false;
  if (record.source === 'notion_sync') return true;
  const content = record.content;
  if (content && typeof content === 'object' && content.__notion_sync) return true;
  return false;
}

export function extractCorrelationFromMemoryRecord(record) {
  if (!record) return null;
  const content = record.content;
  if (content && typeof content === 'object' && content.__notion_sync) {
    return content.__notion_sync.correlation || null;
  }
  if (record.title) {
    const match = safeString(record.title).match(/\[sync:([^\]]+)\]/);
    if (match) {
      const parts = match[1].split('|');
      return {
        project_id: parts[0] || null,
        task_id: parts[1] || null,
        workflow_id: parts[2] || null,
        notion_page_id: parts[3] || null
      };
    }
  }
  return null;
}

function toLedgerRecord(syncRecord) {
  const correlation = syncRecord?.correlation || {};
  const sync = syncRecord?.sync || {};
  return {
    id: syncRecord?.id || buildNotionSyncRecordId(correlation, sync.source),
    data: syncRecord,
    status: sync.conflict_status || NOTION_CONFLICT_STATES.CLEAN,
    confidence: sync.trust || TRUST_STATES.TEMPORARY,
    verificationState: sync.trust || TRUST_STATES.UNVERIFIED,
    timestampMs: Number(sync.last_synced_at || syncRecord?.lastSyncedAtMs || timestampMs())
  };
}

function fromLedgerRecord(ledgerRecord) {
  if (!ledgerRecord) return null;
  if (ledgerRecord.data && typeof ledgerRecord.data === 'object') return ledgerRecord.data;
  return {
    id: ledgerRecord.id,
    correlation: ledgerRecord.data?.correlation || null,
    sync: ledgerRecord.data?.sync || null
  };
}

function emptyStatus() {
  return {
    available: false,
    scope: NOTION_SYNC_SCOPE,
    totalRecords: 0,
    bySource: {},
    byConflict: {},
    byApproval: {},
    lastSyncedAtMs: null,
    lastActor: null,
    lastError: null,
    checkedAtMs: timestampMs()
  };
}

export async function persistNotionSyncRecord(syncRecord) {
  if (!syncRecord || typeof syncRecord !== 'object') {
    return { ok: false, written: 0, error: 'sync_record_required' };
  }
  const rawCorr = syncRecord.correlation || {};
  const normalizedCorr = {
    projectId: rawCorr.projectId ?? rawCorr.project_id ?? null,
    taskId: rawCorr.taskId ?? rawCorr.task_id ?? null,
    workflowId: rawCorr.workflowId ?? rawCorr.workflow_id ?? null,
    notionPageId: rawCorr.notionPageId ?? rawCorr.notion_page_id ?? null
  };
  const correlation = buildCorrelationId(normalizedCorr);
  const sync = buildSyncMetadata(syncRecord.sync || {});
  const id = syncRecord.id || buildNotionSyncRecordId(correlation, sync.source);
  if (!id) {
    return { ok: false, written: 0, error: 'correlation_required' };
  }
  const record = {
    id,
    correlation,
    sync,
    payload: syncRecord.payload || null,
    lastResult: syncRecord.lastResult || null,
    createdAtMs: syncRecord.createdAtMs || sync.last_synced_at
  };
  await persistScopeRows(NOTION_SYNC_SCOPE, [record], toLedgerRecord);
  pushMemoryItem(buildNotionSyncMemoryRecord({
    title: `[sync:${correlation.project_id || ''}|${correlation.task_id || ''}|${correlation.workflow_id || ''}|${correlation.notion_page_id || ''}] ${syncRecord.title || sync.source}`,
    content: { recordId: id, lastResult: record.lastResult },
    correlation,
    syncMetadata: sync,
    category: 'task_memory',
    projectReference: correlation.project_id || syncRecord.projectReference || 'alphonso-ecosystem'
  }));
  // Best-effort: also write a canonical event so the events table + weekly
  // aggregate can see Notion sync activity. Failures here MUST NOT break
  // the ledger/memory write path — the canonical record above is authoritative.
  try {
    const direction = (sync.source || '').replace('notion_', '');
    const outcome = sync.conflict_status === NOTION_CONFLICT_STATES.CLEAN
      ? 'success'
      : (sync.conflict_status === NOTION_CONFLICT_STATES.PENDING_REVIEW ? 'pending' : 'failure');
    const canonicalEvent = buildNotionSyncEvent({
      direction: direction === 'pull' || direction === 'push' ? direction : 'pull',
      notionPageId: correlation.notion_page_id,
      projectId: correlation.project_id,
      taskId: correlation.task_id,
      workflowId: correlation.workflow_id,
      outcome,
      sourceAgent: sync.last_actor,
      reason: syncRecord.lastResult?.error || null
    });
    await recordCanonicalEvent(canonicalEvent);
  } catch {
    // events table unavailable in some envs (e.g. non-Tauri browser preview) — non-blocking
  }
  return { ok: true, id, written: 1 };
}

export async function listNotionSyncRecords({ correlation, source, conflictStatus, limit = 200 } = {}) {
  const records = await listScopeRecords(NOTION_SYNC_SCOPE, limit);
  const normalized = records.map(fromLedgerRecord).filter(Boolean);
  return normalized.filter((record) => {
    if (source && record.sync?.source !== source) return false;
    if (conflictStatus && record.sync?.conflict_status !== conflictStatus) return false;
    if (correlation) {
      const c = record.correlation || {};
      if (correlation.project_id && c.project_id !== correlation.project_id) return false;
      if (correlation.task_id && c.task_id !== correlation.task_id) return false;
      if (correlation.workflow_id && c.workflow_id !== correlation.workflow_id) return false;
      if (correlation.notion_page_id && c.notion_page_id !== correlation.notion_page_id) return false;
    }
    return true;
  });
}

export async function findLatestNotionSyncRecord(correlation) {
  if (!correlation) return null;
  const matches = await listNotionSyncRecords({ correlation, limit: 1 });
  return matches[0] || null;
}

export async function getNotionSyncStatus() {
  try {
    const records = await listScopeRecords(NOTION_SYNC_SCOPE, 2000);
    const status = emptyStatus();
    status.available = records.length > 0 || true;
    status.totalRecords = records.length;
    for (const ledgerRecord of records) {
      const r = fromLedgerRecord(ledgerRecord);
      const source = r?.sync?.source || 'unknown';
      const conflict = r?.sync?.conflict_status || NOTION_CONFLICT_STATES.CLEAN;
      const approval = r?.sync?.approval_status || NOTION_APPROVAL_STATES.NOT_REQUIRED;
      status.bySource[source] = (status.bySource[source] || 0) + 1;
      status.byConflict[conflict] = (status.byConflict[conflict] || 0) + 1;
      status.byApproval[approval] = (status.byApproval[approval] || 0) + 1;
      const ts = Number(r?.sync?.last_synced_at || ledgerRecord.timestampMs || 0);
      if (ts > (status.lastSyncedAtMs || 0)) {
        status.lastSyncedAtMs = ts;
        status.lastActor = r?.sync?.last_actor || null;
      }
    }
    return status;
  } catch (error) {
    return { ...emptyStatus(), lastError: String(error) };
  }
}

export function isNotionConnectorReady() {
  try {
    return isConnectorAuthenticated('notion');
  } catch {
    return { ok: false, reason: 'auth_check_failed' };
  }
}

export function buildReconcilePlan(local, remote, lastSync) {
  if (!local && !remote) {
    return { action: 'noop', reason: 'both_missing' };
  }
  if (!remote) {
    return { action: 'push', reason: 'remote_missing' };
  }
  if (!local) {
    return { action: 'pull', reason: 'local_missing' };
  }
  const fields = ['title', 'phase', 'riskLevel', 'assignedAgent', 'portfolio'];
  const divergences = [];
  for (const field of fields) {
    const detection = detectFieldConflict(local[field], remote[field]);
    if (detection === 'diverged' || detection === 'one_missing') {
      divergences.push({ field, detection, local: local[field], remote: remote[field] });
    }
  }
  if (divergences.length === 0) {
    return { action: 'skip', reason: 'identical', divergences: [] };
  }
  const localLastUpdate = Number(local.updatedAtMs || 0);
  const remoteLastUpdate = Number(remote.updatedAtMs || remote.lastSyncedAtMs || 0);
  const lastSyncTs = Number(lastSync?.sync?.last_synced_at || 0);
  if (lastSyncTs && localLastUpdate > lastSyncTs && remoteLastUpdate > lastSyncTs) {
    return { action: 'conflict', reason: 'both_changed_since_last_sync', divergences };
  }
  if (localLastUpdate >= remoteLastUpdate) {
    return { action: 'push', reason: 'local_newer', divergences };
  }
  return { action: 'pull', reason: 'remote_newer', divergences };
}

export async function recordNotionConflict({
  correlation,
  field,
  localValue,
  remoteValue,
  workflowId = 'notion_sync_center',
  sourceAgent = 'jose',
  reason = 'notion_sync_conflict'
} = {}) {
  const record = buildConflictRecord({ correlation, field, localValue, remoteValue });
  if (!record) return { ok: false, error: 'invalid_conflict' };
  const sync = buildSyncMetadata({
    source: NOTION_SYNC_SOURCES.CONFLICT_RESOLUTION,
    lastActor: sourceAgent,
    provenance: reason,
    conflictStatus: NOTION_CONFLICT_STATES.PENDING_REVIEW,
    approvalStatus: NOTION_APPROVAL_STATES.PENDING
  });
  const id = `conflict-${(correlation?.project_id || 'x')}-${(correlation?.task_id || 'x')}-${field}-${sync.last_synced_at}`;
  await persistNotionSyncRecord({
    id,
    title: `Conflict: ${field} on ${correlation?.task_id || correlation?.project_id || 'unknown'}`,
    correlation,
    sync,
    payload: { kind: 'conflict', field, localValue, remoteValue, detection: record.detection }
  });
  let approval = null;
  try {
    approval = createApprovalRequest({
      actionType: 'external_posting_uploading',
      riskLevel: 'medium',
      summary: `Notion ↔ Alphonso conflict on field "${field}"`,
      reason: `Both Notion and Alphonso changed "${field}" since the last sync. Resolve before further sync.`,
      requestedBy: sourceAgent,
      workflowId,
      metadata: {
        correlation,
        conflictField: field,
        localValue,
        remoteValue,
        detection: record.detection
      }
    });
  } catch (error) {
    return { ok: true, id, conflict: record, approval: null, approvalError: String(error) };
  }
  return { ok: true, id, conflict: record, approval };
}

export async function pushAlphonsoTaskToNotion({
  title,
  content = '',
  portfolio,
  phase,
  riskLevel,
  assignedAgent,
  correlation,
  parentPageId = null,
  parentDatabaseId = null,
  auditScore = null,
  blockers = null,
  approved = false,
  sourceAgent = 'alphonso',
  projectReference = null
} = {}) {
  const auth = isNotionConnectorReady();
  if (!auth?.ok) {
    const sync = buildSyncMetadata({
      source: NOTION_SYNC_SOURCES.ALPHONSO_LOCAL,
      lastActor: sourceAgent,
      provenance: 'push_blocked_no_credentials',
      approvalStatus: approved ? NOTION_APPROVAL_STATES.APPROVED : NOTION_APPROVAL_STATES.PENDING
    });
    const id = `notion-push-blocked-${timestampMs()}`;
    await persistNotionSyncRecord({
      id,
      title: `[push-blocked] ${title || 'Untitled task'}`,
      correlation,
      sync,
      payload: { kind: 'push_blocked', reason: 'no_credentials', approved }
    });
    return {
      ok: false,
      blocked: true,
      reason: 'notion_not_authenticated',
      auth,
      sync
    };
  }

  const safeCorrelation = buildCorrelationId(correlation || {}) || {};
  const sync = buildSyncMetadata({
    source: NOTION_SYNC_SOURCES.NOTION_PUSH,
    lastActor: sourceAgent,
    provenance: 'alphonso_push',
    conflictStatus: NOTION_CONFLICT_STATES.CLEAN,
    approvalStatus: approved ? NOTION_APPROVAL_STATES.APPROVED : NOTION_APPROVAL_STATES.PENDING
  });

  const properties = buildNotionPageProperties({
    title,
    content,
    portfolio,
    phase,
    riskLevel,
    assignedAgent,
    correlation: safeCorrelation,
    syncMetadata: sync,
    auditScore,
    blockers,
    parentPageId,
    parentDatabaseId
  });

  const targetTitle = properties.properties.Title.title[0].text.content;
  const sendResult = await sendNotionConnectorEntry(
    { title: targetTitle, content, parentPageId: parentPageId || null },
    { riskLevel: riskLevel || 'Medium' }
  );

  const finalSync = buildSyncMetadata({
    ...sync,
    conflictStatus: sendResult?.ok
      ? NOTION_CONFLICT_STATES.CLEAN
      : NOTION_CONFLICT_STATES.PENDING_REVIEW,
    approvalStatus: sendResult?.ok
      ? NOTION_APPROVAL_STATES.APPROVED
      : NOTION_APPROVAL_STATES.PENDING,
    provenance: sendResult?.ok ? 'alphonso_push_ok' : `alphonso_push_${sendResult?.error || 'failed'}`
  });

  const id = buildNotionSyncRecordId(safeCorrelation, NOTION_SYNC_SOURCES.NOTION_PUSH);
  await persistNotionSyncRecord({
    id,
    title: `[push] ${targetTitle}`,
    correlation: safeCorrelation,
    sync: finalSync,
    payload: { kind: 'notion_push', properties, parentPageId, parentDatabaseId },
    lastResult: { ok: Boolean(sendResult?.ok), error: sendResult?.error || null, externalId: sendResult?.externalId || null }
  });

  return {
    ok: Boolean(sendResult?.ok),
    blocked: false,
    sendResult,
    correlation: safeCorrelation,
    sync: finalSync
  };
}

export async function ingestAlphonsoTaskFromNotionPage(notionPage) {
  if (!notionPage || typeof notionPage !== 'object') return null;
  const props = notionPage.properties || {};
  const titleRich = props.Title?.title || [];
  const title = titleRich.map((t) => t?.text?.content || '').join('').trim();
  const portfolio = props.Portfolio?.select?.name || null;
  const phase = props['Workflow Phase']?.status?.name || null;
  const riskLevel = props['Risk Level']?.select?.name || null;
  const assignedAgent = props['Assigned Agent']?.select?.name || null;
  const taskId = props['Task ID']?.rich_text?.[0]?.text?.content || null;
  const projectId = props['Project ID']?.rich_text?.[0]?.text?.content || null;
  const workflowId = props['Workflow ID']?.rich_text?.[0]?.text?.content || null;
  const notionPageId = notionPage.id
    || parseNotionPageId(props['Notion Page ID']?.rich_text?.[0]?.text?.content)
    || null;
  const blockers = props.Blockers?.rich_text?.[0]?.text?.content || null;
  const auditScore = props['Audit Score']?.number ?? null;
  const lastSyncedAt = props['Last Synced At']?.date?.start || null;
  const lastActor = props['Last Actor']?.rich_text?.[0]?.text?.content || null;
  const conflictStatus = props['Conflict Status']?.select?.name || NOTION_CONFLICT_STATES.CLEAN;
  const approvalStatus = props['Approval Status']?.select?.name || NOTION_APPROVAL_STATES.NOT_REQUIRED;
  const source = props.Source?.rich_text?.[0]?.text?.content || NOTION_SYNC_SOURCES.NOTION_PULL;

  const correlation = buildCorrelationId({
    projectId, taskId, workflowId, notionPageId
  });
  return {
    notionPageId,
    title,
    portfolio,
    phase,
    riskLevel,
    assignedAgent,
    correlation,
    blockers,
    auditScore,
    lastSyncedAtMs: lastSyncedAt ? new Date(lastSyncedAt).getTime() : null,
    lastActor,
    conflictStatus,
    approvalStatus,
    source,
    raw: notionPage
  };
}

export function isNotionPullEnabled() {
  const env = (typeof import.meta !== 'undefined' && import.meta.env)
    ? import.meta.env
    : (typeof process !== 'undefined' && process.env ? process.env : null);
  const token = env?.VITE_NOTION_API_KEY
    || env?.NOTION_API_KEY
    || '';
  if (token && String(token).trim() && !String(token).includes('YOUR_')) {
    return { enabled: true, source: 'env' };
  }
  return { enabled: false, reason: 'credentials_missing' };
}

export async function fetchNotionApi(pathname, { method = 'GET', token, body = null } = {}) {
  if (!token) {
    return { ok: false, status: 0, error: 'missing_token', data: null };
  }
  const url = pathname.startsWith('http')
    ? pathname
    : `https://api.notion.com${pathname.startsWith('/') ? '' : '/'}${pathname}`;
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : null
    });
    const text = await response.text().catch(() => '');
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    return {
      ok: response.ok,
      status: response.status,
      error: response.ok ? null : `http_${response.status}`,
      data
    };
  } catch (error) {
    return { ok: false, status: 0, error: 'network_error', data: null, detail: String(error) };
  }
}

export async function fetchNotionDatabasePages({ databaseId, token, pageSize = 50 } = {}) {
  if (!databaseId) {
    return { ok: false, error: 'database_id_required', pages: [] };
  }
  if (!token) {
    return { ok: false, error: 'missing_token', pages: [] };
  }
  const pages = [];
  let cursor = undefined;
  let pagesFetched = 0;
  let stoppedReason = 'exhausted';
  while (pagesFetched < 250) {
    const result = await fetchNotionApi(`/v1/databases/${databaseId}/query`, {
      method: 'POST',
      token,
      body: { page_size: Math.min(pageSize, 100), start_cursor: cursor }
    });
    if (!result.ok) {
      return { ok: false, error: result.error, pages, detail: result.detail || null };
    }
    const results = Array.isArray(result.data?.results) ? result.data.results : [];
    pages.push(...results);
    pagesFetched += results.length;
    if (!result.data?.has_more) {
      stoppedReason = 'no_more';
      break;
    }
    cursor = result.data?.next_cursor || undefined;
    if (!cursor) {
      stoppedReason = 'no_cursor';
      break;
    }
  }
  return { ok: true, pages, pagesFetched, stoppedReason };
}

export async function fetchNotionPage({ pageId, token } = {}) {
  if (!pageId) return { ok: false, error: 'page_id_required', page: null };
  if (!token) return { ok: false, error: 'missing_token', page: null };
  const result = await fetchNotionApi(`/v1/pages/${pageId}`, { method: 'GET', token });
  if (!result.ok) return { ok: false, error: result.error, page: null, detail: result.detail || null };
  return { ok: true, page: result.data };
}

export function buildPullReconcilePlan(local, remote, lastSync) {
  if (!remote) return { action: 'skip', reason: 'remote_missing' };
  if (!local) return { action: 'pull', reason: 'local_missing' };
  const fields = ['title', 'phase', 'riskLevel', 'assignedAgent', 'portfolio'];
  const divergences = [];
  for (const field of fields) {
    const detection = detectFieldConflict(local[field], remote[field]);
    if (detection === 'diverged' || detection === 'one_missing') {
      divergences.push({ field, detection, local: local[field], remote: remote[field] });
    }
  }
  if (divergences.length === 0) {
    return { action: 'skip', reason: 'identical', divergences: [] };
  }
  const localLastUpdate = Number(local.updatedAtMs || 0);
  const remoteLastUpdate = Number(remote.updatedAtMs || remote.lastSyncedAtMs || 0);
  const lastSyncTs = Number(lastSync?.sync?.last_synced_at || 0);
  if (lastSyncTs && localLastUpdate > lastSyncTs && remoteLastUpdate > lastSyncTs) {
    return { action: 'conflict', reason: 'both_changed_since_last_sync', divergences };
  }
  if (localLastUpdate > lastSyncTs) {
    return { action: 'conflict', reason: 'local_changed_since_last_sync', divergences };
  }
  return { action: 'pull', reason: 'remote_newer', divergences };
}

function toLocalShape(ingested) {
  if (!ingested) return null;
  return {
    title: ingested.title || '',
    phase: ingested.phase || null,
    riskLevel: ingested.riskLevel || null,
    assignedAgent: ingested.assignedAgent || null,
    portfolio: ingested.portfolio || null,
    updatedAtMs: Number(ingested.lastSyncedAtMs || 0)
  };
}

export async function pullNotionPage({ pageId, token, localRecord = null, sourceAgent = 'alphonso' } = {}) {
  if (!isNotionPullEnabled().enabled && !token) {
    const sync = buildSyncMetadata({
      source: NOTION_SYNC_SOURCES.NOTION_PULL,
      lastActor: sourceAgent,
      provenance: 'pull_blocked_no_credentials',
      conflictStatus: NOTION_CONFLICT_STATES.CLEAN,
      approvalStatus: NOTION_APPROVAL_STATES.NOT_REQUIRED
    });
    return { ok: false, blocked: true, reason: 'credentials_missing', sync };
  }
  const effectiveToken = token || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_NOTION_API_KEY) || '';
  const fetched = await fetchNotionPage({ pageId, token: effectiveToken });
  if (!fetched.ok) {
    return { ok: false, error: fetched.error, detail: fetched.detail || null };
  }
  const ingested = ingestAlphonsoTaskFromNotionPage(fetched.page);
  if (!ingested) {
    return { ok: false, error: 'ingest_failed' };
  }
  const correlation = ingested.correlation || buildCorrelationId({ notionPageId: ingested.notionPageId });
  const lastSync = await findLatestNotionSyncRecord(correlation);
  const localShape = localRecord || (lastSync ? toLocalShape(lastSync.payload?.localShape) : null);
  const remoteShape = toLocalShape(ingested);
  const plan = buildPullReconcilePlan(localShape, remoteShape, lastSync);
  if (plan.action === 'conflict') {
    for (const divergence of plan.divergences) {
      await recordNotionConflict({
        correlation,
        field: divergence.field,
        localValue: divergence.local,
        remoteValue: divergence.remote,
        sourceAgent,
        reason: `pull_conflict:${divergence.field}`
      });
    }
    return {
      ok: false,
      blocked: true,
      action: 'conflict',
      plan,
      ingested,
      correlation
    };
  }
  if (plan.action === 'skip') {
    const sync = buildSyncMetadata({
      source: NOTION_SYNC_SOURCES.NOTION_PULL,
      lastActor: sourceAgent,
      provenance: 'pull_skip_identical',
      lastSyncedAtMs: ingested.lastSyncedAtMs || timestampMs()
    });
    const id = buildNotionSyncRecordId(correlation, NOTION_SYNC_SOURCES.NOTION_PULL);
    await persistNotionSyncRecord({
      id,
      title: `[pull-skip] ${ingested.title || 'Untitled'}`,
      correlation,
      sync,
      payload: { kind: 'notion_pull_skip', localShape, remoteShape, plan }
    });
    return { ok: true, action: 'skip', plan, ingested, correlation, sync };
  }
  const sync = buildSyncMetadata({
    source: NOTION_SYNC_SOURCES.NOTION_PULL,
    lastActor: sourceAgent,
    provenance: 'pull_ok',
    lastSyncedAtMs: ingested.lastSyncedAtMs || timestampMs()
  });
  const id = buildNotionSyncRecordId(correlation, NOTION_SYNC_SOURCES.NOTION_PULL);
  await persistNotionSyncRecord({
    id,
    title: `[pull] ${ingested.title || 'Untitled'}`,
    correlation,
    sync,
    payload: { kind: 'notion_pull', localShape, remoteShape, plan, ingested }
  });
  return { ok: true, action: 'pull', plan, ingested, correlation, sync };
}

export function notionSyncWeeklyReport({ records = [], generatedAtMs = null, lookbackMs = null } = {}) {
  const now = Number(generatedAtMs || timestampMs());
  const lookback = Number(lookbackMs || 7 * 24 * 60 * 60 * 1000);
  const cutoff = now - lookback;
  const recent = (records || []).filter((r) => {
    const ts = Number(r?.sync?.last_synced_at || r?.timestampMs || 0);
    return ts >= cutoff;
  });
  const conflicts = recent.filter((r) => r?.sync?.conflict_status && r.sync.conflict_status !== NOTION_CONFLICT_STATES.CLEAN);
  const pendingApprovals = recent.filter((r) => r?.sync?.approval_status === NOTION_APPROVAL_STATES.PENDING);
  const blocked = recent.filter((r) => r?.sync?.provenance && r.sync.provenance.includes('blocked'));
  const sourceCounts = {};
  for (const r of recent) {
    const src = r?.sync?.source || 'unknown';
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  }
  const lines = [];
  lines.push('# Notion ↔ Alphonso Weekly Sync Report');
  lines.push('');
  lines.push(`- Window: last ${Math.round(lookback / (24 * 60 * 60 * 1000))} days`);
  lines.push(`- Generated at: ${new Date(now).toISOString()}`);
  lines.push(`- Total records in window: ${recent.length}`);
  lines.push(`- Conflicts raised: ${conflicts.length}`);
  lines.push(`- Approvals pending: ${pendingApprovals.length}`);
  lines.push(`- Blocked operations: ${blocked.length}`);
  lines.push('');
  lines.push('## By source');
  const sources = Object.keys(sourceCounts).sort();
  if (sources.length === 0) {
    lines.push('- (no sync activity)');
  } else {
    for (const s of sources) {
      lines.push(`- ${s}: ${sourceCounts[s]}`);
    }
  }
  lines.push('');
  lines.push('## Recent conflicts (max 10)');
  if (conflicts.length === 0) {
    lines.push('- (none)');
  } else {
    for (const c of conflicts.slice(0, 10)) {
      const corr = c.correlation || {};
      lines.push(`- ${corr.task_id || corr.project_id || 'unknown'} — source=${c.sync?.source || '?'} actor=${c.sync?.last_actor || '?'} ts=${c.sync?.last_synced_at || '?'}`);
    }
  }
  lines.push('');
  lines.push('## Pending approvals (max 10)');
  if (pendingApprovals.length === 0) {
    lines.push('- (none)');
  } else {
    for (const p of pendingApprovals.slice(0, 10)) {
      const corr = p.correlation || {};
      lines.push(`- ${corr.task_id || corr.project_id || 'unknown'} — conflict_status=${p.sync?.conflict_status || '?'}`);
    }
  }
  return {
    markdown: lines.join('\n'),
    counts: {
      total: recent.length,
      conflicts: conflicts.length,
      pendingApprovals: pendingApprovals.length,
      blocked: blocked.length,
      bySource: sourceCounts
    },
    generatedAtMs: now,
    windowStartMs: cutoff,
    windowEndMs: now
  };
}

export async function pullNotionDatabase({ databaseId, token, sourceAgent = 'alphonso', pageSize = 25 } = {}) {
  if (!isNotionPullEnabled().enabled && !token) {
    return { ok: false, blocked: true, reason: 'credentials_missing', pages: [] };
  }
  const effectiveToken = token || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_NOTION_API_KEY) || '';
  const query = await fetchNotionDatabasePages({ databaseId, token: effectiveToken, pageSize });
  if (!query.ok) {
    return { ok: false, error: query.error, pages: [], detail: query.detail || null };
  }
  const summary = {
    ok: true,
    pagesScanned: query.pages.length,
    pagesPulled: 0,
    pagesSkipped: 0,
    pagesConflicted: 0,
    pagesErrored: 0,
    conflicts: [],
    results: []
  };
  for (const page of query.pages) {
    const ingested = ingestAlphonsoTaskFromNotionPage(page);
    if (!ingested) {
      summary.pagesErrored += 1;
      continue;
    }
    const correlation = ingested.correlation || buildCorrelationId({ notionPageId: ingested.notionPageId });
    const lastSync = await findLatestNotionSyncRecord(correlation);
    const localShape = lastSync ? toLocalShape(lastSync.payload?.localShape) : null;
    const remoteShape = toLocalShape(ingested);
    const plan = buildPullReconcilePlan(localShape, remoteShape, lastSync);
    if (plan.action === 'conflict') {
      for (const divergence of plan.divergences) {
        const conflictResult = await recordNotionConflict({
          correlation,
          field: divergence.field,
          localValue: divergence.local,
          remoteValue: divergence.remote,
          sourceAgent,
          reason: `database_pull_conflict:${divergence.field}`
        });
        if (conflictResult?.conflict) {
          summary.conflicts.push({
            notionPageId: ingested.notionPageId,
            field: divergence.field,
            detection: divergence.detection
          });
        }
      }
      summary.pagesConflicted += 1;
      summary.results.push({ notionPageId: ingested.notionPageId, action: 'conflict', plan });
      continue;
    }
    if (plan.action === 'skip') {
      summary.pagesSkipped += 1;
      summary.results.push({ notionPageId: ingested.notionPageId, action: 'skip', plan });
      continue;
    }
    const sync = buildSyncMetadata({
      source: NOTION_SYNC_SOURCES.NOTION_PULL,
      lastActor: sourceAgent,
      provenance: 'database_pull_ok',
      lastSyncedAtMs: ingested.lastSyncedAtMs || timestampMs()
    });
    const id = buildNotionSyncRecordId(correlation, NOTION_SYNC_SOURCES.NOTION_PULL);
    await persistNotionSyncRecord({
      id,
      title: `[pull-db] ${ingested.title || 'Untitled'}`,
      correlation,
      sync,
      payload: { kind: 'notion_pull_db', localShape, remoteShape, plan, ingested }
    });
    summary.pagesPulled += 1;
    summary.results.push({ notionPageId: ingested.notionPageId, action: 'pull', plan });
  }
  return summary;
}

export const NOTION_SYNC_PUBLIC_API = Object.freeze({
  scope: NOTION_SYNC_SCOPE,
  sources: NOTION_SYNC_SOURCES,
  conflicts: NOTION_CONFLICT_STATES,
  approvals: NOTION_APPROVAL_STATES,
  phases: NOTION_WORKFLOW_PHASES,
  riskLevels: NOTION_RISK_LEVELS,
  agentOptions: NOTION_AGENT_OPTIONS,
  portfolioOptions: NOTION_PORTFOLIO_OPTIONS,
  schema: NOTION_WORKFLOW_DATABASE_SCHEMA,
  buildCorrelationId,
  correlationKey,
  parseNotionPageId,
  extractNotionPageIdFromUrl,
  normalizeNotionPhase,
  normalizeRiskLevel,
  normalizeAssignedAgent,
  normalizePortfolio,
  buildSyncMetadata,
  detectFieldConflict,
  buildConflictRecord,
  buildNotionPageProperties,
  buildNotionSyncRecordId,
  buildNotionSyncMemoryRecord,
  isNotionSyncMemoryRecord,
  extractCorrelationFromMemoryRecord,
  persistNotionSyncRecord,
  listNotionSyncRecords,
  findLatestNotionSyncRecord,
  getNotionSyncStatus,
  isNotionConnectorReady,
  isNotionPullEnabled,
  fetchNotionApi,
  fetchNotionPage,
  fetchNotionDatabasePages,
  buildReconcilePlan,
  buildPullReconcilePlan,
  recordNotionConflict,
  pushAlphonsoTaskToNotion,
  pullNotionPage,
  pullNotionDatabase,
  ingestAlphonsoTaskFromNotionPage,
  notionSyncWeeklyReport
});

export default NOTION_SYNC_PUBLIC_API;
