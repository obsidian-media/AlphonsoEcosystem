// Resource manager Task 5: making room. Models unload, your ComfyUI drops its
// models, tools Alphonso started stop. Nothing you started is ever stopped.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const freeOllamaGpuMemory = vi.fn();
vi.mock('../../../lib/ollama', () => ({
  freeOllamaGpuMemory: (...a: unknown[]) => freeOllamaGpuMemory(...a),
  getConfiguredOllamaEndpoint: () => 'http://127.0.0.1:11434',
}));
const comfyRequest = vi.fn();
vi.mock('../../../services/connectors/connectorImageGenerators', () => ({
  comfyRequest: (...a: unknown[]) => comfyRequest(...a),
  getComfyUiEndpoint: () => 'http://127.0.0.1:8188',
}));
const stopTool = vi.fn();
vi.mock('../../../services/runtimeManagerService', () => ({ stopTool: (...a: unknown[]) => stopTool(...a) }));
const stopHermesTool = vi.fn(async (_name: string) => ({ ok: true }));
vi.mock('../../../services/hermes/hermesTools', () => ({
  isHermesTool: (name: string) => name.startsWith('hermes:'),
  stopHermesTool: (name: string) => stopHermesTool(name),
}));

import { freeThings } from '../../../services/resources/freeMemory';
import type { LoadedThing } from '../../../services/resources/resourceState';

function thing(over: Partial<LoadedThing>): LoadedThing {
  return { kind: 'tool', name: 'x', label: 'X', memMb: 1000, startedBy: 'alphonso', lastUsedAtMs: null, inUse: false, ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  freeOllamaGpuMemory.mockImplementation(async (_e: string, models: string[]) => ({ unloaded: models, error: null }));
  comfyRequest.mockResolvedValue({ ok: true, status: 200 });
  stopTool.mockResolvedValue({ tool: 'x', ok: true, message: 'stopped' });
});

describe('freeThings', () => {
  it('asks a ComfyUI you started to drop its models, never stops it', async () => {
    const result = await freeThings([thing({ name: 'comfyui', label: 'ComfyUI', startedBy: 'you', memMb: null })]);
    expect(comfyRequest).toHaveBeenCalledWith('http://127.0.0.1:8188', '/free', {
      method: 'POST',
      body: JSON.stringify({ unload_models: true, free_memory: true }),
    });
    expect(stopTool).not.toHaveBeenCalled();
    expect(result).toEqual({ freed: ['ComfyUI'], failed: [] });
  });

  it('stops an idle Hermes profile Alphonso started, never one in use (Hermes gateway)', async () => {
    const hector = thing({ name: 'hermes:hector', label: "Hector's Hermes profile" });
    expect((await freeThings([{ ...hector, inUse: true }])).freed).toEqual([]);
    expect(stopHermesTool).not.toHaveBeenCalled();
    expect((await freeThings([hector])).freed).toEqual(["Hector's Hermes profile"]);
    expect(stopHermesTool).toHaveBeenCalledWith('hermes:hector');
    expect(stopTool).not.toHaveBeenCalled();
  });

  it('stops a ComfyUI Alphonso started', async () => {
    const result = await freeThings([thing({ name: 'comfyui', label: 'ComfyUI' })]);
    expect(stopTool).toHaveBeenCalledWith('comfyui');
    expect(comfyRequest).not.toHaveBeenCalled();
    expect(result.freed).toEqual(['ComfyUI']);
  });

  it('unloads models by name, in one call', async () => {
    const result = await freeThings([
      thing({ kind: 'model', name: 'qwen', label: 'qwen', startedBy: 'you' }),
      thing({ kind: 'model', name: 'llama', label: 'llama' }),
    ]);
    expect(freeOllamaGpuMemory).toHaveBeenCalledTimes(1);
    expect(freeOllamaGpuMemory).toHaveBeenCalledWith('http://127.0.0.1:11434', ['qwen', 'llama']);
    expect(result).toEqual({ freed: ['qwen', 'llama'], failed: [] });
  });

  it('never stops a tool you started, the Ollama program, or anything in use', async () => {
    const result = await freeThings([
      thing({ name: 'n8n', label: 'n8n', startedBy: 'you' }),
      thing({ name: 'ollama', label: 'Ollama' }),
      thing({ name: 'audiocraft', label: 'AudioCraft', inUse: true }),
    ]);
    expect(stopTool).not.toHaveBeenCalled();
    expect(comfyRequest).not.toHaveBeenCalled();
    expect(result).toEqual({ freed: [], failed: [] });
  });

  it('one failure is listed and the rest still run', async () => {
    stopTool.mockRejectedValueOnce(new Error('gone'));
    freeOllamaGpuMemory.mockResolvedValueOnce({ unloaded: [], error: 'qwen: HTTP 500' });
    comfyRequest.mockResolvedValueOnce({ ok: false, status: 500 });
    const result = await freeThings([
      thing({ name: 'audiocraft', label: 'AudioCraft' }),
      thing({ name: 'kokoro', label: 'Kokoro' }),
      thing({ kind: 'model', name: 'qwen', label: 'qwen' }),
      thing({ name: 'comfyui', label: 'ComfyUI', startedBy: 'you', memMb: null }),
    ]);
    expect(stopTool).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ freed: ['Kokoro'], failed: ['AudioCraft', 'qwen', 'ComfyUI'] });
  });

  it('a stop the backend refuses counts as failed', async () => {
    stopTool.mockResolvedValueOnce({ tool: 'kokoro', ok: false, message: 'not running' });
    expect(await freeThings([thing({ name: 'kokoro', label: 'Kokoro' })])).toEqual({ freed: [], failed: ['Kokoro'] });
  });
});
