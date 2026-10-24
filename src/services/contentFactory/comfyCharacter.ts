// Keeping a brand's character with ComfyUI (content factory phase 4c), free and on this
// computer: Stable Diffusion 2.1 unCLIP (pinned in `comfyui_video_models.rs`, installed from
// Runtime Hub) makes the picture from up to 3 of the character's reference pictures, on
// ComfyUI's own nodes. Without that model the picture still mentions the character's
// description, and the note says how to keep the character properly.
import { invoke } from '@tauri-apps/api/core';
import { comfyRequest, getComfyUiEndpoint, pollComfyUiHistory } from '../connectors/connectorImageGenerators';
import { freeOllamaGpuMemory } from '../../lib/ollama';
import { getCharacterReferenceModel } from '../videoModelService';
import type { BrandCharacter } from './contentTypes';

export const CHARACTER_REFERENCE_MISSING = 'Install the character reference model in Runtime Hub to keep the character.';
export const REFERENCE_CHECKPOINT = 'sd21-unclip-l.ckpt';
const MAX_REFERENCES = 3;
const CACHE_MS = 60_000;

let cached: { atMs: number; installed: boolean } | null = null;

export function resetReferenceCacheForTests(): void {
  cached = null;
}

/** Whether the character reference model is installed in the user's ComfyUI (checked once a minute). */
export async function characterReferenceAvailable(): Promise<boolean> {
  if (cached && Date.now() - cached.atMs < CACHE_MS) return cached.installed;
  const info = await getCharacterReferenceModel().catch(() => null);
  cached = { atMs: Date.now(), installed: Boolean(info?.installed) };
  return cached.installed;
}

/** The prompt with the character's description, so a picture without the reference model still shows them. */
export function withCharacterPrompt(prompt: string, character: BrandCharacter | null): string {
  if (!character?.description) return prompt;
  return [`${character.name}: ${character.description}`, prompt].filter(Boolean).join('. ');
}

type Node = { class_type: string; inputs: Record<string, unknown> };

/** An API-format graph on ComfyUI's own nodes; each reference picture adds one unCLIP conditioning. */
export function buildCharacterWorkflow(input: { prompt: string; negative: string; width: number; height: number; references: string[]; seed: number }): Record<string, Node> {
  const g: Record<string, Node> = {
    '1': { class_type: 'unCLIPCheckpointLoader', inputs: { ckpt_name: REFERENCE_CHECKPOINT } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: input.prompt, clip: ['1', 1] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: input.negative || 'blurry, distorted, text, watermark', clip: ['1', 1] } },
  };
  let conditioning: [string, number] = ['2', 0];
  input.references.forEach((image, i) => {
    const load = String(10 + i * 3);
    const encode = String(11 + i * 3);
    const cond = String(12 + i * 3);
    g[load] = { class_type: 'LoadImage', inputs: { image } };
    g[encode] = { class_type: 'CLIPVisionEncode', inputs: { clip_vision: ['1', 3], image: [load, 0], crop: 'center' } };
    g[cond] = { class_type: 'unCLIPConditioning', inputs: { conditioning, clip_vision_output: [encode, 0], strength: 1 / input.references.length + 0.4, noise_augmentation: 0.1 } };
    conditioning = [cond, 0];
  });
  g['4'] = { class_type: 'EmptyLatentImage', inputs: { width: input.width, height: input.height, batch_size: 1 } };
  g['5'] = { class_type: 'KSampler', inputs: { model: ['1', 0], positive: conditioning, negative: ['3', 0], latent_image: ['4', 0], seed: input.seed, steps: 24, cfg: 7, sampler_name: 'euler', scheduler: 'normal', denoise: 1 } };
  g['6'] = { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } };
  g['7'] = { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'alphonso_character' } };
  return g;
}

type ImageResult = { ok?: boolean; pending?: boolean; jobId?: string; previewBase64?: string; error?: string };

/** One picture of the character through ComfyUI (the same result shape as generateComfyUiImage). */
export async function makeCharacterPicture(input: {
  root: string; prompt: string; negativePrompt?: string; width: number; height: number; character: BrandCharacter;
}): Promise<ImageResult> {
  const endpoint = getComfyUiEndpoint();
  const chosen = (input.character.comfyPictures?.length ? input.character.comfyPictures : input.character.pictures).slice(0, MAX_REFERENCES);
  try {
    await freeOllamaGpuMemory().catch(() => undefined);
    const references: string[] = [];
    for (const relPath of chosen) {
      const uploaded = await invoke<{ name: string }>('comfyui_upload_image', { request: { endpoint, workspaceRoot: input.root, relPath } });
      references.push(uploaded.name);
    }
    const workflow = buildCharacterWorkflow({
      prompt: input.prompt, negative: input.negativePrompt || '', width: input.width, height: input.height, references,
      seed: Math.floor(Math.random() * 2 ** 31),
    });
    const queued = await comfyRequest(endpoint, '/prompt', { method: 'POST', body: JSON.stringify({ prompt: workflow }) });
    const body = await queued.json().catch(() => ({}));
    if (!queued.ok || !body?.prompt_id) {
      const why = body?.error?.message || (body?.node_errors ? JSON.stringify(body.node_errors) : `HTTP ${queued.status}`);
      return { ok: false, error: `ComfyUI refused the character workflow: ${why}` };
    }
    return await pollComfyUiHistory(String(body.prompt_id)) as ImageResult;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
