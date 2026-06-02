import { describe, expect, it } from 'vitest';
import {
  getMiyaComfyWorkflowPreset,
  listMiyaComfyWorkflowPresets,
  MIYA_COMFY_WORKFLOW_PRESETS
} from '../services/miyaComfyWorkflowPresetService';

describe('miyaComfyWorkflowPresetService', () => {
  it('ships local-only starter presets for image and video workflows', () => {
    expect(MIYA_COMFY_WORKFLOW_PRESETS.length).toBeGreaterThanOrEqual(5);
    expect(MIYA_COMFY_WORKFLOW_PRESETS.every((preset) => preset.localOnly)).toBe(true);
    expect(MIYA_COMFY_WORKFLOW_PRESETS.map((preset) => preset.mediaType)).toEqual(expect.arrayContaining(['image', 'video']));
  });

  it('filters presets by media type and resolves a single preset', () => {
    const images = listMiyaComfyWorkflowPresets({ mediaType: 'image' });
    expect(images.length).toBeGreaterThan(0);
    expect(images.every((preset) => preset.mediaType === 'image')).toBe(true);
    expect(getMiyaComfyWorkflowPreset('blank-spark')?.name).toContain('I Do Not Know');
  });
});
