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

const QUOTA_WARNING_THRESHOLD = 0.85;

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const TTL_CONFIG = {
  project_memory: DEFAULT_TTL_MS,
  task_memory: 14 * 24 * 60 * 60 * 1000,
  runtime_memory: 7 * 24 * 60 * 60 * 1000,
  workspace_memory: DEFAULT_TTL_MS,
  creative_memory: 90 * 24 * 60 * 60 * 1000,
  orchestration_memory: 7 * 24 * 60 * 60 * 1000,
  research_memory: DEFAULT_TTL_MS,
  source_memory: DEFAULT_TTL_MS,
  citation_memory: DEFAULT_TTL_MS,
  preference_memory: 180 * 24 * 60 * 60 * 1000,
  code_symbol_memory: DEFAULT_TTL_MS,
  timeline_memory: 14 * 24 * 60 * 60 * 1000,
  brand_memory: 365 * 24 * 60 * 60 * 1000,
  aesthetic_memory: 365 * 24 * 60 * 60 * 1000,
  campaign_memory: 180 * 24 * 60 * 60 * 1000,
  story_memory: 90 * 24 * 60 * 60 * 1000,
  agent_memory: DEFAULT_TTL_MS,
  audit_memory: 365 * 24 * 60 * 60 * 1000,
  decision_memory: 90 * 24 * 60 * 60 * 1000,
  build_memory: DEFAULT_TTL_MS,
  approval_memory: 90 * 24 * 60 * 60 * 1000,
  workflow_timeline_memory: 90 * 24 * 60 * 60 * 1000,
  workflow_artifact_memory: 180 * 24 * 60 * 60 * 1000,
  workflow_governance_memory: 365 * 24 * 60 * 60 * 1000,
  workflow_receipt_memory: 365 * 24 * 60 * 60 * 1000
};

function logMemory(level, message, data) {
  const prefix = '[unifiedMemoryService]';
  if (level === 'error') {
    console.error(prefix, message, data || '');
  } else if (level === 'warn') {
    console.warn(prefix, message, data || '');
  } else {
    console.log(prefix, message, data || '');
  }
}

const CONTENT_HASH_CACHE = new Map();

function contentHash(item) {
  if (!item || !item.content) return '';
  const raw = typeof item.content === 'string' ? item.content : JSON.stringify(item.content);
  const key = `${item.title || ''}|${raw}`;
  if (CONTENT_HASH_CACHE.has(key)) return CONTENT_HASH_CACHE.get(key);
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const chr = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  CONTENT_HASH_CACHE.set(key, String(hash));
  return String(hash);
}

export function clearContentHashCache() {
  CONTENT_HASH_CACHE.clear();
}

const AUTO_TAG_KEYWORDS = [
  { pattern: /\b(urgent|critical|blocker|p0|p1)\b/i, tags: ['high-priority'] },
  { pattern: /\b(bug|error|crash|fail|exception)\b/i, tags: ['bug'] },
  { pattern: /\b(feature|enhancement|request)\b/i, tags: ['feature'] },
  { pattern: /\b(refactor|cleanup|tech-debt)\b/i, tags: ['refactor'] },
  { pattern: /\b(doc|documentation|readme|guide)\b/i, tags: ['documentation'] },
  { pattern: /\b(test|coverage|spec)\b/i, tags: ['testing'] },
  { pattern: /\b(security|vuln|cve|exploit)\b/i, tags: ['security'] },
  { pattern: /\b(perf|performance|optimize|slow)\b/i, tags: ['performance'] },
  { pattern: /\b(deploy|release|ci|cd)\b/i, tags: ['devops'] },
  { pattern: /\b(ui|ux|design|style|css)\b/i, tags: ['ui'] },
  { pattern: /\b(api|endpoint|route)\b/i, tags: ['api'] },
  { pattern: /\b(db|database|migration|schema|query)\b/i, tags: ['database'] },
  { pattern: /\b(auth|login|permission|rbac|oauth)\b/i, tags: ['auth'] },
  { pattern: /\b(backup|recovery|snapshot|restore)\b/i, tags: ['backup'] },
  { pattern: /\b(config|configur|setting|env)\b/i, tags: ['configuration'] },
  { pattern: /\b(monitor|observability|logging|tracing)\b/i, tags: ['observability'] },
  { pattern: /\b(workflow|orchestrat|pipeline)\b/i, tags: ['workflow'] },
  { pattern: /\b(agent|llm|model|ai|ml)\b/i, tags: ['ai'] }
];

function computeAutoTags(item) {
  const tags = new Set(Array.isArray(item.tags) ? item.tags : []);
  const haystack = `${item.title || ''} ${typeof item.content === 'string' ? item.content : JSON.stringify(item.content || '')}`;
  for (const rule of AUTO_TAG_KEYWORDS) {
    if (rule.pattern.test(haystack)) {
      for (const tag of rule.tags) tags.add(tag);
    }
  }
  return [...tags];
}

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

// ── TTL / Garbage Collection ───────────────────────────────────────────

const _tickLog = { warned: false };

export function tickExpiry(now = Date.now()) {
  let removed = 0;
  let expiredCategories = {};
  for (const ns of MEMORY_NAMESPACES) {
    const rows = readLocal(ns);
    const before = rows.length;
    const kept = rows.filter((item) => {
      if (item.expiresAt && Number(new Date(item.expiresAt).getTime()) <= now) return false;
      const ttl = TTL_CONFIG[item.category] || DEFAULT_TTL_MS;
      const age = now - Number(item.timestampMs || 0);
      if (age > ttl) {
        const cat = item.category || 'unknown';
        expiredCategories[cat] = (expiredCategories[cat] || 0) + 1;
        return false;
      }
      return true;
    });
    if (kept.length < before) {
      writeLocal(ns, kept);
      removed += before - kept.length;
    }
  }
  if (removed > 0 && !_tickLog.warned) {
    logMemory('info', `tickExpiry: removed ${removed} expired items`, expiredCategories);
    if (removed > 100) _tickLog.warned = true;
  }
  return removed;
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
    .catch((err) => {
      logMemory('error', 'queueDurableWrite failed', err);
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
  tickExpiry();
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

  const tagged = autoTagMemoryItem(item);

  // Write to localStorage namespace
  const items = readLocal(namespace);
  items.push(tagged);
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
    queueDurableWrite(tagged);
  }

  return tagged;
}

/**
 * List memory items across all namespaces with optional filters.
 */
export function listMemory(filters = {}) {
  tickExpiry();
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
  tickExpiry();
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

// ── Size tracking ─────────────────────────────────────────────────────

export function getMemorySize(namespace) {
  const key = STORAGE_KEYS[namespace];
  if (!key) return 0;
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Blob([raw]).size : 0;
  } catch {
    return 0;
  }
}

export function getAllMemorySizes() {
  const sizes = {};
  for (const ns of MEMORY_NAMESPACES) {
    sizes[ns] = getMemorySize(ns);
  }
  return sizes;
}

// ── Quota warnings ───────────────────────────────────────────────────

export function checkQuota() {
  const warnings = [];
  for (const ns of MEMORY_NAMESPACES) {
    const rows = readLocal(ns);
    const cap = CAPS[ns] || CAPS.shared;
    const usage = rows.length;
    const ratio = usage / cap;
    if (ratio >= QUOTA_WARNING_THRESHOLD) {
      const pct = Math.round(ratio * 100);
      warnings.push({ namespace: ns, usage, cap, ratio, message: `${ns}: ${usage}/${cap} (${pct}%)` });
      logMemory('warn', `Quota warning for namespace "${ns}": ${usage}/${cap} (${pct}%)`);
    }
  }
  return warnings;
}

// ── Deduplication by content hash ────────────────────────────────────

export function deduplicateMemory(namespace) {
  tickExpiry();
  const rows = readLocal(namespace);
  const seen = new Map();
  const deduped = [];
  let removedCount = 0;
  for (const item of rows) {
    const hash = contentHash(item);
    const existing = seen.get(hash);
    if (existing) {
      const existingTs = Number(existing.timestampMs || 0);
      const itemTs = Number(item.timestampMs || 0);
      if (itemTs > existingTs) {
        seen.set(hash, item);
      }
      removedCount++;
    } else {
      seen.set(hash, item);
    }
  }
  for (const item of seen.values()) {
    deduped.push(item);
  }
  deduped.sort((a, b) => Number(a.timestampMs || 0) - Number(b.timestampMs || 0));
  if (removedCount > 0) {
    writeLocal(namespace, deduped);
    logMemory('info', `deduplicateMemory[${namespace}]: removed ${removedCount} duplicates`);
  }
  return { originalCount: rows.length, dedupedCount: deduped.length, removedCount };
}

export function deduplicateAllNamespaces() {
  const results = {};
  for (const ns of MEMORY_NAMESPACES) {
    results[ns] = deduplicateMemory(ns);
  }
  return results;
}

// ── Auto-tagging ─────────────────────────────────────────────────────

export function autoTagMemoryItem(item) {
  if (!item) return item;
  const autoTags = computeAutoTags(item);
  const existing = new Set(Array.isArray(item.tags) ? item.tags : []);
  for (const tag of autoTags) existing.add(tag);
  return { ...item, tags: [...existing] };
}

// ── Export / Import ───────────────────────────────────────────────────

export function exportMemoryItems(namespace, filters = {}) {
  tickExpiry();
  const items = namespace
    ? listMemoryByNamespace(namespace).filter((item) => {
        if (filters.category && item.category !== filters.category) return false;
        if (filters.sourceAgent && item.sourceAgent !== filters.sourceAgent) return false;
        return true;
      })
    : listMemory(filters);
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    namespace: namespace || 'all',
    count: items.length,
    items: items.map(({ tags, ...rest }) => ({ ...rest, tags: tags || [] }))
  };
  return payload;
}

export function importMemoryItems(json, namespace) {
  if (!json || !Array.isArray(json.items)) {
    logMemory('error', 'importMemoryItems: invalid payload');
    return { imported: 0, errors: 1 };
  }
  const targetNs = namespace || json.namespace || 'shared';
  if (!MEMORY_NAMESPACES.includes(targetNs)) {
    logMemory('error', `importMemoryItems: invalid namespace "${targetNs}"`);
    return { imported: 0, errors: 1 };
  }
  const existing = readLocal(targetNs);
  const existingIds = new Set(existing.map((i) => i.id));
  let imported = 0;
  let skipped = 0;
  for (const item of json.items) {
    if (existingIds.has(item.id)) {
      skipped++;
      continue;
    }
    const tagged = autoTagMemoryItem({
      ...item,
      namespace: targetNs,
      timestampMs: Number(item.timestampMs || Date.now()),
      tags: Array.isArray(item.tags) ? item.tags : []
    });
    existing.push(tagged);
    existingIds.add(tagged.id);
    imported++;
  }
  writeLocal(targetNs, existing);
  logMemory('info', `importMemoryItems[${targetNs}]: imported ${imported}, skipped ${skipped}`);
  return { imported, skipped, total: imported + skipped };
}

// ── Memory summary for diagnostics ────────────────────────────────────

export function getMemorySummary() {
  tickExpiry();
  const summary = { total: 0, byNamespace: {}, byCategory: {}, oldest: null, newest: null, quotaWarnings: checkQuota() };
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
