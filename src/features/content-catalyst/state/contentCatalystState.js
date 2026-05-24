import { createDefaultContentRequest } from '../types/contentCatalystTypes';
import { getContentJob, listContentJobs, upsertContentJob } from '../services/contentCatalystService';

const BRAND_PROFILE_KEY = 'alphonso_content_brand_profile_v1';

export const DEFAULT_BRAND_PROFILE = {
  brand_name: '',
  industry: '',
  brand_voice: '',
  content_pillars: [],
  target_audience: '',
  competitor_urls: ''
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getBrandProfile() {
  return {
    ...DEFAULT_BRAND_PROFILE,
    ...readJson(BRAND_PROFILE_KEY, DEFAULT_BRAND_PROFILE)
  };
}

export function saveBrandProfile(profile = {}) {
  const next = {
    ...DEFAULT_BRAND_PROFILE,
    ...profile,
    content_pillars: Array.isArray(profile.content_pillars) ? profile.content_pillars : []
  };
  writeJson(BRAND_PROFILE_KEY, next);
  return next;
}

export function listDraftHistory() {
  return listContentJobs().map((job) => mapJobToDraft(job));
}

export function mapJobToDraft(job = {}) {
  const request = job.request || createDefaultContentRequest();
  return {
    id: job.id,
    idea: request.idea,
    business_context: request.business_context,
    platform: request.platform,
    format: request.format,
    tone: request.tone,
    caption: job.draft?.caption || '',
    hook: job.draft?.hook || '',
    hashtags: job.draft?.hashtags || '',
    visual_prompt: job.draft?.visual_prompt || '',
    storyboard: job.draft?.storyboard || [],
    image_url: job.assets?.image_url || '',
    video_url: job.assets?.video_url || '',
    video_prompt: job.draft?.video_prompt || '',
    video_status: job.assets?.video_url ? 'ready' : (job.status === 'video_processing' ? 'generating' : 'draft'),
    narration_text: job.narration?.narration_text || job.draft?.narration || '',
    narration_audio_url: job.assets?.narration_url || job.narration?.audio_url || '',
    narration_status: job.narration?.audio_url ? 'ready' : (job.narration?.narration_text ? 'script' : 'draft'),
    status: job.status,
    published_status: job.publish?.published ? 'published' : 'draft',
    published_platform_post_id: job.publish?.postIds?.[0] || '',
    scheduled_date: job.scheduled_date || '',
    scheduled_time: job.scheduled_time || '',
    pillar: request.pillar || '',
    updatedAt: job.updatedAt || ''
  };
}

export function assignDraftSchedule(draftId, scheduledDate, scheduledTime = '09:00') {
  const job = getContentJob(draftId);
  if (!job) return null;
  const next = {
    ...job,
    scheduled_date: scheduledDate || '',
    scheduled_time: scheduledTime || ''
  };
  return upsertContentJob(next);
}

export function getContentAnalyticsSnapshot() {
  const drafts = listDraftHistory();
  const jobs = listContentJobs();
  return {
    total: drafts.length,
    ready: drafts.filter((draft) => draft.image_url && draft.published_status !== 'published').length,
    video: drafts.filter((draft) => Boolean(draft.video_url)).length,
    voice: drafts.filter((draft) => Boolean(draft.narration_audio_url || draft.narration_text)).length,
    published: drafts.filter((draft) => draft.published_status === 'published').length,
    failed: jobs.filter((job) => job.status === 'failed').length,
    byPlatform: drafts.reduce((acc, draft) => {
      const platform = draft.platform || 'unknown';
      acc[platform] = (acc[platform] || 0) + 1;
      return acc;
    }, {})
  };
}

export function getTrendResearchSuggestions(profile = getBrandProfile(), drafts = listDraftHistory()) {
  const pillars = Array.isArray(profile.content_pillars) ? profile.content_pillars : [];
  const recentIdeas = drafts.slice(0, 3).map((draft) => draft.idea).filter(Boolean);
  const base = pillars.length > 0
    ? pillars.map((pillar) => `${pillar.name || 'pillar'}: ${pillar.example_topics || pillar.description || 'Create a fresh angle around this pillar.'}`)
    : [
        'Founder story angle',
        'Product announcement angle',
        'Behind-the-scenes proof angle'
      ];

  return [...base, ...recentIdeas.map((idea) => `Build a continuation around: ${idea}`)].slice(0, 6);
}

export function createBuildyCompatibleDraftPreview(draft = {}) {
  return {
    ...draft,
    preview: draft.preview || {
      summary: draft.caption ? `Preview ready for ${draft.platform || 'instagram'}.` : 'Preview not generated yet.',
      readiness: {
        image: Boolean(draft.image_url),
        video: Boolean(draft.video_url),
        narration: Boolean(draft.narration_audio_url || draft.narration_text),
        publish: draft.published_status !== 'published'
      }
    }
  };
}
