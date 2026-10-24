// Phase 4c: motion transfer on this computer — Wan 2.1 VACE 1.3B through the user's ComfyUI.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const backend: Record<string, (args: any) => unknown> = {};
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    if (!backend[cmd]) throw new Error(`unexpected command ${cmd}`);
    return backend[cmd](args);
  }),
}));
vi.mock('../../../lib/ollama', () => ({ freeOllamaGpuMemory: vi.fn(async () => ({ ok: true })) }));
vi.mock('../../../services/connectors/connectorImageGenerators', () => ({
  comfyRequest: vi.fn(),
  getComfyUiEndpoint: () => 'http://127.0.0.1:8188',
}));

import { invoke } from '@tauri-apps/api/core';
import { comfyRequest } from '../../../services/connectors/connectorImageGenerators';
import {
  buildMotionWorkflow, localMotionAvailable, makeComfyMotionClip, resetMotionCacheForTests,
  MOTION_CARD_TOO_SMALL, MOTION_MODEL_MISSING,
} from '../../../services/contentFactory/comfyMotionClip';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const nodesOf = (graph: Record<string, any>, type: string) => Object.values(graph).filter((n: any) => n.class_type === type) as any[];
const info = (over: Record<string, unknown>) => ({ id: 'wan21_vace_1_3b', name: 'Motion', minVramGb: 8, license: 'Apache-2.0', sizeBytes: 1, installed: true, vramGb: 12, comfyuiDir: 'C:/C', ...over });

beforeEach(() => {
  for (const k of Object.keys(backend)) delete backend[k];
  vi.clearAllMocks();
  resetMotionCacheForTests();
});

describe('localMotionAvailable', () => {
  it("says a card under the model's memory can't run it, and Higgsfield can", async () => {
    backend.comfyui_motion_model = () => info({ vramGb: 6 });
    expect(await localMotionAvailable()).toEqual({ ok: false, reason: MOTION_CARD_TOO_SMALL });
    expect(MOTION_CARD_TOO_SMALL).toBe("This graphics card can't run local motion transfer; Higgsfield can.");
  });

  it('asks for the model when it is not installed, and is available when it is', async () => {
    backend.comfyui_motion_model = () => info({ installed: false });
    expect(await localMotionAvailable()).toEqual({ ok: false, reason: MOTION_MODEL_MISSING });
    resetMotionCacheForTests();
    backend.comfyui_motion_model = () => info({});
    expect(await localMotionAvailable()).toEqual({ ok: true });
  });

  it('without an NVIDIA card it is not available', async () => {
    backend.comfyui_motion_model = () => info({ vramGb: null });
    expect((await localMotionAvailable()).ok).toBe(false);
  });
});

describe('buildMotionWorkflow', () => {
  it('follows the motion clip with the picture as reference, on the pinned files', () => {
    const g = buildMotionWorkflow({ image: 'alphonso-v1-s1.png', video: 'alphonso-s1-v1.mp4', prompt: 'A wave', seconds: 3, vertical: true, seed: 1 });
    expect(nodesOf(g, 'UNETLoader')[0].inputs.unet_name).toBe('wan2.1_vace_1.3B_fp16.safetensors');
    expect(nodesOf(g, 'VAELoader')[0].inputs.vae_name).toBe('wan_2.1_vae.safetensors');
    expect(nodesOf(g, 'LoadImage')[0].inputs.image).toBe('alphonso-v1-s1.png');
    expect(nodesOf(g, 'LoadVideo')[0].inputs.file).toBe('alphonso-s1-v1.mp4');
    const vace = nodesOf(g, 'WanVaceToVideo')[0].inputs;
    expect([vace.width, vace.height, vace.length]).toEqual([480, 832, 49]);
    expect(vace.control_video).toBeTruthy();
    expect(vace.reference_image).toBeTruthy();
    expect(nodesOf(g, 'SaveVideo')).toHaveLength(1);
  });
});

describe('makeComfyMotionClip', () => {
  it('uploads the picture and the motion clip, and keeps a job still running', async () => {
    backend.comfyui_upload_image = (a) => ({ name: `alphonso-${a.request.relPath.split('/').pop()}` });
    vi.mocked(comfyRequest).mockImplementation(async (_e: string, path: string) => (path === '/prompt' ? ok({ prompt_id: 'job-7' }) : ok({})) as any);
    const made = await makeComfyMotionClip({ root: 'D:/C', imageRel: 'b/p/scenes/v1-s1.png', motionRel: 'b/p/motion/s1-v1.mp4', outRel: 'b/p/clips/v1-s1.mp4', prompt: 'x', seconds: 3, vertical: false, timeoutMs: 1, intervalMs: 1 });
    expect(made).toEqual({ status: 'pending', jobId: 'job-7' });
    const uploads = vi.mocked(invoke).mock.calls.filter((c) => c[0] === 'comfyui_upload_image').map((c) => (c[1] as any).request.relPath);
    expect(uploads).toEqual(['b/p/scenes/v1-s1.png', 'b/p/motion/s1-v1.mp4']);
  });
});
