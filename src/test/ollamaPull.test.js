import { describe, it, expect, vi, beforeEach } from 'vitest';

// QA 2026-10-22 (Bug 73): pulling a model from the app window failed for an
// Ollama the user started (it refuses the window's origin). The desktop app
// now pulls through the backend and gets progress as events.

let progressHandler = null;
const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a) => mockInvoke(...a), isTauri: () => true }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_name, handler) => { progressHandler = handler; return () => { progressHandler = null; }; }),
}));

const { pullOllamaModel } = await import('../lib/ollama');

describe('pullOllamaModel in the desktop app', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    progressHandler = null;
    global.fetch = vi.fn();
  });

  it('pulls through the backend and reports progress', async () => {
    mockInvoke.mockImplementation(async (command, args) => {
      expect(command).toBe('ollama_pull_model');
      progressHandler({ payload: { pullId: args.pullId, status: 'pulling manifest', completed: null, total: null } });
      progressHandler({ payload: { pullId: args.pullId, status: 'pulling abc', completed: 50, total: 200 } });
      progressHandler({ payload: { pullId: 'someone-else', status: 'not mine', completed: 1, total: 2 } });
      progressHandler({ payload: { pullId: args.pullId, status: 'success', completed: null, total: null } });
      return { ok: true };
    });
    const seen = [];
    const result = await pullOllamaModel({ endpoint: 'http://127.0.0.1:11434', model: 'qwen3:0.6b', onProgress: (p) => seen.push(p) });
    expect(result).toEqual({ ok: true, model: 'qwen3:0.6b' });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(seen.map((p) => p.status)).toEqual(['pulling manifest', 'pulling abc', 'success']);
    expect(seen[1].percent).toBe(25);
    expect(progressHandler).toBeNull();
  });

  it("passes Ollama's error on", async () => {
    mockInvoke.mockRejectedValue('pull model manifest: file does not exist');
    await expect(pullOllamaModel({ endpoint: 'http://127.0.0.1:11434', model: 'nope:1b' })).rejects.toBe('pull model manifest: file does not exist');
    expect(progressHandler).toBeNull();
  });
});
