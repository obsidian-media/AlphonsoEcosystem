const CHROMA_BASE = 'http://127.0.0.1:8000';
const COLLECTION = 'alphonso_echo_memory';

interface ChromaMemory {
  id?: string;
  memoryId?: string;
  title?: string;
  content?: string | { synthesis?: string };
  category?: string;
  sourceAgent?: string;
  timestampMs?: number;
}

interface ChromaSearchResult {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
}

interface ChromaErrorEntry {
  error: string;
  collection: string;
  ts: number;
}

const writeErrors: ChromaErrorEntry[] = [];

export function getChromaWriteErrors(): ChromaErrorEntry[] {
  return writeErrors.slice();
}

export async function isChromaHealthy(): Promise<boolean> {
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

export async function addMemoryToChroma(memory: ChromaMemory) {
  try {
    await ensureCollection();
    const docText = [memory.title, (memory.content as Record<string, unknown>)?.synthesis || memory.content || ''].filter(Boolean).join(' ');
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
    const errorEntry: ChromaErrorEntry = { error: (e as Error)?.message || String(e), collection: COLLECTION, ts: Date.now() };
    writeErrors.push(errorEntry);
    if (writeErrors.length > 10) writeErrors.shift();
    try {
      const { logError } = await import('./crashLogService.js');
      logError('chroma_write_error', errorEntry as unknown as Record<string, unknown>);
    } catch { /* non-critical */ }
  }
}

export async function semanticSearchMemory(query: string, nResults = 10): Promise<ChromaSearchResult[] | null> {
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
    return (data.ids?.[0] || []).map((id: string, i: number) => ({
      id,
      score: data.distances?.[0]?.[i] ?? 1,
      metadata: data.metadatas?.[0]?.[i] || {},
    }));
  } catch {
    return null;
  }
}

export async function deleteMemoryFromChroma(id: string) {
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
