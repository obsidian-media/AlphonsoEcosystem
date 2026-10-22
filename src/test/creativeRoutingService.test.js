import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectCreativeIntent, routeToCreativeTool } from '../services/creativeRoutingService';

vi.mock('../services/runtimeManagerService', () => ({
  getAllStatus: vi.fn(),
}));

import { getAllStatus } from '../services/runtimeManagerService';

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

  it('says ComfyUI is needed when it is not running', async () => {
    getAllStatus.mockResolvedValue([
      { name: 'ollama', status: 'running' },
    ]);
    const result = await routeToCreativeTool('image_generation');
    expect(result.ok).toBe(false);
    expect(result.needsRuntime).toBe(true);
    expect(result.error).toMatch(/ComfyUI is not running/);
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

  it('says plainly that video and audio are not available from chat yet', async () => {
    for (const intent of ['video_generation', 'audio_generation']) {
      const result = await routeToCreativeTool(intent);
      expect(result).toMatchObject({ ok: false, notAvailable: true, needsRuntime: false });
      expect(result.error).toMatch(/isn't available yet\. Nothing was started\./);
    }
    expect(getAllStatus).not.toHaveBeenCalled();
  });
});
