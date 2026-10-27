// Echo matches decisions by meaning (agent roles Part C2, owner 2026-10-26): a small local
// embedding model (all-minilm, 46 MB, Apache-2.0) is downloaded the first time Echo searches while
// Ollama runs and the switch in Settings → Memory is on. Decisions get a vector, kept in the
// backend's own store; a search adds the closest by meaning to the word matches. Anything missing
// (no Ollama, the switch off, a failed download) leaves word search as it was, and Settings says why.
import { invoke } from '@tauri-apps/api/core';
import { getConfiguredOllamaEndpoint, pullOllamaModel } from '../../lib/ollama';
import { listDecisions, type Decision } from './decisions';

export const ECHO_EMBED_MODEL = 'all-minilm';
/** A decision counts as a match by meaning only this close to the question (cosine similarity). */
export const MEANING_MIN_SIMILARITY = 0.55;
/** A search never waits longer than this for the question's vector. */
export const MEANING_QUERY_WAIT_MS = 4000;
const BATCH = 32;
const VECTOR_KEY = 'echo_vec:';

export type MeaningState =
  | { kind: 'off' }
  | { kind: 'no_ollama' }
  | { kind: 'downloading'; pct: number | null }
  | { kind: 'indexing'; done: number; total: number }
  | { kind: 'ready' }
  | { kind: 'failed'; reason: string };

let state: MeaningState = { kind: 'off' };
let running: Promise<void> | null = null;
let vectors: Map<string, number[]> | null = null;
const listeners = new Set<(s: MeaningState) => void>();

function setState(next: MeaningState, extra?: (s: MeaningState) => void): void {
  state = next;
  extra?.(next);
  for (const l of listeners) l(next);
}

export function meaningState(): MeaningState { return state; }
export function onMeaningState(listener: (s: MeaningState) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function resetMeaningForTests(): void { state = { kind: 'off' }; running = null; vectors = null; listeners.clear(); }

/** Settings → Memory → "Match decisions by meaning"; on unless switched off. */
export function meaningEnabled(): boolean {
  try { return JSON.parse(localStorage.getItem('alphonso_settings') || '{}')?.echoMeaningSearch !== false; } catch { return true; }
}

const round = (v: number[]) => v.map((x) => Math.round(x * 10000) / 10000);

async function embed(texts: string[]): Promise<number[][]> {
  return invoke<number[][]>('ollama_embed', { endpoint: getConfiguredOllamaEndpoint(), model: ECHO_EMBED_MODEL, inputs: texts });
}

async function loadVectors(): Promise<Map<string, number[]>> {
  if (vectors) return vectors;
  const map = new Map<string, number[]>();
  try {
    const keys = (await invoke<string[]>('kv_list_keys', { prefix: VECTOR_KEY })) || [];
    for (const key of keys) {
      const raw = await invoke<string | null>('kv_get', { key });
      try { if (raw) map.set(key.slice(VECTOR_KEY.length), JSON.parse(raw)); } catch { /* a broken vector is made again */ }
    }
  } catch { /* no store: vectors are made again */ }
  vectors = map;
  return map;
}

async function keep(id: string, vector: number[]): Promise<void> {
  (await loadVectors()).set(id, vector);
  try { await invoke('kv_set', { key: `${VECTOR_KEY}${id}`, value: JSON.stringify(round(vector)) }); } catch { /* kept in memory for this session */ }
}

async function index(pending: Decision[], extra?: (s: MeaningState) => void): Promise<void> {
  for (let i = 0; i < pending.length; i += BATCH) {
    setState({ kind: 'indexing', done: i, total: pending.length }, extra);
    const batch = pending.slice(i, i + BATCH);
    const rows = await embed(batch.map((d) => d.text));
    for (let j = 0; j < batch.length; j += 1) await keep(batch[j].id, rows[j]);
  }
}

async function prepare(extra?: (s: MeaningState) => void): Promise<void> {
  if (!meaningEnabled()) { setState({ kind: 'off' }, extra); return; }
  const endpoint = getConfiguredOllamaEndpoint();
  let listed: { http_status?: number | null; models?: { name: string }[] } | null = null;
  try { listed = await invoke('ollama_list_models', { endpoint }); } catch { listed = null; }
  if (!listed?.http_status) { setState({ kind: 'no_ollama' }, extra); return; }
  const has = (listed.models || []).some((m) => m.name === ECHO_EMBED_MODEL || m.name.startsWith(`${ECHO_EMBED_MODEL}:`));
  if (!has) {
    setState({ kind: 'downloading', pct: null }, extra);
    const pulled = await pullOllamaModel({ endpoint, model: ECHO_EMBED_MODEL, onProgress: (p) => setState({ kind: 'downloading', pct: p.percent }, extra) })
      .catch((error: unknown) => ({ ok: false, error }));
    if (!pulled.ok) {
      const why = (pulled as { error?: unknown }).error;
      setState({ kind: 'failed', reason: why instanceof Error ? why.message : 'the download did not finish' }, extra);
      return;
    }
  }
  const known = await loadVectors();
  try {
    await index(listDecisions({ status: 'active' }).filter((d) => !known.has(d.id)), extra);
  } catch (error) {
    setState({ kind: 'failed', reason: error instanceof Error ? error.message : String(error) }, extra);
    return;
  }
  setState({ kind: 'ready' }, extra);
}

/** Gets the model and every decision's vector ready, once; never throws. A second call joins the first. */
export function ensureMeaning(onState?: (s: MeaningState) => void): Promise<void> {
  if (state.kind === 'ready' && meaningEnabled()) return Promise.resolve();
  if (!running) running = prepare(onState).catch(() => undefined).finally(() => { running = null; });
  return running;
}

/** A new decision gets its vector when the meaning search is ready; never throws. */
export function indexDecisionMeaning(d: Decision): void {
  if (state.kind !== 'ready' || !meaningEnabled()) return;
  void embed([d.text]).then((rows) => keep(d.id, rows[0])).catch(() => undefined);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0; let na = 0; let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** The ids of the decisions closest in meaning to a question, best first; [] when not ready or slow. */
export async function meaningMatches(query: string, pool: Decision[], limit: number): Promise<string[]> {
  if (state.kind !== 'ready' || !meaningEnabled() || !query.trim()) return [];
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), MEANING_QUERY_WAIT_MS); });
    const rows = await Promise.race([embed([query]), late]).finally(() => clearTimeout(timer));
    if (!rows) return [];
    const known = await loadVectors();
    return pool
      .map((d) => ({ id: d.id, score: known.has(d.id) ? cosine(rows[0], known.get(d.id)!) : 0 }))
      .filter((x) => x.score >= MEANING_MIN_SIMILARITY)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.id);
  } catch {
    return [];
  }
}
