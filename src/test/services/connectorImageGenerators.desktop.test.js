import { describe, it, expect, beforeEach, vi } from 'vitest';

// Desktop path: in the Tauri app, ComfyUI must be reached through the
// `comfyui_request` backend command, never with `fetch` from the window
// (ComfyUI answers a foreign Origin header with 403).
const mockInvoke = vi.fn();

vi.mock('../../lib/ollama', () => ({
  freeOllamaGpuMemory: vi.fn(async () => ({ unloaded: [], error: null })),
  getConfiguredOllamaEndpoint: vi.fn(() => 'http://localhost:11434')
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => mockInvoke(...args),
  isTauri: () => true,
}));

vi.mock('../../services/connectors/connectorRegistry.js', () => ({
  getConnectorCircuitState: () => ({ ok: true }),
  gateConnectorAction: () => ({ ok: true, verificationState: 'verified' }),
  appendConnectorAudit: vi.fn(),
  recordConnectorFailure: vi.fn(),
  recordConnectorSuccess: vi.fn(),
}));

const ENDPOINT = 'http://127.0.0.1:8188';

describe('connectorImageGenerators in the desktop app', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(() => {
      throw new Error('fetch must not be used for ComfyUI in the desktop app');
    });
    mockInvoke.mockImplementation(async (command, args) => {
      if (command !== 'comfyui_request') throw new Error(`unexpected command ${command}`);
      if (args.path === '/object_info/CheckpointLoaderSimple') {
        return {
          status: 200,
          body: JSON.stringify({
            CheckpointLoaderSimple: { input: { required: { ckpt_name: [['DreamShaper_8_pruned.safetensors']] } } },
          }),
          bodyBase64: null,
        };
      }
      if (args.path === '/prompt') return { status: 200, body: JSON.stringify({ prompt_id: 'job-1' }), bodyBase64: null };
      if (args.path === '/history/job-1') {
        return {
          status: 200,
          body: JSON.stringify({ 'job-1': { outputs: { 9: { images: [{ filename: 'out.png', type: 'output', subfolder: '' }] } } } }),
          bodyBase64: null,
        };
      }
      if (args.path.startsWith('/view?')) return { status: 200, body: '', bodyBase64: 'aW1hZ2U=' };
      return { status: 404, body: '{}', bodyBase64: null };
    });
  });

  it('generates an image entirely through the backend command', async () => {
    const { generateComfyUiImage } = await import('../../services/connectors/connectorImageGenerators');
    const result = await generateComfyUiImage({ prompt: 'sunset over a bay' });

    expect(result.ok).toBe(true);
    expect(result.checkpoint).toBe('DreamShaper_8_pruned.safetensors');
    expect(result.outputPaths).toEqual(['out.png']);
    expect(result.previewBase64).toBe('aW1hZ2U=');
    expect(global.fetch).not.toHaveBeenCalled();

    const calls = mockInvoke.mock.calls.map(([, args]) => `${args.method} ${args.path}`);
    expect(calls).toEqual([
      'GET /object_info/CheckpointLoaderSimple',
      'POST /prompt',
      'GET /history/job-1',
      'GET /view?filename=out.png&type=output',
    ]);
    for (const [, args] of mockInvoke.mock.calls) expect(args.endpoint).toBe(ENDPOINT);
    const queued = mockInvoke.mock.calls.find(([, args]) => args.path === '/prompt')[1];
    expect(JSON.parse(queued.body).prompt).toBeTruthy();
  });

  it('frees Ollama GPU memory before queueing the image', async () => {
    // Owner decision 2026-10-21 (QA Bug 23): a loaded chat model left
    // ComfyUI so little GPU memory that the first image took 445 s.
    const { freeOllamaGpuMemory } = await import('../../lib/ollama');
    freeOllamaGpuMemory.mockClear();
    const { generateComfyUiImage } = await import('../../services/connectors/connectorImageGenerators');
    await generateComfyUiImage({ prompt: 'sunset over a bay' });
    expect(freeOllamaGpuMemory).toHaveBeenCalledTimes(1);
    const promptCall = mockInvoke.mock.calls.findIndex(([, args]) => args.path === '/prompt');
    expect(freeOllamaGpuMemory.mock.invocationCallOrder[0]).toBeLessThan(mockInvoke.mock.invocationCallOrder[promptCall]);
  });

  it('reports a ComfyUI refusal instead of succeeding', async () => {
    mockInvoke.mockImplementation(async (command, args) =>
      args.path === '/prompt'
        ? { status: 403, body: '', bodyBase64: null }
        : { status: 200, body: JSON.stringify({}), bodyBase64: null }
    );
    const { generateComfyUiImage } = await import('../../services/connectors/connectorImageGenerators');
    const result = await generateComfyUiImage({ prompt: 'sunset over a bay' });
    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain('HTTP 403');
  });
});
