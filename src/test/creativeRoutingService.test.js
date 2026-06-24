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

  it('returns error when no tool is running', async () => {
    getAllStatus.mockResolvedValue([
      { name: 'ollama', status: 'running' },
    ]);
    const result = await routeToCreativeTool('image_generation');
    expect(result.ok).toBe(false);
    expect(result.needsRuntime).toBe(true);
    expect(result.error).toContain('image generation');
  });

  it('returns null when getAllStatus throws', async () => {
    getAllStatus.mockRejectedValue(new Error('offline'));
    const result = await routeToCreativeTool('image_generation');
    expect(result).toBeNull();
  });

  it('prefers comfyui over automatic1111', async () => {
    getAllStatus.mockResolvedValue([
      { name: 'automatic1111', status: 'running' },
      { name: 'comfyui', status: 'running' },
    ]);
    const result = await routeToCreativeTool('image_generation');
    expect(result.tool).toBe('comfyui');
  });
});
