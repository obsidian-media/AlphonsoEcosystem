// Resource manager Task 2: one reading of RAM, graphics memory and what is loaded.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const backend: Record<string, (args: any) => unknown> = {};
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    if (!backend[cmd]) throw new Error(`unexpected command ${cmd}`);
    return backend[cmd](args);
  }),
}));
const comfyRequest = vi.fn();
vi.mock('../../../services/connectors/connectorImageGenerators', () => ({
  comfyRequest: (...a: unknown[]) => comfyRequest(...a),
  getComfyUiEndpoint: () => 'http://127.0.0.1:8188',
}));
vi.mock('../../../lib/ollama', () => ({ getConfiguredOllamaEndpoint: () => 'http://127.0.0.1:11434' }));

import { invoke } from '@tauri-apps/api/core';
import { readResources, GPU_UNKNOWN } from '../../../services/resources/resourceState';

const GB = 1024 ** 3;

function snapshot(over: Record<string, unknown> = {}) {
  return { ramTotalMb: 16384, ramFreeMb: 8000, gpu: null, processes: [], ...over };
}
function tool(name: string, running = true, displayName = name) {
  return { name, displayName, running, installed: true };
}
function comfyStats(device: Record<string, unknown>) {
  comfyRequest.mockResolvedValue({ ok: true, status: 200, json: async () => ({ devices: [device] }) });
}

beforeEach(() => {
  for (const k of Object.keys(backend)) delete backend[k];
  vi.clearAllMocks();
  comfyRequest.mockRejectedValue(new Error('not running'));
  backend.resource_snapshot = () => snapshot();
  backend.runtime_get_all_status = () => [];
  backend.ollama_loaded_models = () => [];
});

describe('readResources', () => {
  it('uses the NVIDIA reading first', async () => {
    backend.resource_snapshot = () => snapshot({ gpu: { totalMb: 8192, freeMb: 6000, source: 'nvidia' } });
    comfyStats({ type: 'cuda', vram_total: 4 * GB, vram_free: 1 * GB });
    const state = await readResources();
    expect(state).toMatchObject({ ramTotalMb: 16384, ramFreeMb: 8000, gpuTotalMb: 8192, gpuFreeMb: 6000, gpuSource: 'nvidia' });
  });

  it('asks ComfyUI when there is no NVIDIA reading', async () => {
    comfyStats({ type: 'cuda', vram_total: 4 * GB, vram_free: 1 * GB });
    const state = await readResources();
    expect(state).toMatchObject({ gpuTotalMb: 4096, gpuFreeMb: 1024, gpuSource: 'comfyui' });
    expect(comfyRequest).toHaveBeenCalledWith('http://127.0.0.1:8188', '/system_stats');
  });

  it('says graphics memory is unknown when nothing answers', async () => {
    const state = await readResources();
    expect(state).toMatchObject({ gpuTotalMb: null, gpuFreeMb: null, gpuSource: 'unknown' });
    expect(GPU_UNKNOWN).toBe('Graphics memory unknown on this computer.');
  });

  it('treats Apple Silicon shared memory as RAM, not graphics memory', async () => {
    comfyStats({ type: 'mps', vram_total: 16 * GB, vram_free: 8 * GB });
    const state = await readResources();
    expect(state.gpuSource).toBe('unknown');
    expect(state.gpuTotalMb).toBeNull();
  });

  it('marks a running tool not in the snapshot as started by you', async () => {
    backend.runtime_get_all_status = () => [tool('comfyui', true, 'ComfyUI'), tool('n8n', false)];
    const state = await readResources();
    expect(state.loaded).toEqual([
      { kind: 'tool', name: 'comfyui', label: 'ComfyUI', memMb: null, startedBy: 'you', lastUsedAtMs: null, inUse: false },
    ]);
  });

  it('gives a tool Alphonso started its measured memory', async () => {
    backend.runtime_get_all_status = () => [tool('ollama', true, 'Ollama')];
    backend.resource_snapshot = () => snapshot({ processes: [{ tool: 'ollama', pid: 7, memMb: 3200 }] });
    const [ollama] = (await readResources()).loaded;
    expect(ollama).toMatchObject({ kind: 'tool', name: 'ollama', memMb: 3200, startedBy: 'alphonso' });
  });

  it('lists each loaded Ollama model with its graphics memory, else its size', async () => {
    backend.runtime_get_all_status = () => [tool('ollama', true, 'Ollama')];
    backend.ollama_loaded_models = () => [
      { name: 'llama3.2:3b', sizeMb: 3072, vramMb: 2048 },
      { name: 'all-minilm', sizeMb: 45, vramMb: 0 },
    ];
    const models = (await readResources()).loaded.filter((t) => t.kind === 'model');
    expect(models).toEqual([
      { kind: 'model', name: 'llama3.2:3b', label: 'llama3.2:3b', memMb: 2048, startedBy: 'you', lastUsedAtMs: null, inUse: false },
      { kind: 'model', name: 'all-minilm', label: 'all-minilm', memMb: 45, startedBy: 'you', lastUsedAtMs: null, inUse: false },
    ]);
    expect(invoke).toHaveBeenCalledWith('ollama_loaded_models', { endpoint: 'http://127.0.0.1:11434' });
  });

  it('takes last use and in-use from the usage record (models as model:<name>)', async () => {
    backend.runtime_get_all_status = () => [tool('comfyui')];
    backend.ollama_loaded_models = () => [{ name: 'qwen', sizeMb: 100, vramMb: 0 }];
    const usage = { lastUsedAt: (k: string) => (k === 'comfyui' ? 1000 : null), isInUse: (k: string) => k === 'model:qwen' };
    const state = await readResources(usage);
    expect(state.loaded.find((t) => t.name === 'comfyui')).toMatchObject({ lastUsedAtMs: 1000, inUse: false });
    expect(state.loaded.find((t) => t.name === 'qwen')).toMatchObject({ lastUsedAtMs: null, inUse: true });
  });

  it('never throws when the backend is missing', async () => {
    for (const k of Object.keys(backend)) delete backend[k];
    const state = await readResources();
    expect(state).toMatchObject({ ramTotalMb: 0, ramFreeMb: 0, gpuSource: 'unknown', loaded: [] });
  });
});
