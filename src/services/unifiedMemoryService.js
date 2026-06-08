import { invoke } from '@tauri-apps/api/core';
import { TRUST_STATES, timestampMs } from './trustModel';
import { appendAgentActivity } from './agentActivityService';
import { persistScopeRows } from './runtimeLedgerService';

// Unified categories from all 4 systems
export const MEMORY_CATEGORIES = [
  // memoryService categories
  'project_memory', 'task_memory', 'runtime_memory', 'workspace_memory',
  'creative_memory', 'orchestration_memory', 'research_memory', 'source_memory',
  'citation_memory', 'preference_memory', 'code_symbol_memory', 'timeline_memory',
  // miyaMemoryService categories
  'brand_memory', 'aesthetic_memory', 'campaign_memory', 'story_memory',
  // ecosystemMemoryService categories
  'agent_memory', 'audit_memory', 'decision_memory', 'build_memory', 'approval_memory',
  // workflowMemoryService categories
  'workflow_timeline_memory', 'workflow_artifact_memory', 'workflow_governance_memory', 'workflow_receipt_memory'
];

export const MEMORY_NAMESPACES = ['shared', 'miya', 'ecosystem', 'workflow'];

const STORAGE_KEYS = {
  shared: 'alphonso_memory_items_v1',
  miya: 'alphonso_miya_memory_v1',
  ecosystem: 'alphonso_ecosystem_memory_v1'
};

const CAPS = { shared: 1000, miya: 700, ecosystem: 1500, workflow: 2000 };

const durableMemoryProbe = { checked: false, available: false, nextCheckAtMs: 0 };
let durableWriteQueue = Promise.resolve();

// ── LocalStorage helpers ──────────────────────────────────────────────

function readLocal(namespace) {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[namespace] || STORAGE_KEYS.shared);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(namespace, items) {
  const key = STORAGE_KEYS[namespace] || STORAGE_KEYS.shared;
  const cap = CAPS[namespace] || CAPS.shared;
  localStorage.setItem(key, JSON.stringify(items.slice(-cap)));
}

// ── SQLite durable layer ──────────────────────────────────────────────

async function checkDurableAvailable(force = false) {
  const now = timestampMs();
  if (!force && durableMemoryProbe.checked && durableMemoryProbe.nextCheckAtMs > now) {
    return durableMemoryProbe.available;
  }
  try {
    const status = await invoke('get_memory_store_status');
    const available = Boolean(status?.available);
    durableMemoryProbe.checked = true;
    durableMemoryProbe.available = available;
    durableMemoryProbe.nextCheckAtMs = now + (available ? 60_000 : 15_000);
    return available;
  } catch {
    durableMemoryProbe.checked = true;
    durableMemoryProbe.available = false;
    durableMemoryProbe.nextCheckAtMs = now + 15_000;
    return false;
  }
}

function toDurableRecord(item) {
  const governance = {
    workflowOwner: item.workflowOwner || null,
    sensitivity: item.sensitivity || 'internal',
    retentionPolicy: item.retentionPolicy || 'standard',
    privacyStatus: item.privacyStatus || 'local_governed',
    updatedAtMs: Number(item.updatedAtMs || timestampMs())
  };
  const baseContent = item.content ?? '';
  const content = baseContent && typeof baseContent === 'object' && !Array.isArray(baseContent)
    ? { ...baseContent, __governance: governance }
    : { value: baseContent, __governance: governance };
  return {
    id: item.id, title: item.title, content, category: item.category,
    sourceAgent: item.sourceAgent, source: item.source,
    timestampMs: Number(item.timestampMs || timestampMs()),
    confidence: item.confidence || TRUST_STATES.UNVERIFIED,
    verificationState: item.verificationState || TRUST_STATES.UNVERIFIED,
    projectReference: item.projectReference || null,
    expiresAt: item.expiresAt || null, expiryRule: item.expiryRule || null
  };
}

function queueDurableWrite(record) {
  durableWriteQueue = durableWriteQueue
    .then(async () => {
      if (!(await checkDurableAvailable())) return;
      await invoke('upsert_memory_records', { records: [toDurableRecord(record)] });
    })
    .catch(() => {
      durableMemoryProbe.available = false;
      durableMemoryProbe.nextCheckAtMs = timestampMs() + 10_000;
    });
}

function normalizeDurableRecord(row) {
  const content = row.content;
  const governance = content && typeof content === 'object' && !Array.isArray(content)
    ? content.__governance || {} : {};
  const normalizedContent = content && typeof content === 'object' && !Array.isArray(content) && Object.prototype.hasOwnProperty.call(content, 'value')
    ? content.value : content;
  return {
    id: row.id, title: row.title || 'Untitled memory',
    content: normalizedContent ?? '', category: row.category || 'timeline_memory',
    sourceAgent: row.sourceAgent || 'alphonso', source: row.source || 'runtime',
    timestampMs: Number(row.timestampMs || timestampMs()),
    confidence: row.confidence || TRUST_STATES.UNVERIFIED,
    verificationState: row.verificationState || TRUST_STATES.UNVERIFIED,
    projectReference: row.projectReference || null,
    expiresAt: row.expiresAt || null, expiryRule: row.expiryRule || null,
    workflowOwner: governance.workflowOwner || row.workflowOwner || null,
    sensitivity: governance.sensitivity || row.sensitivity || 'internal',
    retentionPolicy: governance.retentionPolicy || row.retentionPolicy || 'standard',
    privacyStatus: governance.privacyStatus || row.privacyStatus || 'local_governed',
    updatedAtMs: Number(governance.updatedAtMs || row.updatedAtMs || row.timestampMs || timestampMs())
  };
}

// ── Expiry handling ───────────────────────────────────────────────────

function withExpiryState(item) {
  if (item.expiresAt && item.expiresAt < timestampMs() && item.confidence !== TRUST_STATES.EXPIRED) {
    return { ...item, confidence: TRUST_STATES.EXPIRED, verificationState: TRUST_STATES.EXPIRED };
  }
  return item;
}

// ── Unified API ───────────────────────────────────────────────────────

/**
 * Push a memory item into the unified store.
 * @param {Object} partial
 * @param {'shared'|'miya'|'ecosystem'|'workflow'} [partial.namespace='shared']
 */
export function pushMemory(partial) {
  const namespace = partial.namespace || 'shared';
  const now = timestampMs();

  const item = {
    id: partial.id || `${namespace}-mem-${now}-${Math.random().toString(16).slice(2, 8)}`,
    timestampMs: now,
    title: partial.title || 'Untitled memory',
    category: partial.category || 'timeline_memory',
    confidence: partial.confidence || TRUST_STATES.UNVERIFIED,
    source: partial.source || 'runtime',
    sourceAgent: partial.sourceAgent || partial.agent || 'alphonso',
    verificationState: partial.verificationState || TRUST_STATES.UNVERIFIED,
    expiresAt: partial.expiresAt || null,
    expiryRule: partial.expiryRule || null,
    projectReference: partial.projectReference || partial.projectId || null,
    content: partial.content ?? '',
    workflowOwner: partial.workflowOwner || partial.workflowId || null,
    workflowRunId: partial.workflowRunId || null,
    sensitivity: partial.sensitivity || 'internal',
    retentionPolicy: partial.retentionPolicy || 'standard',
    privacyStatus: partial.privacyStatus || 'local_governed',
    updatedAtMs: now,
    namespace,
    // ecosystem-specific fields
    type: partial.type || 'note',
    projectId: partial.projectId || partial.projectReference || null,
    agentId: partial.agentId || partial.sourceAgent || 'system',
    tags: Array.isArray(partial.tags) ? partial.tags : []
  };

  // Write to localStorage namespace
  const items = readLocal(namespace);
  items.push(item);
  writeLocal(namespace, items);

  // Miya-specific: agent activity + runtime ledger
  if (namespace === 'miya') {
    appendAgentActivity({ agent: 'miya', action: 'memory push', detail: (item.title || item.category).slice(0, 60) });
    persistScopeRows('miya_memory_v1', items, (row) => ({
      id: row.id, data: row, status: row.category || 'creative_memory',
      confidence: row.confidence || TRUST_STATES.TEMPORARY,
      verificationState: row.verificationState || TRUST_STATES.UNVERIFIED,
      timestampMs: Number(row.timestampMs || now)
    }));
  }

  // Queue SQLite write for shared/workflow namespaces
  if (namespace === 'shared' || namespace === 'workflow') {
    queueDurableWrite(item);
  }

  return item;
}

/**
 * List memory items across all namespaces with optional filters.
 */
export function listMemory(filters = {}) {
  const results = [];

  // Collect from all namespaces
  for (const ns of MEMORY_NAMESPACES) {
    const items = readLocal(ns).map(withExpiryState);
    for (const item of items) {
      if (!item.namespace) item.namespace = ns;
    }
    results.push(...items);
  }

  // Apply filters
  return results.filter((item) => {
    if (filters.namespace && item.namespace !== filters.namespace) return false;
    if (filters.category && item.category !== filters.category) return false;
    if (filters.sourceAgent && item.sourceAgent !== filters.sourceAgent) return false;
    if (filters.agentId && (item.agentId || item.sourceAgent) !== filters.agentId) return false;
    if (filters.projectId && (item.projectId || item.projectReference) !== filters.projectId) return false;
    if (filters.projectReference && item.projectReference !== filters.projectReference) return false;
    if (filters.workflowId) {
      const wfId = item.workflowOwner || item.workflowId;
      if (wfId !== filters.workflowId) return false;
    }
    if (filters.workflowRunId && item.workflowRunId !== filters.workflowRunId) return false;
    if (filters.type && item.type !== filters.type) return false;
    if (filters.confidence && item.confidence !== filters.confidence) return false;
    if (filters.source && item.source !== filters.source) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const haystack = `${item.title} ${typeof item.content === 'string' ? item.content : JSON.stringify(item.content)}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/**
 * List items from a specific namespace (backward compat).
 */
export function listMemoryByNamespace(namespace) {
  return readLocal(namespace).map(withExpiryState);
}

/**
 * Hydrate local memory from SQLite durable store.
 */
export async function hydrateFromDurable(filters = {}) {
  const available = await checkDurableAvailable(true);
  if (!available) return listMemory(filters);

  try {
    const rows = await invoke('list_memory_records', { filters });
    const durableRows = Array.isArray(rows) ? rows.map(normalizeDurableRecord) : [];
    if (!durableRows.length) {
      const localRows = listMemory(filters);
      if (localRows.length) {
        await invoke('upsert_memory_records', { records: localRows.map(toDurableRecord) });
      }
      return localRows;
    }

    const localShared = readLocal('shared');
    const merged = mergeById([...localShared, ...durableRows]).map(withExpiryState);
    writeLocal('shared', merged);
    return merged.filter((item) => {
      if (filters.category && item.category !== filters.category) return false;
      if (filters.sourceAgent && item.sourceAgent !== filters.sourceAgent) return false;
      return true;
    });
  } catch {
    return listMemory(filters);
  }
}

function mergeById(rows) {
  const byId = new Map();
  rows.forEach((row) => { if (row?.id) byId.set(row.id, row); });
  return [...byId.values()].sort((a, b) => Number(a.timestampMs || 0) - Number(b.timestampMs || 0));
}

// ── Specialized helpers (backward compat) ─────────────────────────────

/** @deprecated Use pushMemory({ namespace: 'shared', ... }) */
export function pushMemoryItem(partial) {
  return pushMemory({ ...partial, namespace: 'shared' });
}

/** @deprecated Use listMemory({ namespace: 'shared', ... }) */
export function listMemoryItems() {
  return listMemory({ namespace: 'shared' });
}

/** @deprecated Use pushMemory({ namespace: 'miya', ... }) */
export function pushMiyaMemory(partial) {
  return pushMemory({
    ...partial,
    namespace: 'miya',
    sourceAgent: 'miya',
    category: partial.category || 'creative_memory',
    confidence: partial.confidence || TRUST_STATES.TEMPORARY
  });
}

/** @deprecated Use listMemory({ namespace: 'miya' }) */
export function listMiyaMemory() {
  return listMemory({ namespace: 'miya' });
}

/** @deprecated Use pushMemory({ namespace: 'ecosystem', ... }) */
export function addMemoryItem(item) {
  return pushMemory({
    ...item,
    namespace: 'ecosystem',
    agentId: item.agentId || item.sourceAgent || 'system',
    projectId: item.projectId || item.projectReference || null,
    type: item.type || 'note',
    tags: Array.isArray(item.tags) ? item.tags : []
  });
}

/** @deprecated Use pushMemory({ namespace: 'ecosystem', type: 'failure_memory', ... }) */
export function addFailureMemory(payload = {}) {
  return pushMemory({
    namespace: 'ecosystem',
    type: 'failure_memory',
    projectId: payload.projectId || null,
    agentId: payload.agentId || 'system',
    title: payload.title || 'Failure event',
    content: {
      failureType: payload.failureType || 'unknown_failure',
      message: payload.message || '',
      context: payload.context || {}
    },
    confidence: payload.confidence || 'verified',
    source: payload.source || 'system_health',
    tags: ['failure', payload.failureType || 'unknown']
  });
}

/** @deprecated Use listMemory({ namespace: 'ecosystem', ... }) */
export function listEcosystemMemoryItems(filters = {}) {
  return listMemory({ namespace: 'ecosystem', ...filters });
}

/** @deprecated Use pushMemory({ namespace: 'workflow', workflowId, ... }) */
export function pushWorkflowMemory({ workflowId, workflowRunId, title, content, category, sourceAgent, confidence, verificationState, projectReference, expiryRule, expiresAt }) {
  return pushMemory({
    namespace: 'workflow',
    workflowId, workflowRunId,
    title: title || `Workflow memory: ${workflowId || 'unknown'}`,
    category: category || 'workflow_timeline_memory',
    content: { workflowId: workflowId || null, workflowRunId: workflowRunId || null, value: content ?? null },
    source: 'workflow-execution',
    sourceAgent: sourceAgent || 'jose',
    confidence: confidence || TRUST_STATES.TEMPORARY,
    verificationState: verificationState || TRUST_STATES.UNVERIFIED,
    projectReference: projectReference || 'alphonso-ecosystem',
    workflowOwner: workflowId || null,
    expiryRule, expiresAt,
    sensitivity: 'internal',
    retentionPolicy: 'workflow_audit_retention',
    privacyStatus: 'local_governed'
  });
}

/** @deprecated Use listMemory({ workflowId, workflowRunId }) */
export function listWorkflowMemory(workflowId, workflowRunId = null) {
  return listMemory({ workflowId, workflowRunId }).slice().reverse();
}

/** Miya brand kit — upserts a brand kit item in miya namespace */
export function upsertBrandKit(brandKit) {
  const rows = readLocal('miya');
  const next = {
    id: 'miya-brand-kit', timestampMs: timestampMs(), namespace: 'miya',
    category: 'brand_memory', title: 'Miya Brand Kit', content: brandKit,
    source: 'miya-brand-kit', sourceAgent: 'miya',
    confidence: TRUST_STATES.TEMPORARY, verificationState: TRUST_STATES.UNVERIFIED, expiresAt: null
  };
  const merged = [...rows.filter((row) => row.id !== 'miya-brand-kit'), next];
  writeLocal('miya', merged);
  return next;
}

// ── Durable memory status / migration (re-exports) ────────────────────

export async function getDurableMemoryStatus() {
  try {
    return await invoke('get_memory_store_status');
  } catch (error) {
    return {
      available: false, storage: 'sqlite', path: '', schemaVersion: 0,
      recordCount: 0, expiredCount: 0, checkedAtMs: timestampMs(),
      trust: TRUST_STATES.FAILED, error: String(error)
    };
  }
}

export async function listDurableMemoryRecords(filters = {}) {
  try { return await invoke('list_memory_records', { filters }); } catch { return []; }
}

export async function upsertDurableMemoryRecords(records) {
  return invoke('upsert_memory_records', { records });
}

export function normalizeMemoryRecord(item, defaults = {}) {
  const now = timestampMs();
  const governance = {
    workflowOwner: item.workflowOwner || defaults.workflowOwner || null,
    sensitivity: item.sensitivity || defaults.sensitivity || 'internal',
    retentionPolicy: item.retentionPolicy || defaults.retentionPolicy || 'standard',
    privacyStatus: item.privacyStatus || defaults.privacyStatus || 'local_governed',
    updatedAtMs: Number(item.updatedAtMs || item.timestampMs || item.createdAtMs || now)
  };
  const rawContent = item.content ?? item.details ?? '';
  const content = rawContent && typeof rawContent === 'object' && !Array.isArray(rawContent)
    ? { ...rawContent, __governance: governance }
    : { value: rawContent, __governance: governance };
  return {
    id: item.id || `mem-${now}-${Math.random().toString(16).slice(2, 8)}`,
    title: item.title || defaults.title || 'Untitled memory', content,
    category: item.category || defaults.category || 'timeline_memory',
    sourceAgent: item.sourceAgent || item.agent || defaults.sourceAgent || 'alphonso',
    source: item.source || defaults.source || 'localStorage-migration',
    timestampMs: Number(item.timestampMs || item.createdAtMs || item.updatedAtMs || now),
    confidence: item.confidence || defaults.confidence || TRUST_STATES.UNVERIFIED,
    verificationState: item.verificationState || defaults.verificationState || TRUST_STATES.UNVERIFIED,
    projectReference: item.projectReference || defaults.projectReference || null,
    expiresAt: item.expiresAt || defaults.expiresAt || null, expiryRule: item.expiryRule || defaults.expiryRule || null
  };
}

export async function hydrateMemoryFromDurable(filters = {}) {
  return hydrateFromDurable(filters);
}

export function clearExpiredMemory(now = Date.now()) {
  let removed = 0;
  for (const ns of MEMORY_NAMESPACES) {
    const rows = readLocal(ns);
    const next = rows.filter((item) => !item.expiresAt || Number(new Date(item.expiresAt).getTime()) > now);
    removed += rows.length - next.length;
    writeLocal(ns, next);
  }
  return { removed, remaining: listMemory().length };
}

// ── Memory summary for diagnostics ────────────────────────────────────

export function getMemorySummary() {
  const summary = { total: 0, byNamespace: {}, byCategory: {}, oldest: null, newest: null };
  const all = listMemory();
  summary.total = all.length;

  for (const item of all) {
    summary.byNamespace[item.namespace] = (summary.byNamespace[item.namespace] || 0) + 1;
    summary.byCategory[item.category] = (summary.byCategory[item.category] || 0) + 1;
    const ts = Number(item.timestampMs || 0);
    if (!summary.oldest || ts < summary.oldest) summary.oldest = ts;
    if (!summary.newest || ts > summary.newest) summary.newest = ts;
  }

  return summary;
}
