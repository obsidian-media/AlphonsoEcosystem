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
      risk_notes: ['preview only'],
      // Draft fields: the same mock answers both the brief and the draft call.
      hook: 'A latte worth the walk',
      caption: 'Our pumpkin latte is back for autumn.',
      hashtags: ['#pumpkinlatte']
    }),
    done: true
  })),
  getConfiguredOllamaEndpoint: vi.fn(() => 'http://localhost:11434'),
  getConfiguredOllamaModel: vi.fn(() => 'current-model:1b')
}));

vi.mock('../services/connectorRegistryService', () => ({
  generateComfyUiImage: vi.fn(async () => ({
    ok: true,
    provider: 'comfyui',
    checkpoint: 'v1-5-pruned-emaonly-fp16.safetensors',
    jobId: 'comfy_prompt_001',
    prompt: 'premium visual',
    width: 512,
    height: 512,
    steps: 20,
    cfgScale: 7,
    imageUrls: ['http://127.0.0.1:8188/view?filename=content-image.png&type=output'],
    outputPaths: ['content-image.png'],
    previewBase64: 'base64-preview'
  })),
  queueComfyUiVideo: vi.fn(),
  getComfyUiVideoHistory: vi.fn(),
  checkComfyUiImage: vi.fn(async () => ({ ok: false, pending: true, jobId: 'late-1' }))
}));

vi.mock('../services/runwayService', () => ({
  generateRunwayVideo: vi.fn(async () => ({
    ok: true,
    videoUrl: 'file:///tmp/content-video.mp4'
  }))
}));

vi.mock('../services/metaPublishService', () => ({
  publishMetaVideo: vi.fn(async () => ({ ok: true, status: 'posted', postId: 'reel_1', url: 'https://www.instagram.com/reel/r1' })),
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

import { requireApproval } from '../services/approval/approvalService';
import { publishMetaContent, publishMetaVideo } from '../services/metaPublishService';
import { checkComfyUiImage, generateComfyUiImage } from '../services/connectorRegistryService';
import { generateRunwayVideo } from '../services/runwayService';
import { generateOllamaResponse, getConfiguredOllamaModel } from '../lib/ollama';
import { buildContentBrief } from '../features/content-catalyst/services/contentCatalystService';

import {
  createContentBridgeRequest,
  createContentBridgeResponse,
  runContentCatalystJob,
  createContentJobFromBridgeRequest,
  getContentJob,
  listContentJobs,
  getContentJobByRequestId,
  upsertContentJob,
  generateContentDraft,
  generateContentImage,
  generateContentVideo,
  generateContentNarration,
  generateContentPreview,
  publishContent,
  publishContentPreview
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
    expect(bridge.artifacts.comfyui.provider).toBe('comfyui');
    expect(bridge.artifacts.comfyui.checkpoint).toBe('v1-5-pruned-emaonly-fp16.safetensors');
    expect(bridge.artifacts.local_media_artifacts[0]).toMatchObject({
      engine: 'comfyui',
      source: 'alphonso-miya',
      media_type: 'image',
      privacy: 'local_only'
    });
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

describe('createContentBridgeRequest', () => {
  it('defaults platform to instagram when empty', () => {
    const req = createContentBridgeRequest({ idea: 'test' });
    expect(req.platform).toBe('instagram');
  });

  it('defaults format to post when empty', () => {
    const req = createContentBridgeRequest({ idea: 'test' });
    expect(req.format).toBe('post');
  });

  it('defaults needs.image to true when not specified', () => {
    const req = createContentBridgeRequest({ idea: 'test' });
    expect(req.needs.image).toBe(true);
  });

  it('sets needs.video to true when explicitly true', () => {
    const req = createContentBridgeRequest({ idea: 'test', needs: { video: true } });
    expect(req.needs.video).toBe(true);
  });

  it('sets needs.video to false when explicitly false', () => {
    const req = createContentBridgeRequest({ idea: 'test', needs: { video: false } });
    expect(req.needs.video).toBe(false);
  });

  it('trims whitespace from idea', () => {
    const req = createContentBridgeRequest({ idea: '  test idea  ' });
    expect(req.idea).toBe('test idea');
  });

  it('normalizes platform to lowercase', () => {
    const req = createContentBridgeRequest({ idea: 'test', platform: 'INSTAGRAM' });
    expect(req.platform).toBe('instagram');
  });

  it('extracts request_id from payload', () => {
    const req = createContentBridgeRequest({ idea: 'test', request_id: 'req_001' });
    expect(req.request_id).toBe('req_001');
  });

  it('extracts request_id from requestId alias', () => {
    const req = createContentBridgeRequest({ idea: 'test', requestId: 'req_002' });
    expect(req.request_id).toBe('req_002');
  });
});

describe('createContentBridgeResponse', () => {
  it('returns success false for failed jobs', () => {
    const resp = createContentBridgeResponse({ status: 'failed', id: 'j1' });
    expect(resp.success).toBe(false);
  });

  it('returns success true for non-failed jobs', () => {
    const resp = createContentBridgeResponse({ status: 'drafting', id: 'j1' });
    expect(resp.success).toBe(true);
  });

  it('maps status to correct progress percentage', () => {
    expect(createContentBridgeResponse({ status: 'received' }).progress).toBe(5);
    expect(createContentBridgeResponse({ status: 'drafting' }).progress).toBe(35);
    expect(createContentBridgeResponse({ status: 'image_ready' }).progress).toBe(55);
    expect(createContentBridgeResponse({ status: 'video_ready' }).progress).toBe(80);
    expect(createContentBridgeResponse({ status: 'ready_for_review' }).progress).toBe(90);
    expect(createContentBridgeResponse({ status: 'published' }).progress).toBe(100);
    expect(createContentBridgeResponse({ status: 'failed' }).progress).toBe(100);
  });

  it('returns next_step generate for in-progress jobs', () => {
    const resp = createContentBridgeResponse({ status: 'drafting', id: 'j1' });
    expect(resp.next_step).toBe('generate');
  });

  it('returns next_step publish-preview for ready_for_review', () => {
    const resp = createContentBridgeResponse({ status: 'ready_for_review', id: 'j1' });
    expect(resp.next_step).toBe('publish-preview');
  });

  it('returns next_step publish for approved_for_publish', () => {
    const resp = createContentBridgeResponse({ status: 'approved_for_publish', id: 'j1' });
    expect(resp.next_step).toBe('publish');
  });

  it('returns next_step complete for published', () => {
    const resp = createContentBridgeResponse({ status: 'published', id: 'j1' });
    expect(resp.next_step).toBe('complete');
  });

  it('includes error from job', () => {
    const resp = createContentBridgeResponse({ status: 'failed', id: 'j1', error: 'ComfyUI offline' });
    expect(resp.error).toBe('ComfyUI offline');
  });

  it('includes logs from job', () => {
    const logs = [{ id: 'log-1', level: 'info', message: 'test' }];
    const resp = createContentBridgeResponse({ status: 'drafting', id: 'j1', logs });
    expect(resp.logs).toEqual(logs);
  });

  it('returns empty artifacts when job has no assets', () => {
    const resp = createContentBridgeResponse({ status: 'received', id: 'j1' });
    expect(resp.artifacts.image_url).toBeNull();
    expect(resp.artifacts.video_url).toBeNull();
  });
});

describe('getContentJob / listContentJobs / getContentJobByRequestId', () => {
  it('getContentJob returns null for nonexistent id', () => {
    expect(getContentJob('nonexistent')).toBeNull();
  });

  it('getContentJob returns job after creation', async () => {
    const job = createContentJobFromBridgeRequest({ idea: 'test' });
    const found = getContentJob(job.id);
    expect(found).toBeTruthy();
    expect(found.id).toBe(job.id);
  });

  it('getContentJobByRequestId returns null for empty string', () => {
    expect(getContentJobByRequestId('')).toBeNull();
  });

  it('getContentJobByRequestId returns null for null', () => {
    expect(getContentJobByRequestId(null)).toBeNull();
  });

  it('getContentJobByRequestId finds job by request_id', async () => {
    const job = createContentJobFromBridgeRequest({ idea: 'test', request_id: 'find_me' });
    const found = getContentJobByRequestId('find_me');
    expect(found).toBeTruthy();
    expect(found.id).toBe(job.id);
  });

  it('listContentJobs returns empty array when no jobs', () => {
    expect(listContentJobs()).toEqual([]);
  });

  it('listContentJobs returns jobs sorted by updatedAtMs descending', async () => {
    const j1 = createContentJobFromBridgeRequest({ idea: 'first' });
    const list = listContentJobs();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].id).toBe(j1.id);
  });

  it('upsertContentJob updates existing job', async () => {
    const job = createContentJobFromBridgeRequest({ idea: 'update test' });
    const updated = upsertContentJob({ ...job, status: 'drafting' });
    expect(updated.status).toBe('drafting');
    const found = getContentJob(job.id);
    expect(found.status).toBe('drafting');
  });
});

describe('buildContentBrief', () => {
  it('generates brief from LLM response', async () => {
    const originalMock = generateOllamaResponse;
    originalMock.mockImplementationOnce(async () => ({
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
    }));
    const job = createContentJobFromBridgeRequest({ idea: 'AI startup' });
    const brief = await buildContentBrief(job);
    expect(brief).toBeTruthy();
    expect(brief.angle).toBeTruthy();
    expect(brief.briefSource).toBe('model');
    expect(brief.briefError).toBeNull();
  });

  it('generates fallback brief when LLM fails', async () => {
    const originalMock = generateOllamaResponse;
    originalMock.mockImplementationOnce(async () => { throw new Error('LLM down'); });
    const job = createContentJobFromBridgeRequest({ idea: 'Fallback test', platform: 'twitter' });
    const brief = await buildContentBrief(job);
    expect(brief).toBeTruthy();
    expect(brief.angle).toBeTruthy();
    expect(brief.hook_options).toBeInstanceOf(Array);
    expect(brief.briefSource).toBe('fallback');
    expect(brief.briefError).toBe('LLM down');
  });

  it('generates fallback brief when LLM returns unparseable response', async () => {
    const originalMock = generateOllamaResponse;
    originalMock.mockImplementationOnce(async () => ({ response: 'not json at all', done: true }));
    const job = createContentJobFromBridgeRequest({ idea: 'Bad JSON test' });
    const brief = await buildContentBrief(job);
    expect(brief).toBeTruthy();
    expect(brief.promise).toBe('Bad JSON test');
    expect(brief.briefSource).toBe('fallback');
    expect(brief.briefError).toBe('The model reply could not be read as a brief.');
  });
});

describe('generateContentDraft', () => {
  it('generates draft from LLM response', async () => {
    const llmResponse = JSON.stringify({
      hook: 'Premium launch hook',
      caption: 'Premium caption',
      hashtags: '#test',
      visual_prompt: 'premium visual',
      storyboard: [],
      narration: 'test narration',
      platform_notes: [],
      preview_summary: 'Ready.'
    });
    const briefResponse = JSON.stringify({
      angle: 'premium',
      audience: 'founders',
      promise: 'test',
      hook_options: ['hook1'],
      asset_plan: { image: true, video: false, narration: false, publish: false },
      platform_notes: [],
      risk_notes: []
    });
    const originalMock = generateOllamaResponse;
    originalMock.mockResolvedValueOnce({ response: briefResponse, done: true });
    originalMock.mockResolvedValueOnce({ response: llmResponse, done: true });
    const job = createContentJobFromBridgeRequest({ idea: 'Draft test' });
    const result = await generateContentDraft(job);
    expect(result.draft).toBeTruthy();
    expect(result.draft.hook).toBeTruthy();
    expect(result.status).toBe('drafting');
  });

  it('uses fallback draft when LLM fails', async () => {
    const originalMock = generateOllamaResponse;
    originalMock.mockImplementationOnce(async () => { throw new Error('LLM error'); });
    originalMock.mockImplementationOnce(async () => { throw new Error('LLM error'); });
    const job = createContentJobFromBridgeRequest({ idea: 'Fallback draft', platform: 'instagram', tone: 'casual' });
    const result = await generateContentDraft(job);
    expect(result.draft).toBeTruthy();
    expect(result.draft.hook).toContain('Fallback draft');
    expect(result.draft.hashtags).toContain('#instagram');
  });

  it('marks a fallback draft as the template and says why', async () => {
    generateOllamaResponse.mockImplementationOnce(async () => { throw new Error('LLM error'); });
    generateOllamaResponse.mockImplementationOnce(async () => { throw new Error('No Ollama model is selected.'); });
    const job = createContentJobFromBridgeRequest({ idea: 'Template notice' });
    const result = await generateContentDraft(job);
    expect(result.draftSource).toBe('template');
    expect(result.draftTemplateReason).toBe('No Ollama model is selected.');
    expect(result.logs.at(-1)).toMatchObject({ level: 'warning' });
    expect(result.logs.at(-1).message).toContain('built-in template');
  });

  it('marks a model-written draft as coming from the model', async () => {
    const job = createContentJobFromBridgeRequest({ idea: 'Model draft' });
    const result = await generateContentDraft(job);
    expect(result.draftSource).toBe('model');
    expect(result.draftTemplateReason).toBeNull();
  });

  it('uses the model selected when the step runs, not the one saved with the job', async () => {
    // A job created before any model was chosen used to keep sending no
    // model, so every step failed for that job (QA Bug 19, 2026-10-21).
    const job = createContentJobFromBridgeRequest(
      { idea: 'Uses settings' },
      { settings: { endpoint: 'http://localhost:11434', selectedModel: null, unrelated: 'dropped' } }
    );
    expect(job.settings).toEqual({ endpoint: 'http://localhost:11434', selectedModel: null });
    generateOllamaResponse.mockClear();
    getConfiguredOllamaModel.mockReturnValue('picked-later:3b');
    await generateContentDraft(job);
    expect(generateOllamaResponse).toHaveBeenCalled();
    for (const [args] of generateOllamaResponse.mock.calls) {
      expect(args).toMatchObject({ endpoint: 'http://localhost:11434', model: 'picked-later:3b' });
    }
    getConfiguredOllamaModel.mockReturnValue('current-model:1b');
  });

  it('does not present a reply with no hook or caption as a model draft', async () => {
    // QA Bug 28: such a reply used to show as a finished draft with "—".
    generateOllamaResponse.mockImplementationOnce(async () => { throw new Error('brief skipped'); });
    generateOllamaResponse.mockImplementationOnce(async () => ({ response: JSON.stringify({ hashtags: [] }), done: true }));
    const job = createContentJobFromBridgeRequest({ idea: 'Hollow reply' });
    const result = await generateContentDraft(job);
    expect(result.draftSource).toBe('template');
    expect(result.draftTemplateReason).toContain('no hook or caption');
  });

  it('asks Ollama for JSON for the brief and the draft', async () => {
    generateOllamaResponse.mockClear();
    await generateContentDraft(createContentJobFromBridgeRequest({ idea: 'JSON please' }));
    expect(generateOllamaResponse.mock.calls.length).toBeGreaterThanOrEqual(2);
    for (const [args] of generateOllamaResponse.mock.calls) expect(args.format).toBe('json');
  });

  it('reports the real reason when the backend rejects with a plain string', async () => {
    // Tauri commands reject with a string, not an Error. The reason used to
    // be replaced by "The local model could not be reached" (QA Bug 18).
    generateOllamaResponse.mockRejectedValueOnce('invalid args `model` for command `ollama_generate`');
    generateOllamaResponse.mockRejectedValueOnce('invalid args `model` for command `ollama_generate`');
    const job = createContentJobFromBridgeRequest({ idea: 'String rejection' });
    const result = await generateContentDraft(job);
    expect(result.draftSource).toBe('template');
    expect(result.draftTemplateReason).toContain('invalid args `model`');
    expect(result.draftTemplateReason).not.toBe('The local model could not be reached.');
  });

  it('includes brief in output', async () => {
    const job = createContentJobFromBridgeRequest({ idea: 'With brief' });
    const result = await generateContentDraft(job);
    expect(result.brief).toBeTruthy();
  });
});

describe('generateContentImage', () => {
  it('keeps exactly one copy of the image preview on the job', async () => {
    // A real preview is several hundred KB of base64. Copied into log details,
    // artifacts and the export package it overflowed localStorage, the save
    // threw mid-pipeline, and the job vanished from the screen.
    const preview = 'UNIQUEPREVIEWMARKER'.repeat(50);
    generateComfyUiImage.mockResolvedValueOnce({
      ok: true,
      provider: 'comfyui',
      jobId: 'img-1',
      imageUrls: ['http://127.0.0.1:8188/view?filename=out.png&type=output'],
      outputPaths: ['out.png'],
      previewBase64: preview,
      rawHistory: { outputs: { 9: { images: [{ filename: 'out.png' }] } }, bulky: preview }
    });
    const job = createContentJobFromBridgeRequest({ idea: 'One preview copy' });
    job.draft = { visual_prompt: 'test prompt' };
    const result = await generateContentImage(job);

    expect(result.status).toBe('image_ready');
    expect(result.assets.image_preview_base64).toBe(preview);
    const copies = JSON.stringify(result).split(preview).length - 1;
    expect(copies).toBe(1);
  });

  it('does not throw when storage is full, and still completes the job', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key) => {
      if (key === 'alphonso_content_catalyst_jobs_v1') throw new DOMException('quota', 'QuotaExceededError');
    });
    try {
      const job = await runContentCatalystJob({ idea: 'Storage full', needs: { image: true } });
      expect(job.status).not.toBe('failed');
      expect(job.draft).toBeTruthy();
    } finally {
      setItem.mockRestore();
    }
  });

  it('returns failed status when ComfyUI fails', async () => {
    generateComfyUiImage.mockResolvedValueOnce({ ok: false, error: 'ComfyUI not running' });
    const job = createContentJobFromBridgeRequest({ idea: 'Image fail test' });
    job.draft = { visual_prompt: 'test prompt' };
    const result = await generateContentImage(job);
    expect(result.status).toBe('failed');
    expect(result.error).toBe('ComfyUI not running');
  });

  it('returns image asset on success', async () => {
    const job = createContentJobFromBridgeRequest({ idea: 'Image success test' });
    job.draft = { visual_prompt: 'premium visual' };
    const result = await generateContentImage(job);
    expect(result.status).toBe('image_ready');
    expect(result.assets.image_url).toBeTruthy();
    expect(result.assets.comfyui).toBeTruthy();
    expect(result.assets.local_media_artifacts).toHaveLength(1);
  });

  it('keeps the ComfyUI job id when the image is still being made, and says so', async () => {
    // Owner decision 2026-10-21 (QA Bug 23): an image that finishes late
    // must still reach the job.
    generateComfyUiImage.mockResolvedValueOnce({ ok: false, pending: true, jobId: 'late-1', error: 'Timed out waiting for ComfyUI image output.' });
    const job = createContentJobFromBridgeRequest({ idea: 'Slow GPU' });
    const result = await generateContentImage(job);
    expect(result.status).toBe('failed');
    expect(result.assets.comfyui_pending_prompt_id).toBe('late-1');
    expect(result.error).toContain('still working on this image');
  });

  it('picks up a late image on retry instead of starting a new one', async () => {
    checkComfyUiImage.mockResolvedValueOnce({ ok: true, provider: 'comfyui', jobId: 'late-1', outputPaths: ['late.png'], imageUrls: ['http://127.0.0.1:8188/view?filename=late.png&type=output'], previewBase64: 'TEFURQ==' });
    generateComfyUiImage.mockClear();
    const job = createContentJobFromBridgeRequest({ idea: 'Slow GPU' });
    job.assets = { image_url: null, video_url: null, narration_url: null, comfyui_pending_prompt_id: 'late-1' };
    const result = await generateContentImage(job);
    expect(checkComfyUiImage).toHaveBeenCalledWith('late-1');
    expect(generateComfyUiImage).not.toHaveBeenCalled();
    expect(result.status).toBe('image_ready');
    expect(result.assets.comfyui_pending_prompt_id).toBeNull();
    expect(result.assets.image_preview_base64).toBe('TEFURQ==');
  });
});

describe('generateContentVideo', () => {
  it('returns failed status when Runway fails', async () => {
    generateRunwayVideo.mockResolvedValueOnce({ ok: false, error: 'API key missing' });
    const job = createContentJobFromBridgeRequest({ idea: 'Video fail test' });
    job.draft = { caption: 'test caption' };
    const result = await generateContentVideo(job);
    expect(result.status).toBe('failed');
    expect(result.error).toBe('API key missing');
  });

  it('returns video asset on success', async () => {
    const job = createContentJobFromBridgeRequest({ idea: 'Video success test' });
    job.draft = { caption: 'test caption' };
    const result = await generateContentVideo(job);
    expect(result.status).toBe('video_ready');
    expect(result.assets.video_url).toBeTruthy();
  });
});

describe('generateContentNarration', () => {
  it('returns narration script', async () => {
    const job = createContentJobFromBridgeRequest({ idea: 'Narration test' });
    job.draft = { narration: 'This is the narration script.' };
    const result = await generateContentNarration(job);
    expect(result.status).toBe('narration_ready');
    expect(result.narration.narration_text).toBe('This is the narration script.');
    expect(result.narration.narration_asset_type).toBe('script');
  });

  it('falls back to caption when no narration', async () => {
    const job = createContentJobFromBridgeRequest({ idea: 'Fallback narration' });
    job.draft = { caption: 'Caption as narration' };
    const result = await generateContentNarration(job);
    expect(result.narration.narration_text).toBe('Caption as narration');
  });
});

describe('generateContentPreview', () => {
  it('returns preview with readiness flags', async () => {
    const job = createContentJobFromBridgeRequest({ idea: 'Preview test' });
    job.draft = { hook: 'Test hook', preview_summary: 'Ready for review.' };
    job.assets = { image_url: 'http://img.png', video_url: 'http://vid.mp4' };
    job.narration = { narration_text: 'Narration script' };
    const result = await generateContentPreview(job);
    expect(result.status).toBe('ready_for_review');
    expect(result.preview).toBeTruthy();
    expect(result.preview.readiness.image).toBe(true);
    expect(result.preview.readiness.video).toBe(true);
    expect(result.preview.readiness.narration).toBe(true);
  });
});

describe('publishContent', () => {
  it('returns failed when approval denied', async () => {
    requireApproval.mockResolvedValueOnce({ ok: false, error: 'approval_required' });
    const job = createContentJobFromBridgeRequest({ idea: 'Publish denied' });
    const result = await publishContent(job, { approved: false });
    expect(result.status).toBe('failed');
    expect(result.publish.ok).toBe(false);
  });

  it('returns approved_for_publish when setup_required', async () => {
    requireApproval.mockResolvedValueOnce({ ok: true });
    publishMetaContent.mockResolvedValueOnce({ ok: true, published: false, setupRequired: true });
    const job = createContentJobFromBridgeRequest({ idea: 'Setup required' });
    const result = await publishContent(job, { approved: true });
    expect(result.status).toBe('approved_for_publish');
  });

  it('returns published when meta publish succeeds', async () => {
    requireApproval.mockResolvedValueOnce({ ok: true });
    publishMetaContent.mockResolvedValueOnce({ ok: true, published: true, postIds: ['post_123'] });
    const job = createContentJobFromBridgeRequest({ idea: 'Publish success' });
    const result = await publishContent(job, { approved: true });
    expect(result.status).toBe('published');
    expect(result.publish.postIds).toEqual(['post_123']);
  });

  it('returns failed when meta publish fails', async () => {
    requireApproval.mockResolvedValueOnce({ ok: true });
    publishMetaContent.mockResolvedValueOnce({ ok: false, error: 'Auth expired' });
    const job = createContentJobFromBridgeRequest({ idea: 'Meta fail' });
    const result = await publishContent(job, { approved: true });
    expect(result.status).toBe('failed');
    expect(result.error).toBe('Auth expired');
  });

  // Phase 3a: Content Studio posts through the same path as Miya Studio (publishPost).
  it('posts a local video file as a Reel through the shared publishing path', async () => {
    requireApproval.mockResolvedValueOnce({ ok: true });
    const job = createContentJobFromBridgeRequest({ idea: 'Local reel', platform: 'instagram' });
    job.assets = { local_file_path: 'D:/Videos/reel.mp4' };
    job.draft = { caption: 'My caption' };
    const result = await publishContent(job, { approved: true });
    expect(publishMetaVideo).toHaveBeenCalledWith(expect.objectContaining({
      platform: 'instagram', localFilePath: 'D:/Videos/reel.mp4', caption: 'My caption', approved: true,
    }));
    expect(result.status).toBe('published');
    expect(result.publish).toMatchObject({ ok: true, published: true, postIds: ['reel_1'], url: 'https://www.instagram.com/reel/r1' });
  });
});

describe('publishContentPreview', () => {
  it('returns preview with export package', async () => {
    const job = createContentJobFromBridgeRequest({ idea: 'Preview export' });
    job.draft = { hook: 'Test hook' };
    job.assets = { image_url: 'http://img.png' };
    const result = await publishContentPreview(job);
    expect(result.status).toBe('ready_for_review');
    expect(result.preview).toBeTruthy();
  });
});
