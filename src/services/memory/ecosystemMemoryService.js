const MEMORY_KEY = 'alphonso_ecosystem_memory_v1';
export const MEMORY_CONFIDENCE = Object.freeze([
  'verified',
  'inferred',
  'temporary',
  'outdated',
  'unverified'
]);

export const MEMORY_CATEGORIES = Object.freeze([
  'project_memory',
  'agent_memory',
  'research_memory',
  'audit_memory',
  'decision_memory',
  'build_memory',
  'approval_memory'
]);

function readMemory() {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMemory(rows) {
  localStorage.setItem(MEMORY_KEY, JSON.stringify(rows.slice(-1500)));
}

export function addMemoryItem(item) {
  const normalizedConfidence = MEMORY_CONFIDENCE.includes(item?.confidence) ? item.confidence : 'unverified';
  const safeItem = {
    id: item?.id || `memory-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    type: item?.type || 'note',
    projectId: item?.projectId || null,
    agentId: item?.agentId || 'system',
    title: item?.title || 'Untitled memory',
    content: item?.content || '',
    confidence: normalizedConfidence,
    createdAt: item?.createdAt || new Date().toISOString(),
    expiresAt: item?.expiresAt || null,
    source: item?.source || 'local_agent_workshop',
    tags: Array.isArray(item?.tags) ? item.tags : []
  };
  const rows = readMemory();
  rows.push(safeItem);
  writeMemory(rows);
  return safeItem;
}

export function addFailureMemory(payload = {}) {
  return addMemoryItem({
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

export function listMemoryItems(filters = {}) {
  return readMemory().filter((item) => {
    if (filters.projectId && item.projectId !== filters.projectId) return false;
    if (filters.agentId && item.agentId !== filters.agentId) return false;
    if (filters.type && item.type !== filters.type) return false;
    if (filters.confidence && item.confidence !== filters.confidence) return false;
    return true;
  });
}

export function clearExpiredMemory(now = Date.now()) {
  const rows = readMemory();
  const next = rows.filter((item) => !item.expiresAt || Number(new Date(item.expiresAt).getTime()) > now);
  writeMemory(next);
  return { removed: rows.length - next.length, remaining: next.length };
}
