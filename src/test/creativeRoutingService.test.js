import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectCreativeIntent, routeToCreativeTool } from '../services/creativeRoutingService';

vi.mock('../services/runtimeManagerService', () => ({
  getAllStatus: vi.fn(),
}));

vi.mock('../services/resources/ensureTools', () => ({ ensureTools: vi.fn() }));

import { getAllStatus } from '../services/runtimeManagerService';
import { ensureTools } from '../services/resources/ensureTools';

describe('detectCreativeIntent', () => {
  it('detects image generation intent', () => {
    expect(detectCreativeIntent('generate an image of a sunset')).toBe('image_generation');
    expect(detectCreativeIntent('create a photo of a dog')).toBe('image_generation');
    expect(detectCreativeIntent('draw a picture of mountains')).toBe('image_generation');
  });

  it('detects video generation intent', () => {
    expect(detectCreativeIntent('make a short video about nature')).toBe('video_generation');
    expect(detectCreativeIntent('create a video clip')).toBe('video_generation');
  });

  it('detects audio generation intent', () => {
    expect(detectCreativeIntent('generate audio for my project')).toBe('audio_generation');
    expect(detectCreativeIntent('create a music track')).toBe('audio_generation');
    expect(detectCreativeIntent('make a soundtrack for the intro')).toBe('audio_generation');
  });

  // QA 2026-10-22: these matched video/audio and Jose refused them.
  it('does not treat ordinary requests as video or audio jobs', () => {
    expect(detectCreativeIntent('create a short summary of my week')).toBeNull();
    expect(detectCreativeIntent('make a tracker for my expenses')).toBeNull();
    expect(detectCreativeIntent('create a voice of reason section')).toBeNull();
    expect(detectCreativeIntent('make a YouTube short about tea')).toBe('video_generation');
  });

  it('returns null for non-creative commands', () => {
    expect(detectCreativeIntent('check my messages')).toBeNull();
    expect(detectCreativeIntent('search for news')).toBeNull();
    expect(detectCreativeIntent('')).toBeNull();
  });
});

describe('routeToCreativeTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns matching running tool', async () => {
    getAllStatus.mockResolvedValue([
      { name: 'comfyui', status: 'running' },
      { name: 'ollama', status: 'running' },
    ]);
    const result = await routeToCreativeTool('image_generation');
    expect(result).toEqual({ ok: true, tool: 'comfyui' });
  });

  // 2.11.0 QA (owner, 2026-11-01): a picture request refused while ComfyUI was installed and set up.
  it('starts ComfyUI when it is not running, then goes ahead', async () => {
    getAllStatus.mockResolvedValue([{ name: 'ollama', status: 'running' }]);
    ensureTools.mockResolvedValue({ ok: true });
    const starting = vi.fn();
    const result = await routeToCreativeTool('image_generation', starting);
    expect(ensureTools).toHaveBeenCalledWith(['comfyui']);
    expect(starting).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, tool: 'comfyui' });
  });

  it('says why when ComfyUI could not be started', async () => {
    getAllStatus.mockResolvedValue([{ name: 'comfyui', running: false, installed: false }]);
    ensureTools.mockResolvedValue({ ok: false, reason: "ComfyUI isn't installed. Install it in Runtime Hub." });
    const result = await routeToCreativeTool('image_generation');
    expect(result.ok).toBe(false);
    expect(result.needsRuntime).toBe(true);
    expect(result.error).toBe("ComfyUI isn't installed. Install it in Runtime Hub.");
  });

  it('returns null when getAllStatus throws', async () => {
    getAllStatus.mockRejectedValue(new Error('offline'));
    const result = await routeToCreativeTool('image_generation');
    expect(result).toBeNull();
  });

  // Owner, 2026-10-22: agents use ComfyUI only. Automatic1111, Fooocus and
  // InvokeAI are standalone; sending them a ComfyUI-style request failed.
  it('never routes images to another image tool', async () => {
    getAllStatus.mockResolvedValue([
      { name: 'automatic1111', status: 'running' },
      { name: 'fooocus', running: true },
    ]);
    const result = await routeToCreativeTool('image_generation');
    expect(result.ok).toBe(false);
    expect(result.tool).toBeUndefined();
  });

  // Closing phase (owner, 2026-10-30): video and music are Miya's step (chatMedia.ts), asked
  // before the shortcuts, so the route leaves them alone instead of refusing them.
  it('leaves video and audio to Miya\'s own step', async () => {
    for (const intent of ['video_generation', 'audio_generation']) {
      expect(await routeToCreativeTool(intent)).toBeNull();
    }
    expect(getAllStatus).not.toHaveBeenCalled();
  });
});
