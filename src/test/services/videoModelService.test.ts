import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { invoke } from '@tauri-apps/api/core';
import {
  effectiveVideoModel, getSelectedVideoModel, installVideoModel, listVideoModels, setSelectedVideoModel,
} from '../../services/videoModelService';

const info = {
  vramGb: 6, suggested: 'ltx_video_2b', comfyuiDir: 'D:\\ComfyUI',
  models: [
    { id: 'ltx_video_2b', name: 'LTX', minVramGb: 6, maxSeconds: 5, fps: 24, license: 'x', sizeBytes: 9, installed: true },
    { id: 'wan22_ti2v_5b', name: 'Wan', minVramGb: 8, maxSeconds: 5, fps: 24, license: 'y', sizeBytes: 18, installed: false },
  ],
};

beforeEach(() => {
  localStorage.clear();
  vi.mocked(invoke).mockReset();
});

// Miya content factory phase 2b: video models suggested by the card.
describe('videoModelService', () => {
  it('asks the backend with the ComfyUI chosen in Settings', async () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ comfyuiDir: 'D:\\ComfyUI' }));
    vi.mocked(invoke).mockResolvedValue(info);
    expect(await listVideoModels()).toEqual(info);
    expect(invoke).toHaveBeenCalledWith('comfyui_video_models', { savedDir: 'D:\\ComfyUI' });
    await installVideoModel('wan22_ti2v_5b');
    expect(invoke).toHaveBeenCalledWith('comfyui_install_video_model', { savedDir: 'D:\\ComfyUI', id: 'wan22_ti2v_5b' });
  });

  it('no choice means the suggested model; a choice is kept', () => {
    expect(getSelectedVideoModel()).toBeNull();
    expect(effectiveVideoModel(info)?.id).toBe('ltx_video_2b');
    setSelectedVideoModel('wan22_ti2v_5b');
    expect(getSelectedVideoModel()).toBe('wan22_ti2v_5b');
    expect(effectiveVideoModel(info)?.id).toBe('wan22_ti2v_5b');
    setSelectedVideoModel(null);
    expect(getSelectedVideoModel()).toBeNull();
  });

  it('a choice that is no longer in the list falls back to the suggestion; no suggestion and no choice → none', () => {
    setSelectedVideoModel('gone');
    expect(effectiveVideoModel(info)?.id).toBe('ltx_video_2b');
    setSelectedVideoModel(null);
    expect(effectiveVideoModel({ ...info, suggested: null })).toBeNull();
  });
});

// Phase 3d: smaller, shorter clips on a card with under 8 GB, unless switched off.
describe('clipSizeFor', () => {
  it('a small card gets smaller clips of at most 3 seconds; full size when chosen', async () => {
    const { clipSizeFor, setFullSizeClips, getFullSizeClips } = await import('../../services/videoModelService');
    localStorage.clear();
    expect(clipSizeFor({ smallCard: true })).toEqual({ lowRes: true, maxSeconds: 3 });
    expect(clipSizeFor({ smallCard: false })).toEqual({ lowRes: false, maxSeconds: Infinity });
    setFullSizeClips(true);
    expect(getFullSizeClips()).toBe(true);
    expect(clipSizeFor({ smallCard: true })).toEqual({ lowRes: false, maxSeconds: Infinity });
  });
});
