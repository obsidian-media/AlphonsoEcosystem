// Owner, 2026-11-02: a better picture model than the starter one, from Runtime Hub. Each pinned
// model draws with its own settings (from its model card), at its own size.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PICTURE_MODEL_PROFILES, pictureSettingsFor } from '../../services/connectors/pictureModelProfiles';

const asked = { width: 512, height: 512, steps: 20, cfgScale: 7 };

describe('pictureSettingsFor', () => {
  it('SDXL Lightning 4-step: 4 steps, guidance 1, Euler with sgm_uniform, at 1024', () => {
    expect(pictureSettingsFor('sdxl_lightning_4step.safetensors', asked)).toEqual({ width: 1024, height: 1024, steps: 4, cfgScale: 1, sampler: 'euler', scheduler: 'sgm_uniform' });
  });

  it('DreamShaper XL Lightning: 4 steps, guidance 2, DPM-solver, at 1024', () => {
    expect(pictureSettingsFor('DreamShaperXL_Lightning-SFW.safetensors', asked)).toMatchObject({ width: 1024, height: 1024, steps: 4, cfgScale: 2, sampler: 'dpmpp_2m', scheduler: 'karras' });
  });

  it('keeps the shape asked for, at the model size, in steps of 64', () => {
    const wide = pictureSettingsFor('sdxl_lightning_4step.safetensors', { ...asked, width: 1280, height: 720 });
    expect(wide.width % 64).toBe(0);
    expect(wide.height % 64).toBe(0);
    expect(wide.width / wide.height).toBeCloseTo(1280 / 720, 0);
    expect(wide.width * wide.height).toBeGreaterThan(0.85 * 1024 * 1024);
    expect(wide.width * wide.height).toBeLessThan(1.15 * 1024 * 1024);
  });

  it('a model it has no settings for draws as asked (the starter model, your own)', () => {
    expect(pictureSettingsFor('DreamShaper_8_pruned.safetensors', asked)).toEqual({ ...asked, sampler: 'euler', scheduler: 'normal' });
    expect(pictureSettingsFor('', { ...asked, width: 1280, height: 720 })).toMatchObject({ width: 1280, height: 720 });
  });

  it('has settings for exactly the picture models Runtime Hub installs', () => {
    const rust = readFileSync(resolve(__dirname, '../../../src-tauri/src/comfyui_video_models.rs'), 'utf8');
    const block = rust.slice(rust.indexOf('pub(crate) const PICTURE_MODELS'), rust.indexOf('pub(crate) fn picture_model'));
    const files = [...block.matchAll(/filename: "([^"]+)"/g)].map((m) => m[1]).sort();
    expect(files.length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(PICTURE_MODEL_PROFILES).sort()).toEqual(files);
  });
});
