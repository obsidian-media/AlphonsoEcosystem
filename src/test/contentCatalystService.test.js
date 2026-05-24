import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/ollama', () => ({
  generateOllamaResponse: vi.fn(async () => ({
    response: JSON.stringify({
      angle: 'premium launch',
      audience: 'solo founder',
      promise: 'premium content catalyst',
      hook_options: ['Launch with confidence'],
      asset_plan: { image: true, video: true, narration: true, publish: false },
      platform_notes: ['instagram'],
      risk_notes: ['preview only']
    }),
    done: true
  }))
}));

vi.mock('../services/connectorRegistryService', () => ({
  generateSdWebUiImage: vi.fn(async () => ({
    ok: true,
    imageUrl: 'file:///tmp/content-image.png'
  })),
  queueComfyUiVideo: vi.fn(),
  getComfyUiVideoHistory: vi.fn()
}));

vi.mock('../services/runwayService', () => ({
  generateRunwayVideo: vi.fn(async () => ({
    ok: true,
    videoUrl: 'file:///tmp/content-video.mp4'
  }))
}));

vi.mock('../services/metaPublishService', () => ({
  publishMetaContent: vi.fn(async () => ({
    ok: true,
    published: false,
    setupRequired: true,
    message: 'Meta publish setup required.'
  }))
}));

vi.mock('../services/approval/approvalService', () => ({
  requireApproval: vi.fn(async () => ({ ok: true, success: true, required: true }))
}));

vi.mock('../services/workspaceArtifactService', () => ({
  writeWorkspaceArtifact: vi.fn(async () => ({ ok: true })),
  writeHandoffArtifact: vi.fn(async () => ({ ok: true }))
}));

import {
  createContentBridgeRequest,
  createContentBridgeResponse,
  runContentCatalystJob
} from '../features/content-catalyst';

beforeEach(() => {
  localStorage.clear();
});

describe('content catalyst', () => {
  it('normalizes bridge requests', () => {
    const request = createContentBridgeRequest({
      idea: 'Launch a premium SaaS',
      business_context: 'Founder-led brand',
      platform: 'Instagram',
      format: 'reel',
      tone: 'confident',
      needs: { image: true, video: false, narration: true, publish: false }
    });

    expect(request.platform).toBe('instagram');
    expect(request.format).toBe('reel');
    expect(request.needs.image).toBe(true);
    expect(request.needs.narration).toBe(true);
  });

  it('runs the content pipeline into review state', async () => {
    const job = await runContentCatalystJob({
      idea: 'Launch a premium SaaS',
      business_context: 'Founder-led brand',
      platform: 'instagram',
      format: 'reel',
      tone: 'confident and polished',
      request_id: 'acc_123',
      needs: { image: true, video: true, narration: true, publish: false }
    }, {
      workspaceRoot: 'C:/tmp'
    });

    expect(job.id).toMatch(/^content_/);
    expect(job.status).toBe('ready_for_review');
    expect(job.draft).toBeTruthy();
    expect(job.assets.image_url).toBeTruthy();
    expect(job.assets.video_url).toBeTruthy();
    expect(job.narration.narration_text).toBeTruthy();
    expect(job.bridgeResponse.success).toBe(true);
    const bridge = createContentBridgeResponse(job);
    expect(bridge.request_id).toBe('acc_123');
    expect(bridge.step).toBeTruthy();
    expect(bridge.progress).toBeGreaterThan(0);
    expect(bridge.artifacts.image_url).toBeTruthy();
  });

  it('reuses jobs for the same request id', async () => {
    const payload = {
      idea: 'Launch a premium SaaS',
      business_context: 'Founder-led brand',
      platform: 'instagram',
      format: 'reel',
      tone: 'confident and polished',
      request_id: 'acc_retry_001',
      needs: { image: true, video: false, narration: false, publish: false }
    };

    const first = await runContentCatalystJob(payload, {
      workspaceRoot: 'C:/tmp'
    });
    const second = await runContentCatalystJob(payload, {
      workspaceRoot: 'C:/tmp'
    });

    expect(second.id).toBe(first.id);
    expect(second.request_id).toBe('acc_retry_001');
  });
});
