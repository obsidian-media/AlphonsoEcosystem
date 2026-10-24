// Phase 3b: the one way a post is moved or cancelled; on the platform when it is there.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const rescheduleYouTubeVideo = vi.fn();
const rescheduleMetaVideo = vi.fn();
const cancelMetaVideo = vi.fn();
const scheduleContentPost = vi.fn();
const cancelScheduledContentPost = vi.fn();
const appendConnectorAudit = vi.fn();
vi.mock('../../../services/connectors/connectorOutbound', () => ({ rescheduleYouTubeVideo: (...a: unknown[]) => rescheduleYouTubeVideo(...a) }));
vi.mock('../../../services/metaPublishService', () => ({
  rescheduleMetaVideo: (...a: unknown[]) => rescheduleMetaVideo(...a),
  cancelMetaVideo: (...a: unknown[]) => cancelMetaVideo(...a),
}));
vi.mock('../../../services/marcusExecutionService', () => ({
  scheduleContentPost: (...a: unknown[]) => scheduleContentPost(...a),
  cancelScheduledContentPost: (...a: unknown[]) => cancelScheduledContentPost(...a),
}));
vi.mock('../../../services/connectorRegistryService', () => ({ appendConnectorAudit: (...a: unknown[]) => appendConnectorAudit(...a) }));

import { movePost, cancelProjectPost, moveToDay, moveToSlot } from '../../../services/contentFactory/contentPostMoves';
import { createProject, emptyBrief, getProject } from '../../../services/contentFactory/contentProjectService';
import { savePosts } from '../../../services/contentFactory/contentPosts';
import type { ProjectPost } from '../../../services/contentFactory/contentTypes';

const NOW = new Date(2026, 9, 26, 10, 0).getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function withPost(patch: Partial<ProjectPost>): { projectId: string; postId: string } {
  const p = createProject('brand-1', 'Launch', { ...emptyBrief(), idea: 'x' });
  savePosts(p.id, [{
    id: 'p1', platform: 'instagram', piece: 'reel', file: 'f', title: 'Launch', caption: 'c', hashtags: [],
    scheduledAtMs: NOW + 2 * DAY, status: 'draft', ...patch,
  }]);
  return { projectId: p.id, postId: 'p1' };
}
const post = (projectId: string) => getProject(projectId)!.posts![0];

beforeEach(() => {
  localStorage.clear();
  [rescheduleYouTubeVideo, rescheduleMetaVideo, cancelMetaVideo, scheduleContentPost, cancelScheduledContentPost, appendConnectorAudit].forEach((f) => f.mockReset());
});

describe('movePost', () => {
  it('a draft moves at once', async () => {
    const { projectId, postId } = withPost({});
    expect(await movePost(projectId, postId, NOW + 3 * DAY, NOW)).toEqual({ ok: true });
    expect(post(projectId).scheduledAtMs).toBe(NOW + 3 * DAY);
  });

  it("a scheduled Instagram post moves, and so does Marcus's send", async () => {
    const { projectId, postId } = withPost({ status: 'scheduled' });
    await movePost(projectId, postId, NOW + 3 * DAY, NOW);
    expect(scheduleContentPost).toHaveBeenCalledWith({ projectId, postId, platform: 'instagram', scheduledAt: NOW + 3 * DAY });
  });

  it('a post waiting for the daily limit moves, and so does its send', async () => {
    const { projectId, postId } = withPost({ platform: 'facebook', status: 'over_limit' });
    expect(await movePost(projectId, postId, NOW + 3 * DAY, NOW)).toEqual({ ok: true });
    expect(scheduleContentPost).toHaveBeenCalledWith({ projectId, postId, platform: 'facebook', scheduledAt: NOW + 3 * DAY });
  });

  it('a YouTube post scheduled on YouTube moves only after YouTube keeps the new time, and is recorded', async () => {
    const { projectId, postId } = withPost({ platform: 'youtube', piece: 'video', status: 'scheduled', platformId: 'v1' });
    rescheduleYouTubeVideo.mockResolvedValue({ ok: true, publishAt: new Date(NOW + 3 * DAY).toISOString() });
    expect(await movePost(projectId, postId, NOW + 3 * DAY, NOW)).toEqual({ ok: true });
    expect(rescheduleYouTubeVideo).toHaveBeenCalledWith({ videoId: 'v1', publishAt: new Date(NOW + 3 * DAY).toISOString() });
    expect(post(projectId).scheduledAtMs).toBe(NOW + 3 * DAY);
    expect(appendConnectorAudit).toHaveBeenCalledWith('youtube', 'post_moved', expect.objectContaining({ postId, fromMs: NOW + 2 * DAY, toMs: NOW + 3 * DAY, ok: true }));
  });

  it('when Facebook refuses, the post keeps its time and says why, with where to do it', async () => {
    const { projectId, postId } = withPost({ platform: 'facebook', status: 'scheduled', platformId: '123' });
    rescheduleMetaVideo.mockResolvedValue({ ok: false, reason: 'Unsupported request', manageUrl: 'https://business.facebook.com/latest/content_calendar' });
    const result = await movePost(projectId, postId, NOW + 3 * DAY, NOW);
    expect(result).toEqual({ ok: false, reason: 'Unsupported request', manageUrl: 'https://business.facebook.com/latest/content_calendar' });
    expect(post(projectId).scheduledAtMs).toBe(NOW + 2 * DAY);
  });

  it('a post that has gone out cannot be moved', async () => {
    for (const status of ['posted', 'posting', 'check', 'cancelled'] as const) {
      localStorage.clear();
      const { projectId, postId } = withPost({ status });
      const result = await movePost(projectId, postId, NOW + 3 * DAY, NOW);
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/already/);
    }
  });

  it('a time in the past is refused; YouTube and Facebook also need 15 minutes', async () => {
    const draft = withPost({});
    expect((await movePost(draft.projectId, draft.postId, NOW - HOUR, NOW)).reason).toMatch(/past/);
    localStorage.clear();
    const yt = withPost({ platform: 'youtube', piece: 'video', status: 'scheduled', platformId: 'v1' });
    expect((await movePost(yt.projectId, yt.postId, NOW + 10 * 60_000, NOW)).reason).toMatch(/15 minutes/);
    expect(rescheduleYouTubeVideo).not.toHaveBeenCalled();
  });

  it('a second move while the first is still on its way is ignored', async () => {
    const { projectId, postId } = withPost({ platform: 'youtube', piece: 'video', status: 'scheduled', platformId: 'v1' });
    let release: (v: unknown) => void = () => undefined;
    rescheduleYouTubeVideo.mockImplementation(() => new Promise((r) => { release = r; }));
    const first = movePost(projectId, postId, NOW + 3 * DAY, NOW);
    expect(await movePost(projectId, postId, NOW + 4 * DAY, NOW)).toEqual({ ok: false, reason: 'Moving…' });
    release({ ok: true });
    await first;
    expect(rescheduleYouTubeVideo).toHaveBeenCalledTimes(1);
  });
});

describe('moveToDay and moveToSlot', () => {
  it('keeps the local time of day, across a clock change', () => {
    const at = new Date(2026, 9, 24, 18, 0).getTime();
    const sunday = new Date(2026, 9, 25).getTime();
    const later = new Date(2026, 10, 2).getTime();
    expect(new Date(moveToDay(at, sunday)).getHours()).toBe(18);
    expect(new Date(moveToDay(at, later)).getHours()).toBe(18);
    expect(new Date(moveToDay(at, later)).getDate()).toBe(2);
  });

  it('moveToSlot sets the hour and minute on the day', () => {
    const t = new Date(moveToSlot(new Date(2026, 10, 3).getTime(), 9, 30));
    expect([t.getDate(), t.getHours(), t.getMinutes()]).toEqual([3, 9, 30]);
  });
});

describe('cancelProjectPost', () => {
  it("an Instagram post is cancelled with Marcus's send", async () => {
    const { projectId, postId } = withPost({ status: 'scheduled' });
    expect((await cancelProjectPost(projectId, postId)).ok).toBe(true);
    expect(post(projectId).status).toBe('cancelled');
    expect(cancelScheduledContentPost).toHaveBeenCalledWith(postId);
  });

  it('a YouTube video loses its schedule and stays private', async () => {
    const { projectId, postId } = withPost({ platform: 'youtube', piece: 'video', status: 'scheduled', platformId: 'v1' });
    rescheduleYouTubeVideo.mockResolvedValue({ ok: true, publishAt: null, privacyStatus: 'private' });
    expect((await cancelProjectPost(projectId, postId)).ok).toBe(true);
    expect(rescheduleYouTubeVideo).toHaveBeenCalledWith({ videoId: 'v1', publishAt: null });
    expect(post(projectId)).toMatchObject({ status: 'cancelled', reason: expect.stringContaining('private') });
  });

  it('a Facebook Reel is cancelled on Meta; a refusal leaves it as it was', async () => {
    const { projectId, postId } = withPost({ platform: 'facebook', status: 'scheduled', platformId: '123' });
    cancelMetaVideo.mockResolvedValueOnce({ ok: false, reason: 'already gone out', manageUrl: 'm' });
    expect(await cancelProjectPost(projectId, postId)).toEqual({ ok: false, reason: 'already gone out', manageUrl: 'm' });
    expect(post(projectId).status).toBe('scheduled');
    cancelMetaVideo.mockResolvedValueOnce({ ok: true });
    expect((await cancelProjectPost(projectId, postId)).ok).toBe(true);
    expect(post(projectId).status).toBe('cancelled');
  });
});

// Phase 3c: a Facebook carousel is a Page photo post, not a Reel.
it("a Facebook carousel moves and cancels with kind 'post'", async () => {
  const { projectId, postId } = withPost({ platform: 'facebook', piece: 'carousel', status: 'scheduled', platformId: '1_2' });
  rescheduleMetaVideo.mockResolvedValue({ ok: true, scheduledAtMs: NOW + 3 * DAY });
  expect((await movePost(projectId, postId, NOW + 3 * DAY, NOW)).ok).toBe(true);
  expect(rescheduleMetaVideo).toHaveBeenCalledWith({ videoId: '1_2', scheduledAtMs: NOW + 3 * DAY, kind: 'post' });
  cancelMetaVideo.mockResolvedValue({ ok: true });
  expect((await cancelProjectPost(projectId, postId)).ok).toBe(true);
  expect(cancelMetaVideo).toHaveBeenCalledWith({ videoId: '1_2', kind: 'post' });
});
