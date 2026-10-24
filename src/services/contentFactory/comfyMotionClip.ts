// Miya content factory phase 4c: motion transfer on this computer.
// Wan 2.1 VACE 1.3B (pinned in comfyui_video_models.rs) follows the motion clip's edges
// (ComfyUI's own Canny node) with the scene picture as its reference. The graph follows
// ComfyUI's official "Wan VACE control video" template, on ComfyUI's own nodes.
import { invoke } from '@tauri-apps/api/core';
import { comfyRequest, getComfyUiEndpoint } from '../connectors/connectorImageGenerators';
import { freeOllamaGpuMemory } from '../../lib/ollama';
import { getLocalMotionModel } from '../videoModelService';
import { saveIfDone, type ClipResult } from './comfyVideoClip';

export const MOTION_CARD_TOO_SMALL = "This graphics card can't run local motion transfer; Higgsfield can.";
export const MOTION_MODEL_MISSING = 'Install local motion transfer in Runtime Hub (ComfyUI card) to copy a motion on this computer.';

const FPS = 16;
const MAX_FRAMES = 81; // 5 seconds
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const CACHE_MS = 60 * 1000;
const NEGATIVE = 'blurry, low quality, distorted face, extra limbs, watermark, text';
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

let cached: { atMs: number; answer: { ok: boolean; reason?: string } } | null = null;

export function resetMotionCacheForTests(): void {
  cached = null;
}

/** Whether this computer can copy a motion: the model installed and a card with enough memory. */
export async function localMotionAvailable(): Promise<{ ok: boolean; reason?: string }> {
  if (cached && Date.now() - cached.atMs < CACHE_MS) return cached.answer;
  const model = await getLocalMotionModel().catch(() => null);
  let answer: { ok: boolean; reason?: string };
  if (!model) answer = { ok: false, reason: MOTION_MODEL_MISSING };
  else if (model.vramGb === null || model.vramGb < model.minVramGb) answer = { ok: false, reason: MOTION_CARD_TOO_SMALL };
  else if (!model.installed) answer = { ok: false, reason: MOTION_MODEL_MISSING };
  else answer = { ok: true };
  cached = { atMs: Date.now(), answer };
  return answer;
}

/** 4n+1 frames at 16 fps, at least 17, at most 5 seconds. */
export function motionFrames(seconds: number): number {
  const n = Math.max(4, Math.ceil((Math.max(0, seconds) * FPS) / 4));
  return Math.min(MAX_FRAMES, n * 4 + 1);
}

type Node = { class_type: string; inputs: Record<string, unknown> };

export function buildMotionWorkflow(input: { image: string; video: string; prompt: string; seconds: number; vertical: boolean; seed: number }): Record<string, Node> {
  const [width, height] = input.vertical ? [480, 832] : [832, 480];
  return {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: 'wan2.1_vace_1.3B_fp16.safetensors', weight_dtype: 'default' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', type: 'wan', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: 'wan_2.1_vae.safetensors' } },
    '4': { class_type: 'CLIPTextEncode', inputs: { text: input.prompt, clip: ['2', 0] } },
    '5': { class_type: 'CLIPTextEncode', inputs: { text: NEGATIVE, clip: ['2', 0] } },
    '6': { class_type: 'LoadImage', inputs: { image: input.image } },
    '7': { class_type: 'LoadVideo', inputs: { file: input.video } },
    '8': { class_type: 'GetVideoComponents', inputs: { video: ['7', 0] } },
    '9': { class_type: 'ImageScale', inputs: { image: ['8', 0], upscale_method: 'lanczos', width, height, crop: 'center' } },
    '10': { class_type: 'Canny', inputs: { image: ['9', 0], low_threshold: 0.4, high_threshold: 0.8 } },
    '11': {
      class_type: 'WanVaceToVideo',
      inputs: {
        positive: ['4', 0], negative: ['5', 0], vae: ['3', 0], width, height, length: motionFrames(input.seconds),
        batch_size: 1, strength: 1, control_video: ['10', 0], reference_image: ['6', 0],
      },
    },
    '12': { class_type: 'ModelSamplingSD3', inputs: { model: ['1', 0], shift: 8 } },
    '13': {
      class_type: 'KSampler',
      inputs: {
        model: ['12', 0], positive: ['11', 0], negative: ['11', 1], latent_image: ['11', 2], seed: input.seed,
        steps: 20, cfg: 6, sampler_name: 'uni_pc', scheduler: 'simple', denoise: 1,
      },
    },
    '14': { class_type: 'TrimVideoLatent', inputs: { samples: ['13', 0], trim_amount: ['11', 3] } },
    '15': { class_type: 'VAEDecode', inputs: { samples: ['14', 0], vae: ['3', 0] } },
    '16': { class_type: 'CreateVideo', inputs: { images: ['15', 0], fps: FPS } },
    '17': { class_type: 'SaveVideo', inputs: { video: ['16', 0], filename_prefix: 'alphonso/motion', format: 'mp4', codec: 'h264' } },
  };
}

/** A motion clip made on this computer; a job still running after the wait is kept with its id. */
export async function makeComfyMotionClip(input: {
  root: string; imageRel: string; motionRel: string; outRel: string; prompt: string; seconds: number; vertical: boolean;
  timeoutMs?: number; intervalMs?: number;
}): Promise<ClipResult> {
  const endpoint = getComfyUiEndpoint();
  try {
    await freeOllamaGpuMemory().catch(() => undefined);
    const image = await invoke<{ name: string }>('comfyui_upload_image', { request: { endpoint, workspaceRoot: input.root, relPath: input.imageRel } });
    const video = await invoke<{ name: string }>('comfyui_upload_image', { request: { endpoint, workspaceRoot: input.root, relPath: input.motionRel } });
    const workflow = buildMotionWorkflow({
      image: image.name, video: video.name, prompt: input.prompt, seconds: input.seconds, vertical: input.vertical,
      seed: Math.floor(Math.random() * 2 ** 31),
    });
    const queued = await comfyRequest(endpoint, '/prompt', { method: 'POST', body: JSON.stringify({ prompt: workflow }) });
    const body = await queued.json().catch(() => ({}));
    if (!queued.ok || !body?.prompt_id) {
      const why = body?.error?.message || (body?.node_errors ? JSON.stringify(body.node_errors) : `HTTP ${queued.status}`);
      return { status: 'failed', error: `ComfyUI refused the motion workflow: ${String(why)}` };
    }
    const jobId = String(body.prompt_id);
    const deadline = Date.now() + (input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    while (Date.now() < deadline) {
      const done = await saveIfDone(endpoint, jobId, input.outRel, input.root);
      if (done) return done;
      await new Promise((resolve) => setTimeout(resolve, input.intervalMs ?? 3000));
    }
    return { status: 'pending', jobId };
  } catch (error) {
    return { status: 'failed', error: message(error) };
  }
}
