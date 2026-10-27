// Agent roles Part C2: Echo matches decisions by meaning with a small local model (all-minilm),
// downloaded the first time he searches while Ollama runs; word search covers everything until then.
import { describe, it, expect, beforeEach, vi } from 'vitest';

let models: string[] = [];
let ollamaUp = true;
let embedHangs = false;
const embedCalls: string[][] = [];
const kv: Record<string, string> = {};
// A tiny fake meaning: launch/release/date words point one way, price words another.
const MEANING: Record<string, number> = { launch: 0, release: 0, date: 0, when: 0, price: 1, cost: 1, logo: 2, colour: 2 };
function fakeVector(text: string): number[] {
  const v = [0.01, 0.01, 0.01];
  for (const word of text.toLowerCase().match(/[a-z]+/g) || []) if (word in MEANING) v[MEANING[word]] += 1;
  return v;
}
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    if (cmd === 'ollama_list_models') {
      if (!ollamaUp) return { http_status: null, models: [] };
      return { http_status: 200, models: models.map((name) => ({ name })) };
    }
    if (cmd === 'ollama_embed') {
      embedCalls.push(args.inputs);
      if (embedHangs) return new Promise(() => undefined);
      return args.inputs.map(fakeVector);
    }
    if (cmd === 'kv_set') { kv[args.key] = args.value; return null; }
    if (cmd === 'kv_get') return kv[args.key] ?? null;
    if (cmd === 'kv_list_keys') return Object.keys(kv).filter((k) => k.startsWith(args.prefix));
    return null;
  }),
}));
const pull = vi.fn();
vi.mock('../../../lib/ollama', async (orig) => ({
  ...(await orig() as object),
  pullOllamaModel: (...a: unknown[]) => pull(...a),
  getConfiguredOllamaEndpoint: () => 'http://127.0.0.1:11434',
}));
vi.mock('../../../services/chromaDbService', () => ({ isChromaHealthy: vi.fn(async () => false), semanticSearchMemory: vi.fn(async () => null), addMemoryToChroma: vi.fn(async () => undefined) }));
vi.mock('../../../services/memoryGraphService', () => ({ addNode: vi.fn(async () => null), addEdge: vi.fn(async () => null) }));

import { ensureMeaning, meaningState, resetMeaningForTests, ECHO_EMBED_MODEL } from '../../../services/echo/meaning';
import { searchDecisions } from '../../../services/echo/recall';
import { addDecision } from '../../../services/echo/decisions';

const decide = (text: string, topics: string[]) => addDecision({ kind: 'decision', text, topics, source: { surface: 'chat', by: 'you' } } as never);

beforeEach(() => {
  localStorage.clear();
  resetMeaningForTests();
  models = [`${ECHO_EMBED_MODEL}:latest`];
  ollamaUp = true;
  embedHangs = false;
  embedCalls.length = 0;
  for (const k of Object.keys(kv)) delete kv[k];
  pull.mockReset().mockImplementation(async ({ onProgress }: any) => { onProgress?.({ status: 'pulling', percent: 40 }); models = [`${ECHO_EMBED_MODEL}:latest`]; return { ok: true, model: ECHO_EMBED_MODEL }; });
});

describe("Echo's meaning search", () => {
  it('finds a decision worded differently that word search misses', async () => {
    decide('The release moved to 12 March.', ['schedule']);
    decide('The logo stays green.', ['brand']);
    expect((await searchDecisions('when do we launch?')).map((d) => d.text)).toEqual([]);
    await ensureMeaning();
    expect(meaningState().kind).toBe('ready');
    expect((await searchDecisions('when do we launch?')).map((d) => d.text)).toEqual(['The release moved to 12 March.']);
  });

  it('downloads the model the first time, with its progress, then reads every decision', async () => {
    models = [];
    decide('The release moved to 12 March.', ['schedule']);
    const seen: string[] = [];
    await ensureMeaning((s) => seen.push(s.kind));
    expect(pull).toHaveBeenCalledWith(expect.objectContaining({ model: ECHO_EMBED_MODEL }));
    expect(seen).toEqual(expect.arrayContaining(['downloading', 'indexing', 'ready']));
    expect(Object.keys(kv).filter((k) => k.startsWith('echo_vec:'))).toHaveLength(1);
  });

  it('switched off: no model, no embedding, word search only', async () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ echoMeaningSearch: false }));
    decide('The release moved to 12 March.', ['schedule']);
    await ensureMeaning();
    expect(meaningState().kind).toBe('off');
    await searchDecisions('when do we launch?');
    expect(embedCalls).toEqual([]);
  });

  it('Ollama off: says so, and word search still answers', async () => {
    ollamaUp = false;
    decide('The logo stays green.', ['logo']);
    await ensureMeaning();
    expect(meaningState().kind).toBe('no_ollama');
    expect((await searchDecisions('logo')).map((d) => d.text)).toEqual(['The logo stays green.']);
  });

  it('a failed download says why, and word search still answers', async () => {
    models = [];
    pull.mockResolvedValueOnce({ ok: false, model: ECHO_EMBED_MODEL });
    decide('The logo stays green.', ['logo']);
    await ensureMeaning();
    expect(meaningState()).toMatchObject({ kind: 'failed' });
    expect((await searchDecisions('logo')).length).toBe(1);
  });

  it('an embedding that never answers does not hold up a search for long', async () => {
    decide('The logo stays green.', ['logo']);
    await ensureMeaning();
    embedHangs = true;
    vi.useFakeTimers();
    try {
      const search = searchDecisions('logo colour');
      await vi.advanceTimersByTimeAsync(4500);
      expect((await search).map((d) => d.text)).toEqual(['The logo stays green.']);
    } finally {
      vi.useRealTimers();
    }
  });
});
