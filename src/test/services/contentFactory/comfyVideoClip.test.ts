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
import { freeOllamaGpuMemory } from '../../../lib/ollama';
import { comfyRequest } from '../../../services/connectors/connectorImageGenerators';
import { buildVideoWorkflow, checkComfyClip, framesFor, makeComfyClip } from '../../../services/contentFactory/comfyVideoClip';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const nodesOf = (graph: Record<string, any>, type: string) => Object.values(graph).filter((n: any) => n.class_type === type) as any[];

beforeEach(() => {
  for (const k of Object.keys(backend)) delete backend[k];
  vi.clearAllMocks();
});

// Miya content factory phase 2b: a local AI clip through the user's ComfyUI.
describe('framesFor', () => {
  it("keeps to each model's frame rule and its longest clip", () => {
    expect(framesFor('ltx_video_2b', 4)).toBe(97); // 8n+1 at 24 fps
    expect(framesFor('ltx_video_2b', 9)).toBe(121); // at most 5 s
    expect(framesFor('wan22_ti2v_5b', 3)).toBe(73); // 4n+1
    expect(framesFor('wan22_ti2v_5b', 20)).toBe(121);
    expect(framesFor('wan22_ti2v_5b', 0.1)).toBeGreaterThanOrEqual(9);
  });
});

describe('buildVideoWorkflow', () => {
  it("LTX-Video: the official image-to-video graph with the pinned files, distilled settings and the uploaded picture", () => {
    const g = buildVideoWorkflow('ltx_video_2b', { image: 'alphonso-v1-s1.png', prompt: 'A barista pours coffee, slow push in', seconds: 4, vertical: false, seed: 7 });
    expect(nodesOf(g, 'CheckpointLoaderSimple')[0].inputs.ckpt_name).toBe('ltxv-2b-0.9.8-distilled-fp8.safetensors');
    expect(nodesOf(g, 'CLIPLoader')[0].inputs).toMatchObject({ clip_name: 't5xxl_fp8_e4m3fn.safetensors', type: 'ltxv' });
    expect(nodesOf(g, 'LoadImage')[0].inputs.image).toBe('alphonso-v1-s1.png');
    expect(nodesOf(g, 'LTXVImgToVideo')[0].inputs).toMatchObject({ width: 768, height: 512, length: 97 });
    expect(nodesOf(g, 'SamplerCustom')[0].inputs).toMatchObject({ cfg: 1, noise_seed: 7 });
    expect(nodesOf(g, 'LTXVScheduler')[0].inputs.steps).toBe(8);
    expect(nodesOf(g, 'CreateVideo')[0].inputs.fps).toBe(24);
    expect(nodesOf(g, 'SaveVideo')).toHaveLength(1);
    expect(JSON.stringify(g)).toContain('A barista pours coffee, slow push in');
  });

  it('Wan 2.2 5B: its graph, portrait when the outputs are vertical', () => {
    const g = buildVideoWorkflow('wan22_ti2v_5b', { image: 'p.png', prompt: 'x', seconds: 5, vertical: true, seed: 1 });
    expect(nodesOf(g, 'UNETLoader')[0].inputs.unet_name).toBe('wan2.2_ti2v_5B_fp16.safetensors');
    expect(nodesOf(g, 'VAELoader')[0].inputs.vae_name).toBe('wan2.2_vae.safetensors');
    expect(nodesOf(g, 'CLIPLoader')[0].inputs).toMatchObject({ clip_name: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', type: 'wan' });
    expect(nodesOf(g, 'Wan22ImageToVideoLatent')[0].inputs).toMatchObject({ width: 704, height: 1280, length: 121 });
    expect(nodesOf(g, 'KSampler')[0].inputs).toMatchObject({ steps: 20, cfg: 5, sampler_name: 'uni_pc', scheduler: 'simple' });
    expect(nodesOf(g, 'ModelSamplingSD3')[0].inputs.shift).toBe(8);
  });

  it('every link points at a node in the graph', () => {
    for (const id of ['ltx_video_2b', 'wan22_ti2v_5b']) {
      const g = buildVideoWorkflow(id, { image: 'p.png', prompt: 'x', seconds: 3, vertical: false, seed: 1 });
      for (const node of Object.values(g) as any[]) {
        for (const value of Object.values(node.inputs)) {
          if (Array.isArray(value)) expect(g[String(value[0])]).toBeTruthy();
        }
      }
    }
  });

  it('refuses an unknown model', () => {
    expect(() => buildVideoWorkflow('nope', { image: 'p.png', prompt: 'x', seconds: 3, vertical: false, seed: 1 })).toThrow(/Unknown video model/);
  });
});

describe('makeComfyClip', () => {
  const input = { root: 'D:\\Content', imageRel: 'b/p/scenes/v1-s1.png', outRel: 'b/p/clips/v1-s1.mp4', prompt: 'A barista', seconds: 4, vertical: false, modelId: 'ltx_video_2b', timeoutMs: 50, intervalMs: 1 };

  it('frees the graphics card, uploads the picture, queues the graph and saves the video', async () => {
    backend.comfyui_upload_image = () => ({ name: 'alphonso-v1-s1.png' });
    backend.comfyui_save_output = () => ({ path: 'D:\\Content\\b\\p\\clips\\v1-s1.mp4', bytes: 10 });
    vi.mocked(comfyRequest)
      .mockResolvedValueOnce(ok({ prompt_id: 'job-1' }) as any)
      .mockResolvedValueOnce(ok({ 'job-1': { outputs: { 9: { images: [{ filename: 'clip_00001_.mp4', subfolder: 'video', type: 'output' }], animated: [true] } } } }) as any);
    const result = await makeComfyClip(input);
    expect(freeOllamaGpuMemory).toHaveBeenCalled();
    expect(vi.mocked(freeOllamaGpuMemory).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(comfyRequest).mock.invocationCallOrder[0]);
    expect(invoke).toHaveBeenCalledWith('comfyui_upload_image', { request: { endpoint: 'http://127.0.0.1:8188', workspaceRoot: 'D:\\Content', relPath: 'b/p/scenes/v1-s1.png' } });
    const queued = JSON.parse(vi.mocked(comfyRequest).mock.calls[0][2]!.body as string);
    expect(nodesOf(queued.prompt, 'LoadImage')[0].inputs.image).toBe('alphonso-v1-s1.png');
    expect(invoke).toHaveBeenCalledWith('comfyui_save_output', { request: {
      endpoint: 'http://127.0.0.1:8188', filename: 'clip_00001_.mp4', subfolder: 'video', kind: 'output', workspaceRoot: 'D:\\Content', relPath: 'b/p/clips/v1-s1.mp4',
    } });
    expect(result).toEqual({ status: 'done', path: 'b/p/clips/v1-s1.mp4' });
  });

  it('keeps the job when ComfyUI is still working, and picks it up later', async () => {
    backend.comfyui_upload_image = () => ({ name: 'a.png' });
    vi.mocked(comfyRequest).mockResolvedValueOnce(ok({ prompt_id: 'job-2' }) as any).mockResolvedValue(ok({}) as any);
    expect(await makeComfyClip(input)).toEqual({ status: 'pending', jobId: 'job-2' });
    backend.comfyui_save_output = () => ({ path: 'x', bytes: 1 });
    vi.mocked(comfyRequest).mockResolvedValueOnce(ok({ 'job-2': { outputs: { 9: { images: [{ filename: 'c.mp4', subfolder: '', type: 'output' }] } } } }) as any);
    expect(await checkComfyClip('job-2', 'b/p/clips/v1-s1.mp4', 'D:\\Content')).toEqual({ status: 'done', path: 'b/p/clips/v1-s1.mp4' });
  });

  it("says why when ComfyUI refuses the graph", async () => {
    backend.comfyui_upload_image = () => ({ name: 'a.png' });
    vi.mocked(comfyRequest).mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: { message: 'Value not in list: ckpt_name' } }) } as any);
    const result = await makeComfyClip(input);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Value not in list: ckpt_name');
  });

  it('says why when ComfyUI is not running', async () => {
    backend.comfyui_upload_image = () => { throw new Error('ComfyUI is not reachable at http://127.0.0.1:8188'); };
    const result = await makeComfyClip(input);
    expect(result).toMatchObject({ status: 'failed' });
    expect(result.error).toContain('not reachable');
  });
});
