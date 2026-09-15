import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../features/content-catalyst/services/contentCatalystService', () => ({
  getContentJob: vi.fn(),
  listContentJobs: vi.fn(() => []),
  upsertContentJob: vi.fn((job) => job),
}));

import {
  DEFAULT_BRAND_PROFILE,
  getBrandProfile,
  saveBrandProfile,
  mapJobToDraft,
  getContentAnalyticsSnapshot,
  getTrendResearchSuggestions,
  createBuildyCompatibleDraftPreview,
} from '../../features/content-catalyst/state/contentCatalystState';
import { getContentJob, listContentJobs, upsertContentJob } from '../../features/content-catalyst/services/contentCatalystService';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('contentCatalystState', () => {
  describe('DEFAULT_BRAND_PROFILE', () => {
    it('has brand_name as empty string', () => {
      expect(DEFAULT_BRAND_PROFILE.brand_name).toBe('');
    });

    it('has industry as empty string', () => {
      expect(DEFAULT_BRAND_PROFILE.industry).toBe('');
    });

    it('has content_pillars as empty array', () => {
      expect(DEFAULT_BRAND_PROFILE.content_pillars).toEqual([]);
    });
  });

  describe('getBrandProfile', () => {
    it('returns default profile when nothing saved', () => {
      const profile = getBrandProfile();
      expect(profile).toEqual(DEFAULT_BRAND_PROFILE);
    });

    it('returns saved profile merged with defaults', () => {
      saveBrandProfile({ brand_name: 'Acme', industry: 'Tech' });
      const profile = getBrandProfile();
      expect(profile.brand_name).toBe('Acme');
      expect(profile.industry).toBe('Tech');
      expect(profile.content_pillars).toEqual([]);
    });
  });

  describe('saveBrandProfile', () => {
    it('saves brand_name to localStorage', () => {
      saveBrandProfile({ brand_name: 'TestBrand' });
      const raw = localStorage.getItem('alphonso_content_brand_profile_v1');
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw).brand_name).toBe('TestBrand');
    });

    it('preserves content_pillars when provided', () => {
      const pillars = [{ name: 'Tech', description: 'Tech topics' }];
      const result = saveBrandProfile({ content_pillars: pillars });
      expect(result.content_pillars).toEqual(pillars);
    });

    it('defaults content_pillars to empty array when not array', () => {
      const result = saveBrandProfile({ content_pillars: 'not-an-array' });
      expect(result.content_pillars).toEqual([]);
    });

    it('merges with DEFAULT_BRAND_PROFILE', () => {
      const result = saveBrandProfile({ brand_name: 'X' });
      expect(result).toHaveProperty('industry');
      expect(result).toHaveProperty('brand_voice');
      expect(result).toHaveProperty('target_audience');
    });

    it('returns the saved profile', () => {
      const result = saveBrandProfile({ brand_name: 'ReturnTest' });
      expect(result.brand_name).toBe('ReturnTest');
    });
  });

  describe('mapJobToDraft', () => {
    it('maps a full job to draft shape', () => {
      const job = {
        id: 'job-1',
        status: 'ready_for_review',
        request: { idea: 'Test idea', platform: 'twitter', format: 'thread', tone: 'casual' },
        draft: { caption: 'Caption text', hook: 'Hook text', hashtags: '#test' },
        assets: { image_url: 'http://img.png', video_url: 'http://vid.mp4' },
        narration: { narration_text: 'Narration', audio_url: 'http://audio.mp3' },
        publish: { published: true, postIds: ['post-1'] },
      };
      const draft = mapJobToDraft(job);
      expect(draft.id).toBe('job-1');
      expect(draft.idea).toBe('Test idea');
      expect(draft.platform).toBe('twitter');
      expect(draft.caption).toBe('Caption text');
      expect(draft.hook).toBe('Hook text');
      expect(draft.image_url).toBe('http://img.png');
      expect(draft.video_url).toBe('http://vid.mp4');
      expect(draft.narration_text).toBe('Narration');
      expect(draft.narration_audio_url).toBe('http://audio.mp3');
      expect(draft.published_status).toBe('published');
      expect(draft.published_platform_post_id).toBe('post-1');
    });

    it('handles empty job with defaults', () => {
      const draft = mapJobToDraft({});
      expect(draft.id).toBeUndefined();
      expect(draft.idea).toBe('');
      expect(draft.platform).toBe('instagram');
      expect(draft.caption).toBe('');
      expect(draft.image_url).toBe('');
      expect(draft.published_status).toBe('draft');
    });

    it('sets video_status to generating when video_processing', () => {
      const draft = mapJobToDraft({ status: 'video_processing' });
      expect(draft.video_status).toBe('generating');
    });

    it('sets video_status to ready when video_url present', () => {
      const draft = mapJobToDraft({ assets: { video_url: 'http://vid.mp4' } });
      expect(draft.video_status).toBe('ready');
    });

    it('sets narration_status to script when narration_text present but no audio', () => {
      const draft = mapJobToDraft({ narration: { narration_text: 'Script text' } });
      expect(draft.narration_status).toBe('script');
    });

    it('sets narration_status to ready when audio_url present', () => {
      const draft = mapJobToDraft({ narration: { audio_url: 'http://audio.mp3' } });
      expect(draft.narration_status).toBe('ready');
    });
  });

  describe('getContentAnalyticsSnapshot', () => {
    it('returns zeroed analytics when no drafts', () => {
      listContentJobs.mockReturnValue([]);
      const snapshot = getContentAnalyticsSnapshot();
      expect(snapshot.total).toBe(0);
      expect(snapshot.ready).toBe(0);
      expect(snapshot.published).toBe(0);
      expect(snapshot.failed).toBe(0);
    });

    it('counts drafts by platform', () => {
      listContentJobs.mockReturnValue([
        { id: '1', status: 'ready_for_review', request: { platform: 'instagram' }, assets: { image_url: 'http://img.png' } },
        { id: '2', status: 'ready_for_review', request: { platform: 'twitter' }, assets: {} },
        { id: '3', status: 'failed', request: { platform: 'instagram' }, assets: {} },
      ]);
      const snapshot = getContentAnalyticsSnapshot();
      expect(snapshot.total).toBe(3);
      expect(snapshot.byPlatform.instagram).toBe(2);
      expect(snapshot.byPlatform.twitter).toBe(1);
    });
  });

  describe('getTrendResearchSuggestions', () => {
    it('returns pillar-based suggestions when pillars exist', () => {
      const profile = {
        content_pillars: [
          { name: 'Tech', description: 'Tech topics' },
          { name: 'Business', example_topics: 'Growth strategies' },
        ],
      };
      const suggestions = getTrendResearchSuggestions(profile, []);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0]).toContain('Tech');
    });

    it('returns default suggestions when no pillars', () => {
      const suggestions = getTrendResearchSuggestions({ content_pillars: [] }, []);
      expect(suggestions).toContain('Founder story angle');
      expect(suggestions).toContain('Product announcement angle');
    });

    it('appends recent draft ideas as continuations', () => {
      const drafts = [
        { idea: 'First idea' },
        { idea: 'Second idea' },
        { idea: 'Third idea' },
      ];
      const suggestions = getTrendResearchSuggestions({ content_pillars: [] }, drafts);
      expect(suggestions.some((s) => s.includes('First idea'))).toBe(true);
    });

    it('limits to 6 suggestions', () => {
      const profile = {
        content_pillars: Array.from({ length: 10 }, (_, i) => ({ name: `Pillar ${i}` })),
      };
      const suggestions = getTrendResearchSuggestions(profile, []);
      expect(suggestions.length).toBeLessThanOrEqual(6);
    });
  });

  describe('createBuildyCompatibleDraftPreview', () => {
    it('adds preview with readiness flags', () => {
      const draft = { caption: 'Test', image_url: 'http://img.png', published_status: 'draft' };
      const result = createBuildyCompatibleDraftPreview(draft);
      expect(result.preview).toBeDefined();
      expect(result.preview.readiness.image).toBe(true);
      expect(result.preview.readiness.publish).toBe(true);
    });

    it('preserves existing preview if present', () => {
      const existing = { summary: 'Custom', readiness: {} };
      const result = createBuildyCompatibleDraftPreview({ preview: existing });
      expect(result.preview).toBe(existing);
    });

    it('sets readiness false when no assets', () => {
      const result = createBuildyCompatibleDraftPreview({});
      expect(result.preview.readiness.image).toBe(false);
      expect(result.preview.readiness.video).toBe(false);
      expect(result.preview.readiness.narration).toBe(false);
    });
  });
});
