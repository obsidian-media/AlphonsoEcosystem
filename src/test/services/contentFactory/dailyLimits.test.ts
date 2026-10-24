// Phase 3b: a post that would go over Instagram's or Facebook's daily limit waits instead of failing.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const instagramPublishingLimit = vi.fn();
vi.mock('../../../services/metaPublishService', () => ({ instagramPublishingLimit: (...a: unknown[]) => instagramPublishingLimit(...a) }));

import { checkDailyLimit, FACEBOOK_DAILY_LIMIT } from '../../../services/contentFactory/dailyLimits';
import { createProject, emptyBrief } from '../../../services/contentFactory/contentProjectService';
import { savePosts } from '../../../services/contentFactory/contentPosts';
import type { ProjectPost } from '../../../services/contentFactory/contentTypes';

const NOW = new Date(2026, 9, 26, 10, 0).getTime();
const HOUR = 3_600_000;
const post = (patch: Partial<ProjectPost>): ProjectPost => ({
  id: 'p', platform: 'instagram', piece: 'reel', file: 'f', title: 'T', caption: '', hashtags: [], scheduledAtMs: NOW, status: 'approved', ...patch,
});

beforeEach(() => { localStorage.clear(); instagramPublishingLimit.mockReset(); });

describe('Instagram', () => {
  it('waits an hour when no posts are left today', async () => {
    instagramPublishingLimit.mockResolvedValue(0);
    const result = await checkDailyLimit(post({}), NOW);
    expect(result).toEqual({ ok: false, retryAtMs: NOW + HOUR, reason: expect.stringContaining("Instagram's daily limit") });
  });
  it('goes when there is room, or when Instagram does not say', async () => {
    instagramPublishingLimit.mockResolvedValueOnce(5);
    expect(await checkDailyLimit(post({}), NOW)).toEqual({ ok: true });
    instagramPublishingLimit.mockResolvedValueOnce(null);
    expect(await checkDailyLimit(post({}), NOW)).toEqual({ ok: true });
  });
});

describe('Facebook', () => {
  function sent(count: number, firstAgoMs: number) {
    const p = createProject('b', 'X', { ...emptyBrief(), idea: 'x' });
    savePosts(p.id, Array.from({ length: count }, (_, i) => post({
      id: `f${i}`, platform: 'facebook', status: 'scheduled', sentAtMs: NOW - firstAgoMs + i * 60_000,
    })));
  }
  it(`allows the ${FACEBOOK_DAILY_LIMIT}th Reel in 24 hours`, async () => {
    sent(FACEBOOK_DAILY_LIMIT - 1, 10 * HOUR);
    expect(await checkDailyLimit(post({ id: 'new', platform: 'facebook' }), NOW)).toEqual({ ok: true });
  });
  it('the next one waits until the oldest is 24 hours old', async () => {
    sent(FACEBOOK_DAILY_LIMIT, 10 * HOUR);
    const result = await checkDailyLimit(post({ id: 'new', platform: 'facebook' }), NOW);
    expect(result).toEqual({ ok: false, retryAtMs: NOW - 10 * HOUR + 24 * HOUR, reason: expect.stringContaining('30 Reels in 24 hours') });
  });
  it('Reels sent more than 24 hours ago do not count', async () => {
    sent(FACEBOOK_DAILY_LIMIT, 30 * HOUR);
    expect(await checkDailyLimit(post({ id: 'new', platform: 'facebook' }), NOW)).toEqual({ ok: true });
  });
});

it('YouTube has no limit here', async () => {
  expect(await checkDailyLimit(post({ platform: 'youtube', piece: 'video' }), NOW)).toEqual({ ok: true });
  expect(instagramPublishingLimit).not.toHaveBeenCalled();
});
