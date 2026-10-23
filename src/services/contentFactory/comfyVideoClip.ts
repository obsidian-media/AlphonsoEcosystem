// A local AI clip for one scene (Miya content factory phase 2b): the scene's
// picture becomes a short video in the user's own ComfyUI. The graphs follow
// ComfyUI's official image-to-video templates for each model
// (comfyui_workflow_templates_media_video: ltxv_image_to_video,
// video_wan2_2_5B_ti2v), with the pinned files from comfyui_video_models.rs.
// Everything goes through the backend (ComfyUI refuses the app window).
import { invoke } from '@tauri-apps/api/core';
import { freeOllamaGpuMemory } from '../../lib/ollama';
import { comfyRequest, getComfyUiEndpoint } from '../connectors/connectorImageGenerators';

interface Spec { fps: number; maxFrames: number; step: number; landscape: [number, number] }

const MODELS: Record<string, Spec> = {
  ltx_video_2b: { fps: 24, maxFrames: 121, step: 8, landscape: [768, 512] },
  wan22_ti2v_5b: { fps: 24, maxFrames: 121, step: 4, landscape: [1280, 704] },
};

const LTX_NEGATIVE = 'low quality, worst quality, deformed, distorted, disfigured, motion smear, motion artifacts, fused fingers, bad anatomy, weird hand, ugly';
const WAN_NEGATIVE = '色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走';

function spec(modelId: string): Spec {
  const found = MODELS[modelId];
  if (!found) throw new Error(`Unknown video model: ${modelId}`);
  return found;
}

/** Frames for a clip of `seconds`: the model's frame rule (n·step + 1), at most its longest clip. */
export function framesFor(modelId: string, seconds: number): number {
  const s = spec(modelId);
  const wanted = Math.round(Math.max(0, seconds) * s.fps);
  // At least 9 frames (LTX-Video's minimum; a shorter clip is no use either).
  const n = Math.max(Math.ceil(8 / s.step), Math.round((wanted - 1) / s.step));
  return Math.min(s.maxFrames, n * s.step + 1);
}

export interface VideoWorkflowInput {
  image: string;
  prompt: string;
  negative?: string;
  seconds: number;
  vertical: boolean;
  seed: number;
}

type Graph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

export function buildVideoWorkflow(modelId: string, input: VideoWorkflowInput): Graph {
  const s = spec(modelId);
  const [w, h] = input.vertical ? [s.landscape[1], s.landscape[0]] : s.landscape;
  const length = framesFor(modelId, input.seconds);
  const save = {
    80: { class_type: 'CreateVideo', inputs: { images: ['8', 0], fps: s.fps } },
    81: { class_type: 'SaveVideo', inputs: { video: ['80', 0], filename_prefix: 'video/alphonso', format: 'auto', codec: 'auto' } },
  };
  if (modelId === 'ltx_video_2b') {
    return {
      44: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'ltxv-2b-0.9.8-distilled-fp8.safetensors' } },
      38: { class_type: 'CLIPLoader', inputs: { clip_name: 't5xxl_fp8_e4m3fn.safetensors', type: 'ltxv', device: 'default' } },
      6: { class_type: 'CLIPTextEncode', inputs: { text: input.prompt, clip: ['38', 0] } },
      7: { class_type: 'CLIPTextEncode', inputs: { text: input.negative || LTX_NEGATIVE, clip: ['38', 0] } },
      78: { class_type: 'LoadImage', inputs: { image: input.image } },
      77: { class_type: 'LTXVImgToVideo', inputs: { positive: ['6', 0], negative: ['7', 0], vae: ['44', 2], image: ['78', 0], width: w, height: h, length, batch_size: 1, strength: 0.15 } },
      69: { class_type: 'LTXVConditioning', inputs: { positive: ['77', 0], negative: ['77', 1], frame_rate: s.fps } },
      // The distilled build runs with guidance 1 and few steps (Lightricks' config for 0.9.8 distilled).
      71: { class_type: 'LTXVScheduler', inputs: { steps: 8, max_shift: 2.05, base_shift: 0.95, stretch: true, terminal: 0.1, latent: ['77', 2] } },
      73: { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
      72: { class_type: 'SamplerCustom', inputs: { model: ['44', 0], add_noise: true, noise_seed: input.seed, cfg: 1, positive: ['69', 0], negative: ['69', 1], sampler: ['73', 0], sigmas: ['71', 0], latent_image: ['77', 2] } },
      8: { class_type: 'VAEDecode', inputs: { samples: ['72', 0], vae: ['44', 2] } },
      ...save,
    };
  }
  return {
    37: { class_type: 'UNETLoader', inputs: { unet_name: 'wan2.2_ti2v_5B_fp16.safetensors', weight_dtype: 'default' } },
    38: { class_type: 'CLIPLoader', inputs: { clip_name: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', type: 'wan', device: 'default' } },
    39: { class_type: 'VAELoader', inputs: { vae_name: 'wan2.2_vae.safetensors' } },
    48: { class_type: 'ModelSamplingSD3', inputs: { model: ['37', 0], shift: 8 } },
    6: { class_type: 'CLIPTextEncode', inputs: { text: input.prompt, clip: ['38', 0] } },
    7: { class_type: 'CLIPTextEncode', inputs: { text: input.negative || WAN_NEGATIVE, clip: ['38', 0] } },
    56: { class_type: 'LoadImage', inputs: { image: input.image } },
    55: { class_type: 'Wan22ImageToVideoLatent', inputs: { vae: ['39', 0], width: w, height: h, length, batch_size: 1, start_image: ['56', 0] } },
    3: { class_type: 'KSampler', inputs: { model: ['48', 0], seed: input.seed, steps: 20, cfg: 5, sampler_name: 'uni_pc', scheduler: 'simple', positive: ['6', 0], negative: ['7', 0], latent_image: ['55', 0], denoise: 1 } },
    8: { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['39', 0] } },
    ...save,
  };
}

export interface ClipResult { status: 'done' | 'pending' | 'failed'; path?: string; jobId?: string; error?: string }

export interface ComfyClipInput {
  root: string;
  imageRel: string;
  outRel: string;
  prompt: string;
  seconds: number;
  vertical: boolean;
  modelId: string;
  /** How long to wait before keeping the job for later (default 30 minutes). */
  timeoutMs?: number;
  intervalMs?: number;
}

// A 3 s LTX-Video clip took about 14 minutes on a 6 GB card (2026-10-23, part of the model offloaded).
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The first video file in a prompt's history outputs. */
function videoOutput(history: any, jobId: string): { filename: string; subfolder: string; type: string } | null {
  const outputs = history?.[jobId]?.outputs || {};
  for (const node of Object.values(outputs) as any[]) {
    for (const key of ['videos', 'images', 'gifs']) {
      const file = (node?.[key] || []).find((f: any) => /\.(mp4|webm)$/i.test(String(f?.filename || '')));
      if (file) return { filename: String(file.filename), subfolder: String(file.subfolder || ''), type: String(file.type || 'output') };
    }
  }
  return null;
}

async function saveIfDone(endpoint: string, jobId: string, outRel: string, root: string): Promise<ClipResult | null> {
  const response = await comfyRequest(endpoint, `/history/${encodeURIComponent(jobId)}`);
  if (!response.ok) return null;
  const file = videoOutput(await response.json(), jobId);
  if (!file) return null;
  await invoke('comfyui_save_output', { request: {
    endpoint, filename: file.filename, subfolder: file.subfolder, kind: file.type, workspaceRoot: root, relPath: outRel,
  } });
  return { status: 'done', path: outRel };
}

export async function makeComfyClip(input: ComfyClipInput): Promise<ClipResult> {
  const endpoint = getComfyUiEndpoint();
  try {
    // ComfyUI needs the graphics card that Ollama is holding.
    await freeOllamaGpuMemory().catch(() => undefined);
    const uploaded = await invoke<{ name: string }>('comfyui_upload_image', { request: { endpoint, workspaceRoot: input.root, relPath: input.imageRel } });
    const workflow = buildVideoWorkflow(input.modelId, {
      image: uploaded.name, prompt: input.prompt, seconds: input.seconds, vertical: input.vertical,
      seed: Math.floor(Math.random() * 2 ** 31),
    });
    const queued = await comfyRequest(endpoint, '/prompt', { method: 'POST', body: JSON.stringify({ prompt: workflow }) });
    const body = await queued.json().catch(() => ({}));
    if (!queued.ok || !body?.prompt_id) {
      const why = body?.error?.message || body?.node_errors ? JSON.stringify(body?.error?.message || body?.node_errors) : `HTTP ${queued.status}`;
      return { status: 'failed', error: `ComfyUI refused the video workflow: ${String(why).replace(/^"|"$/g, '')}` };
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

/** Looks again for a clip ComfyUI had not finished. */
export async function checkComfyClip(jobId: string, outRel: string, root: string): Promise<ClipResult> {
  try {
    return (await saveIfDone(getComfyUiEndpoint(), jobId, outRel, root)) || { status: 'pending', jobId };
  } catch (error) {
    return { status: 'failed', error: message(error) };
  }
}
