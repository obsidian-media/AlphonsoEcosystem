import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../features/content-catalyst/services/contentCatalystService', () => ({
  createContentBridgeRequest: vi.fn((p) => ({ ...p, request_id: p.request_id || null })),
  createContentBridgeResponse: vi.fn((job) => ({
    success: true,
    job_id: job.id,
    request_id: job.request_id || null,
    status: job.status,
    step: 'complete',
    progress: 1,
    artifacts: { image_url: job.assets?.image_url || '' },
  })),
  createContentJobFromBridgeRequest: vi.fn((req) => ({
    id: 'job_new_123',
    request_id: req.request_id,
    status: 'received',
    request: req,
  })),
  getContentJobByRequestId: vi.fn(() => null),
  getContentJob: vi.fn(),
  listContentJobs: vi.fn(() => []),
  upsertContentJob: vi.fn((j) => j),
  buildContentBrief: vi.fn(async (job) => ({ angle: 'test', audience: 'founders' })),
  runContentCatalystJob: vi.fn(async (req) => ({
    id: 'job_run_123',
    request_id: req.request_id,
    status: 'ready_for_review',
    assets: { image_url: 'http://img.png' },
  })),
  generateContentImage: vi.fn(async (job) => ({ ...job, assets: { ...job.assets, image_url: 'http://new-img.png' } })),
  generateContentVideo: vi.fn(async (job) => ({ ...job, assets: { ...job.assets, video_url: 'http://vid.mp4' } })),
  generateContentNarration: vi.fn(async (job) => ({ ...job, narration: { narration_text: 'Script' } })),
  generateContentPreview: vi.fn(async (job) => job),
  publishContentPreview: vi.fn(async (job) => job),
  publishContent: vi.fn(async (job) => ({ ...job, publish: { published: true } })),
}));

import {
  postContentBrief,
  postContentGenerate,
  postContentGenerateImage,
  postContentGenerateVideo,
  postContentGenerateNarration,
  postContentPublishPreview,
  postContentPublish,
  getContentStatus,
  listContentStatusJobs,
} from '../../features/content-catalyst/api/contentCatalystApi';
import {
  getContentJob,
  listContentJobs,
} from '../../features/content-catalyst/services/contentCatalystService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('contentCatalystApi', () => {
  describe('postContentBrief', () => {
    it('creates a brief and returns success', async () => {
      const result = await postContentBrief({ idea: 'Test idea', platform: 'instagram' });
      expect(result.success).toBe(true);
      expect(result.status).toBe('brief_ready');
      expect(result.next_step).toBe('generate');
      expect(result.brief).toBeDefined();
    });

    it('returns request_id when provided', async () => {
      const result = await postContentBrief({ idea: 'Test', request_id: 'req_001' });
      expect(result.request_id).toBe('req_001');
    });
  });

  describe('postContentGenerate', () => {
    it('runs the pipeline and returns bridge response', async () => {
      const result = await postContentGenerate({ idea: 'Test', platform: 'instagram' });
      expect(result.success).toBe(true);
      expect(result.job_id).toBe('job_run_123');
    });
  });

  describe('postContentGenerateImage', () => {
    it('returns job_not_found when job missing', async () => {
      getContentJob.mockReturnValue(null);
      const result = await postContentGenerateImage({ jobId: 'missing' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('job_not_found');
    });

    it('generates image and returns bridge response', async () => {
      getContentJob.mockReturnValue({ id: 'job-1', assets: {} });
      const result = await postContentGenerateImage({ jobId: 'job-1' });
      expect(result.success).toBe(true);
    });
  });

  describe('postContentGenerateVideo', () => {
    it('returns job_not_found when job missing', async () => {
      getContentJob.mockReturnValue(null);
      const result = await postContentGenerateVideo({ jobId: 'missing' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('job_not_found');
    });

    it('generates video and returns bridge response', async () => {
      getContentJob.mockReturnValue({ id: 'job-1', assets: {} });
      const result = await postContentGenerateVideo({ jobId: 'job-1' });
      expect(result.success).toBe(true);
    });
  });

  describe('postContentGenerateNarration', () => {
    it('returns job_not_found when job missing', async () => {
      getContentJob.mockReturnValue(null);
      const result = await postContentGenerateNarration({ jobId: 'missing' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('job_not_found');
    });

    it('generates narration and returns bridge response', async () => {
      getContentJob.mockReturnValue({ id: 'job-1', narration: {} });
      const result = await postContentGenerateNarration({ jobId: 'job-1' });
      expect(result.success).toBe(true);
    });
  });

  describe('postContentPublishPreview', () => {
    it('returns job_not_found when job missing', async () => {
      getContentJob.mockReturnValue(null);
      const result = await postContentPublishPreview({ jobId: 'missing' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('job_not_found');
    });
  });

  describe('postContentPublish', () => {
    it('returns job_not_found when job missing', async () => {
      getContentJob.mockReturnValue(null);
      const result = await postContentPublish({ jobId: 'missing' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('job_not_found');
    });

    it('publishes and returns bridge response', async () => {
      getContentJob.mockReturnValue({ id: 'job-1', publish: {} });
      const result = await postContentPublish({ jobId: 'job-1', approved: true });
      expect(result.success).toBe(true);
    });
  });

  describe('getContentStatus', () => {
    it('returns job_not_found when job missing', () => {
      getContentJob.mockReturnValue(null);
      const result = getContentStatus('missing');
      expect(result.success).toBe(false);
      expect(result.error).toBe('job_not_found');
    });

    it('returns bridge response for existing job', () => {
      getContentJob.mockReturnValue({ id: 'job-1', status: 'drafting' });
      const result = getContentStatus('job-1');
      expect(result.success).toBe(true);
      expect(result.job_id).toBe('job-1');
    });
  });

  describe('listContentStatusJobs', () => {
    it('returns empty array when no jobs', () => {
      listContentJobs.mockReturnValue([]);
      const result = listContentStatusJobs();
      expect(result).toEqual([]);
    });

    it('maps all jobs to bridge responses', () => {
      listContentJobs.mockReturnValue([
        { id: 'j1', status: 'drafting' },
        { id: 'j2', status: 'published' },
      ]);
      const result = listContentStatusJobs();
      expect(result).toHaveLength(2);
      expect(result[0].job_id).toBe('j1');
      expect(result[1].job_id).toBe('j2');
    });
  });
});
