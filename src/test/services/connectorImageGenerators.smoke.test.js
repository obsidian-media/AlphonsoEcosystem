import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockInvoke = vi.fn();
const mockGetConnectorCircuitState = vi.fn();
const mockGateConnectorAction = vi.fn();
const mockAppendConnectorAudit = vi.fn();
const mockRecordConnectorFailure = vi.fn();
const mockRecordConnectorSuccess = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => mockInvoke(...args),
}));

vi.mock('../../services/connectors/connectorRegistry.js', () => ({
  getConnectorCircuitState: (...args) => mockGetConnectorCircuitState(...args),
  gateConnectorAction: (...args) => mockGateConnectorAction(...args),
  appendConnectorAudit: (...args) => mockAppendConnectorAudit(...args),
  recordConnectorFailure: (...args) => mockRecordConnectorFailure(...args),
  recordConnectorSuccess: (...args) => mockRecordConnectorSuccess(...args),
}));

describe('connectorImageGenerators smoke paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConnectorCircuitState.mockReturnValue({ ok: true });
    mockGateConnectorAction.mockReturnValue({ ok: true, verificationState: 'verified' });
    mockInvoke.mockReset();
  });

  it('sends an SD WebUI image-generation request with the expected payload', async () => {
    mockInvoke.mockResolvedValue({
      ok: true,
      provider: 'automatic1111',
      message: 'queued',
      jobId: 'job-1',
    });
    const { generateSdWebUiImage } = await import('../../services/connectors/connectorImageGenerators');
    const result = await generateSdWebUiImage({
      prompt: 'a red fox',
      negativePrompt: 'blurry',
      width: 1024,
      height: 768,
      steps: 28,
      cfgScale: 8,
    });

    expect(mockInvoke).toHaveBeenCalledWith('connector_generate_sdwebui_image', expect.objectContaining({
      prompt: 'a red fox',
      negativePrompt: 'blurry',
      width: 1024,
      height: 768,
      steps: 28,
      cfgScale: 8,
    }));
    expect(result.ok).toBe(true);
    expect(result.provider).toBe('automatic1111');
  });

  it('queues a ComfyUI workflow through the Tauri backend when available', async () => {
    mockInvoke.mockResolvedValue({ ok: true, provider: 'comfyui', promptId: 'prompt-1', message: 'queued' });
    const { queueComfyUiWorkflow } = await import('../../services/connectors/connectorImageGenerators');
    const result = await queueComfyUiWorkflow({
      prompt: 'a teal spaceship',
      workflowJson: JSON.stringify({
        1: { class_type: 'CLIPTextEncode', inputs: { text: 'placeholder', clip: ['2', 0] } },
      }),
      mediaType: 'video',
    });

    expect(mockInvoke).toHaveBeenCalledWith('connector_queue_comfyui_video', expect.objectContaining({
      prompt: 'a teal spaceship',
      workflowJson: expect.any(String),
    }));
    expect(result.ok).toBe(true);
    expect(result.provider).toBe('comfyui');
  });

  it('falls back to the HTTP ComfyUI queue when the backend queue command is unavailable', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('invoke failed'));
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prompt_id: 'prompt-http-1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          'prompt-http-1': {
            outputs: {
              '9': {
                images: [{ filename: 'result.png', type: 'output', subfolder: '' }],
              },
            },
          },
        }),
      });

    const { queueComfyUiWorkflow } = await import('../../services/connectors/connectorImageGenerators');
    const result = await queueComfyUiWorkflow({
      prompt: 'fallback path',
      workflowJson: JSON.stringify({
        1: { class_type: 'CLIPTextEncode', inputs: { text: 'placeholder', clip: ['2', 0] } },
      }),
      mediaType: 'image',
    });

    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:8188/prompt', expect.objectContaining({
      method: 'POST',
    }));
    expect(result.ok).toBe(true);
    expect(result.promptId).toBe('prompt-http-1');
  });

  it('loads ComfyUI history through the backend history command', async () => {
    mockInvoke.mockResolvedValue({
      ok: true,
      provider: 'comfyui',
      jobId: 'history-1',
      promptId: 'history-1',
      outputPaths: ['result.png'],
      imageUrls: ['http://127.0.0.1:8188/view?filename=result.png&type=output'],
      message: 'loaded',
    });
    const { getComfyUiVideoHistory } = await import('../../services/connectors/connectorImageGenerators');
    const result = await getComfyUiVideoHistory('history-1');

    expect(mockInvoke).toHaveBeenCalledWith('connector_get_comfyui_history', { promptId: 'history-1' });
    expect(result.ok).toBe(true);
    expect(result.outputPaths).toContain('result.png');
  });

  it('returns a fully-populated result from the local generation flow', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('invoke unavailable'));
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prompt_id: 'generated-1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          'generated-1': {
            outputs: {
              '9': {
                images: [{ filename: 'final.png', type: 'output', subfolder: '' }],
              },
            },
          },
        }),
      });

    const { generateComfyUiImage } = await import('../../services/connectors/connectorImageGenerators');
    const result = await generateComfyUiImage({
      prompt: 'sunset over a bay',
      negativePrompt: 'low quality',
      width: 640,
      height: 480,
      steps: 20,
      cfgScale: 7,
    });

    expect(result.ok).toBe(true);
    expect(result.prompt).toBe('sunset over a bay');
    expect(result.outputPaths).toContain('final.png');
  });
});
