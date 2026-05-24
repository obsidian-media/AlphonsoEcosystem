import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../features/content-catalyst', () => ({
  createContentBridgeRequest: vi.fn((payload) => ({ ...payload, normalized: true })),
  getContentStatus: vi.fn((jobId) => ({ success: true, job_id: jobId, status: 'ready_for_review' })),
  listContentStatusJobs: vi.fn(() => [{ job_id: 'content_1' }]),
  postContentBrief: vi.fn(async (payload) => ({ success: true, job_id: 'content_brief_1', payload })),
  postContentGenerate: vi.fn(async (payload) => ({ success: true, job_id: 'content_job_1', payload })),
  postContentGenerateImage: vi.fn(async (payload) => ({ success: true, job_id: payload.jobId, status: 'image_ready' })),
  postContentGenerateNarration: vi.fn(async (payload) => ({ success: true, job_id: payload.jobId, status: 'narration_ready' })),
  postContentGenerateVideo: vi.fn(async (payload) => ({ success: true, job_id: payload.jobId, status: 'video_ready' })),
  postContentPublishPreview: vi.fn(async (payload) => ({ success: true, job_id: payload.jobId, status: 'ready_for_review' })),
  postContentPublish: vi.fn(async (payload) => ({ success: true, job_id: payload.jobId, status: 'published' }))
}));

import {
  createAccContentCatalystBridgeRequest,
  getAccContentCatalystStatus,
  listAccContentCatalystJobs,
  submitAccContentCatalystBrief,
  submitAccContentCatalystJob,
  submitAccContentCatalystPublish
} from '../services/agentWorkshop/contentCatalystBridgeService';

beforeEach(() => {
  localStorage.clear();
});

describe('content catalyst bridge service', () => {
  it('normalizes bridge requests without duplicating the content engine', () => {
    const request = createAccContentCatalystBridgeRequest({
      idea: 'Launch',
      request_id: 'acc_900'
    });

    expect(request.normalized).toBe(true);
    expect(request.request_id).toBe('acc_900');
  });

  it('forwards brief and job requests to the content catalyst API', async () => {
    const brief = await submitAccContentCatalystBrief({
      idea: 'Launch',
      request_id: 'acc_901'
    }, {
      workspaceRoot: 'C:/tmp'
    });

    const job = await submitAccContentCatalystJob({
      idea: 'Launch',
      request_id: 'acc_901'
    }, {
      workspaceRoot: 'C:/tmp'
    });

    expect(brief.success).toBe(true);
    expect(job.success).toBe(true);
    expect(brief.payload.workspaceRoot).toBe('C:/tmp');
    expect(job.payload.workspaceRoot).toBe('C:/tmp');
  });

  it('proxies status and publish actions', async () => {
    expect(getAccContentCatalystStatus('content_55')).toEqual({
      success: true,
      job_id: 'content_55',
      status: 'ready_for_review'
    });
    expect(listAccContentCatalystJobs()).toEqual([{ job_id: 'content_1' }]);
    expect(await submitAccContentCatalystPublish('content_55', { approved: true })).toMatchObject({
      success: true,
      job_id: 'content_55',
      status: 'published'
    });
  });
});
