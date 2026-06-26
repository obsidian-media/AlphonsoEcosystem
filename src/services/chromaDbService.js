const CHROMA_BASE = 'http://127.0.0.1:8000';
const COLLECTION = 'alphonso_echo_memory';

const writeErrors = [];

export function getChromaWriteErrors() {
  return writeErrors.slice();
}

export async function isChromaHealthy() {
  try {
    const r = await fetch(`${CHROMA_BASE}/api/v1/heartbeat`, {
      signal: AbortSignal.timeout(1500),
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function ensureCollection() {
  await fetch(`${CHROMA_BASE}/api/v1/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: COLLECTION, get_or_create: true }),
  });
}

export async function addMemoryToChroma(memory) {
  try {
    await ensureCollection();
    const docText = [memory.title, memory.content?.synthesis || memory.content || ''].filter(Boolean).join(' ');
    await fetch(`${CHROMA_BASE}/api/v1/collections/${COLLECTION}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: [memory.id || memory.memoryId || `mem-${Date.now()}`],
        documents: [docText],
        metadatas: [{
          category: memory.category || 'general',
          agent: memory.sourceAgent || 'echo',
          createdAt: memory.timestampMs || Date.now(),
        }],
      }),
    });
  } catch (e) {
    // Non-blocking — ChromaDB being offline must not break memory save
    const errorEntry = { error: e?.message || String(e), collection: COLLECTION, ts: Date.now() };
    writeErrors.push(errorEntry);
    if (writeErrors.length > 10) writeErrors.shift();
    try {
      const { logError } = await import('./crashLogService.js');
      logError('chroma_write_error', errorEntry);
    } catch { /* non-critical */ }
  }
}

export async function semanticSearchMemory(query, nResults = 10) {
  const healthy = await isChromaHealthy();
  if (!healthy) return null;
  try {
    await ensureCollection();
    const r = await fetch(`${CHROMA_BASE}/api/v1/collections/${COLLECTION}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query_texts: [query], n_results: nResults }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return (data.ids?.[0] || []).map((id, i) => ({
      id,
      score: data.distances?.[0]?.[i] ?? 1,
      metadata: data.metadatas?.[0]?.[i] || {},
    }));
  } catch {
    return null;
  }
}

export async function deleteMemoryFromChroma(id) {
  try {
    await fetch(`${CHROMA_BASE}/api/v1/collections/${COLLECTION}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    });
  } catch {
    // best-effort
  }
}
