// Phase 4c: keeping a character free with ComfyUI, from its reference pictures (SD 2.1 unCLIP).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const backend: Record<string, (args: any) => unknown> = {};
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    if (!backend[cmd]) throw new Error(`unexpected command ${cmd}`);
    return backend[cmd](args);
  }),
}));
const comfyRequest = vi.fn();
const pollComfyUiHistory = vi.fn();
vi.mock('../../../services/connectors/connectorImageGenerators', () => ({
  comfyRequest: (...a: unknown[]) => comfyRequest(...a),
  pollComfyUiHistory: (...a: unknown[]) => pollComfyUiHistory(...a),
  getComfyUiEndpoint: () => 'http://127.0.0.1:8188',
}));
vi.mock('../../../lib/ollama', () => ({ freeOllamaGpuMemory: vi.fn(async () => ({ ok: true })) }));

import { invoke } from '@tauri-apps/api/core';
import {
  buildCharacterWorkflow, characterReferenceAvailable, makeCharacterPicture, resetReferenceCacheForTests, REFERENCE_CHECKPOINT,
} from '../../../services/contentFactory/comfyCharacter';

const character = { id: 'c1', name: 'Ana', kind: 'made_up', description: 'a teacher', pictures: ['b/characters/c1/p1.png', 'b/characters/c1/p2.png', 'b/characters/c1/p3.png', 'b/characters/c1/p4.png', 'b/characters/c1/p5.png'] } as any;

beforeEach(() => {
  for (const k of Object.keys(backend)) delete backend[k];
  vi.clearAllMocks();
  resetReferenceCacheForTests();
});

describe('the ComfyUI character path', () => {
  it('uses ComfyUI\u2019s own unCLIP nodes, with every reference chained', () => {
    const g = buildCharacterWorkflow({ prompt: 'a classroom', negative: 'blurry', width: 832, height: 480, references: ['r1.png', 'r2.png'], seed: 7 }) as Record<string, { class_type: string; inputs: any }>;
    const of = (type: string) => Object.values(g).filter((n) => n.class_type === type);
    expect(of('unCLIPCheckpointLoader')[0].inputs.ckpt_name).toBe(REFERENCE_CHECKPOINT);
    expect(REFERENCE_CHECKPOINT).toBe('sd21-unclip-l.ckpt');
    expect(of('LoadImage').map((n) => n.inputs.image)).toEqual(['r1.png', 'r2.png']);
    expect(of('CLIPVisionEncode')).toHaveLength(2);
    expect(of('unCLIPConditioning')).toHaveLength(2);
    expect(of('EmptyLatentImage')[0].inputs).toMatchObject({ width: 832, height: 480, batch_size: 1 });
    expect(of('KSampler')[0].inputs.seed).toBe(7);
    expect(of('SaveImage')).toHaveLength(1);
  });

  it('is available only when the model is installed in the user\u2019s ComfyUI', async () => {
    backend.comfyui_reference_model = () => ({ installed: false });
    expect(await characterReferenceAvailable()).toBe(false);
    resetReferenceCacheForTests();
    backend.comfyui_reference_model = () => ({ installed: true });
    expect(await characterReferenceAvailable()).toBe(true);
  });

  it('uploads at most 3 of the character\u2019s pictures and waits for the picture', async () => {
    backend.comfyui_upload_image = (a) => ({ name: a.request.relPath.split('/').pop() });
    comfyRequest.mockResolvedValue({ ok: true, json: async () => ({ prompt_id: 'pid-1' }) });
    pollComfyUiHistory.mockResolvedValue({ ok: true, previewBase64: 'CHAR' });
    const result = await makeCharacterPicture({ root: 'D:\\Content', prompt: 'a classroom', negativePrompt: '', width: 832, height: 480, character });
    expect(result).toMatchObject({ ok: true, previewBase64: 'CHAR' });
    const uploads = vi.mocked(invoke).mock.calls.filter((c) => c[0] === 'comfyui_upload_image');
    expect(uploads).toHaveLength(3);
    const graph = JSON.parse(comfyRequest.mock.calls[0][2].body).prompt;
    expect(Object.values(graph).filter((n: any) => n.class_type === 'LoadImage').map((n: any) => n.inputs.image)).toEqual(['p1.png', 'p2.png', 'p3.png']);
    expect(pollComfyUiHistory).toHaveBeenCalledWith('pid-1');
  });

  it('a refused workflow says why', async () => {
    backend.comfyui_upload_image = () => ({ name: 'x.png' });
    comfyRequest.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { message: 'unknown node' } }) });
    const result = await makeCharacterPicture({ root: 'D:\\Content', prompt: 'x', negativePrompt: '', width: 512, height: 512, character });
    expect(result).toEqual({ ok: false, error: 'ComfyUI refused the character workflow: unknown node' });
  });
});
