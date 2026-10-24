// Phase 3a: the Publish step (Marcus) schedules the posts you approved, each on its platform.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const publishPost = vi.fn();
const scheduleContentPost = vi.fn();
const scheduleContentReminder = vi.fn();
const checkDailyLimit = vi.fn();
vi.mock('../../../services/contentFactory/dailyLimits', () => ({ checkDailyLimit: (...a: unknown[]) => checkDailyLimit(...a) }));
vi.mock('../../../services/contentFactory/publishPost', () => ({ publishPost: (...a: unknown[]) => publishPost(...a) }));
vi.mock('../../../services/marcusExecutionService', () => ({
  scheduleContentPost: (...a: unknown[]) => scheduleContentPost(...a),
  scheduleContentReminder: (...a: unknown[]) => scheduleContentReminder(...a),
}));

import { executePublishStep, NO_APPROVED_POSTS } from '../../../services/contentFactory/contentPublishExecutor';
import { createProject, emptyBrief, getProject } from '../../../services/contentFactory/contentProjectService';
import { savePosts } from '../../../services/contentFactory/contentPosts';
import { getTemplate } from '../../../services/jose/joseTemplates';
import { checkPlan } from '../../../services/jose/stepGraph';
import type { ProjectPost } from '../../../services/contentFactory/contentTypes';

const NOW = new Date(2026, 9, 26, 10, 0).getTime();
const HOUR = 3_600_000;
const base = { file: 'acme/launch/output/v.mp4', title: 'Launch', caption: 'c', hashtags: [] as string[], status: 'approved' as const };
const assignmentFor = (projectId: string) => ({ agent: 'marcus', actionType: 'distribution_schedule_posts', contentStep: { projectId, step: 'publish' as const } });

function setup(posts: Partial<ProjectPost>[]): string {
  localStorage.setItem('alphonso_settings', JSON.stringify({ outputFolder: 'D:\\Content' }));
  const project = createProject('brand-1', 'Launch', { ...emptyBrief(), idea: 'x' });
  savePosts(project.id, posts.map((p, i) => ({ id: `post-${i}`, platform: 'youtube', piece: 'video', scheduledAtMs: NOW + 5 * HOUR, ...base, ...p } as ProjectPost)));
  return project.id;
}
const posts = (projectId: string) => getProject(projectId)!.posts!;

beforeEach(() => {
  localStorage.clear();
  publishPost.mockReset();
  scheduleContentPost.mockReset();
  scheduleContentReminder.mockReset();
  checkDailyLimit.mockReset().mockResolvedValue({ ok: true });
});

describe('executePublishStep', () => {
  it('uploads YouTube and Facebook now (they schedule themselves) and hands Instagram to the runner', async () => {
    const id = setup([{ platform: 'youtube' }, { platform: 'facebook', piece: 'reel' }, { platform: 'instagram', piece: 'reel' }]);
    publishPost
      .mockResolvedValueOnce({ status: 'scheduled', link: 'https://www.youtube.com/watch?v=v1', platformId: 'v1' })
      .mockResolvedValueOnce({ status: 'scheduled', link: 'https://www.facebook.com/reel/f1', platformId: 'f1' });
    const result = await executePublishStep(assignmentFor(id), NOW);
    expect(result.resultState).toBe('completed');
    expect(publishPost).toHaveBeenCalledTimes(2);
    expect(scheduleContentPost).toHaveBeenCalledWith({ projectId: id, postId: 'post-2', platform: 'instagram', scheduledAt: NOW + 5 * HOUR });
    expect(posts(id).map((p) => p.status)).toEqual(['scheduled', 'scheduled', 'scheduled']);
    expect(posts(id)[0].link).toBe('https://www.youtube.com/watch?v=v1');
    expect(result.summary).toContain('3 scheduled');
    expect((result.artifacts[0].data as { posts: unknown[] }).posts).toHaveLength(3);
  });

  it('an Instagram post whose time has passed goes out now', async () => {
    const id = setup([{ platform: 'instagram', piece: 'reel', scheduledAtMs: NOW - HOUR }]);
    publishPost.mockResolvedValue({ status: 'posted', link: 'l' });
    await executePublishStep(assignmentFor(id), NOW);
    expect(publishPost).toHaveBeenCalledTimes(1);
    expect(scheduleContentPost).not.toHaveBeenCalled();
    expect(posts(id)[0].status).toBe('posted');
  });

  it('a locked YouTube channel gets a reminder at the post time, with the Studio link', async () => {
    const id = setup([{ platform: 'youtube' }]);
    publishPost.mockResolvedValue({ status: 'locked_private', platformId: 'v1', reason: 'YouTube kept this video private …' });
    await executePublishStep(assignmentFor(id), NOW);
    expect(scheduleContentReminder).toHaveBeenCalledWith(expect.objectContaining({
      projectId: id, postId: 'post-0', scheduledAt: NOW + 5 * HOUR, message: expect.stringContaining('https://studio.youtube.com/video/v1/edit'),
    }));
    expect(posts(id)[0].status).toBe('locked_private');
  });

  it('only approved posts go: drafts and cancelled ones stay as they are', async () => {
    const id = setup([{ platform: 'youtube', status: 'draft' }, { platform: 'instagram', piece: 'reel', status: 'cancelled' }, { platform: 'facebook', piece: 'reel' }]);
    publishPost.mockResolvedValue({ status: 'scheduled' });
    await executePublishStep(assignmentFor(id), NOW);
    expect(publishPost).toHaveBeenCalledTimes(1);
    expect(posts(id).map((p) => p.status)).toEqual(['draft', 'cancelled', 'scheduled']);
  });

  it('with nothing approved, nothing is posted and it says what to do', async () => {
    const id = setup([{ platform: 'youtube', status: 'draft' }]);
    const result = await executePublishStep(assignmentFor(id), NOW);
    expect(result.resultState).toBe('failed');
    expect(result.failureReason).toBe(NO_APPROVED_POSTS);
    expect(publishPost).not.toHaveBeenCalled();
  });

  it('when every post fails, the step fails with the reasons', async () => {
    const id = setup([{ platform: 'youtube' }, { platform: 'facebook', piece: 'reel' }]);
    publishPost.mockResolvedValueOnce({ status: 'failed', reason: 'quota' }).mockResolvedValueOnce({ status: 'failed', reason: 'token' });
    const result = await executePublishStep(assignmentFor(id), NOW);
    expect(result.resultState).toBe('failed');
    expect(result.failureReason).toContain('quota');
    expect(result.failureReason).toContain('token');
  });
});

describe('executePublishStep and the daily limits', () => {
  it('a Facebook Reel over the limit waits for its time in the runner; sent posts record when', async () => {
    const id = setup([{ platform: 'facebook', piece: 'reel' }, { platform: 'youtube' }]);
    checkDailyLimit.mockImplementation(async (p: ProjectPost) => (p.platform === 'facebook'
      ? { ok: false, retryAtMs: NOW + 5 * HOUR, reason: 'Facebook allows 30 Reels in 24 hours' } : { ok: true }));
    publishPost.mockResolvedValue({ status: 'scheduled', platformId: 'v1' });
    const result = await executePublishStep(assignmentFor(id), NOW);
    expect(result.resultState).toBe('completed');
    expect(posts(id)[0]).toMatchObject({ status: 'over_limit', reason: expect.stringContaining('30 Reels') });
    expect(scheduleContentPost).toHaveBeenCalledWith({ projectId: id, postId: 'post-0', platform: 'facebook', scheduledAt: NOW + 5 * HOUR });
    expect(posts(id)[1]).toMatchObject({ status: 'scheduled', sentAtMs: NOW });
  });
});

describe('the Content video template', () => {
  it('ends with Marcus publishing, which always asks first', () => {
    const template = getTemplate('content_video')!;
    const publish = template.steps[template.steps.length - 1];
    expect(publish).toMatchObject({ stepId: 'publish', agent: 'marcus', actionType: 'distribution_schedule_posts', effects: ['publish_or_send'] });
    expect(publish.needs).toEqual(['quality', 'security']);
    expect(checkPlan(template.steps)).toEqual({ ok: true, problems: [] });
  });
});
