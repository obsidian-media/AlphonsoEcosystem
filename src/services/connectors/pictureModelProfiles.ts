// How each picture model Runtime Hub installs draws (owner, 2026-11-02). The settings come from
// each model's own card; the list matches PICTURE_MODELS in src-tauri/src/comfyui_video_models.rs
// (a test checks). Any other model (the starter one, one you added yourself) draws as asked.

export interface PictureModelProfile {
  /** The side of a square picture the model was trained at; other shapes keep about that area. */
  baseSize: number;
  steps: number;
  cfgScale: number;
  sampler: string;
  scheduler: string;
}

export const PICTURE_MODEL_PROFILES: Record<string, PictureModelProfile> = {
  // ByteDance's card: "Please use Euler sampler with sgm_uniform scheduler", the 4-step checkpoint
  // with 4 steps, guidance 1 in its ComfyUI workflow.
  'sdxl_lightning_4step.safetensors': { baseSize: 1024, steps: 4, cfgScale: 1, sampler: 'euler', scheduler: 'sgm_uniform' },
  // Lykon's card: 4 steps, guidance 2, a DPM-solver multistep sampler.
  'DreamShaperXL_Lightning-SFW.safetensors': { baseSize: 1024, steps: 4, cfgScale: 2, sampler: 'dpmpp_2m', scheduler: 'karras' },
};

export interface PictureSettings { width: number; height: number; steps: number; cfgScale: number; sampler: string; scheduler: string }

const roundTo64 = (n: number) => Math.max(64, Math.round(n / 64) * 64);

/** The size, steps and sampler a picture is drawn with on this checkpoint. */
export function pictureSettingsFor(checkpoint: string, asked: { width: number; height: number; steps: number; cfgScale: number }): PictureSettings {
  const profile = PICTURE_MODEL_PROFILES[checkpoint];
  if (!profile) return { ...asked, sampler: 'euler', scheduler: 'normal' };
  const scale = profile.baseSize / Math.sqrt(Math.max(1, asked.width * asked.height));
  return {
    width: roundTo64(asked.width * scale),
    height: roundTo64(asked.height * scale),
    steps: profile.steps,
    cfgScale: profile.cfgScale,
    sampler: profile.sampler,
    scheduler: profile.scheduler,
  };
}
