// Phase 3a: Marcus's scheduled-post runner is the one scheduler for posts.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const publishPost = vi.fn();
const appendNotification = vi.fn();
const sendTelegramMessage = vi.fn();
const checkDailyLimit = vi.fn();
vi.mock('../../services/contentFactory/dailyLimits', () => ({ checkDailyLimit: (...a: unknown[]) => checkDailyLimit(...a) }));
vi.mock('../../services/contentFactory/publishPost', () => ({ publishPost: (...a: unknown[]) => publishPost(...a) }));
vi.mock('../../services/notificationService', () => ({ appendNotification: (...a: unknown[]) => appendNotification(...a), sendNativeNotification: vi.fn() }));
vi.mock('../../services/telegramCompanionService', () => ({ sendTelegramMessage: (...a: unknown[]) => sendTelegramMessage(...a) }));

import {
  scheduleContentPost, scheduleContentReminder, getScheduledPublishes, runScheduledPublishes, recoverScheduledPublishes,
  postOverdueNow, cancelScheduledContentPost, schedulePublish, checkSignIns,
} from '../../services/marcusExecutionService';
import { createProject, emptyBrief, getProject } from '../../services/contentFactory/contentProjectService';
import { savePosts } from '../../services/contentFactory/contentPosts';
import type { ProjectPost } from '../../services/contentFactory/contentTypes';
import { recordSignIn } from '../../services/contentFactory/signInExpiry';

const NOW = new Date(2026, 9, 26, 10, 0).getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function project(platform: ProjectPost['platform'] = 'instagram', at = NOW - 60_000): { projectId: string; postId: string } {
  localStorage.setItem('alphonso_settings', JSON.stringify({ outputFolder: 'D:\\Content' }));
  const p = createProject('brand-1', 'Launch', { ...emptyBrief(), idea: 'x' });
  const post: ProjectPost = {
    id: 'post-1', platform, piece: 'reel', file: 'acme/launch/output/v.mp4', title: 'Launch', caption: 'Hi',
    hashtags: [], scheduledAtMs: at, status: 'scheduled',
  };
  savePosts(p.id, [post]);
  return { projectId: p.id, postId: post.id };
}
const postOf = (projectId: string) => getProject(projectId)!.posts![0];

beforeEach(() => {
  localStorage.clear();
  publishPost.mockReset();
  appendNotification.mockReset();
  sendTelegramMessage.mockReset().mockResolvedValue({ ok: true });
  checkDailyLimit.mockReset().mockResolvedValue({ ok: true });
});

describe('content posts in the runner', () => {
  it('posts a due Instagram post once, saves what Instagram did, and tells you', async () => {
    const { projectId, postId } = project();
    scheduleContentPost({ projectId, postId, platform: 'instagram', scheduledAt: NOW - 60_000 });
    let release: (v: unknown) => void = () => undefined;
    publishPost.mockImplementation(() => new Promise((r) => { release = r; }));
    const first = runScheduledPublishes(NOW);
    // A second tick while the first is still sending must not send again.
    await runScheduledPublishes(NOW + 1000);
    expect(publishPost).toHaveBeenCalledTimes(1);
    expect(postOf(projectId).status).toBe('posting');
    release({ status: 'posted', link: 'https://www.instagram.com/reel/x', platformId: 'm1' });
    await first;
    expect(postOf(projectId)).toMatchObject({ status: 'posted', link: 'https://www.instagram.com/reel/x', platformId: 'm1' });
    expect(getScheduledPublishes()[0].status).toBe('done');
    expect(appendNotification).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('Posted on Instagram') }));
    expect(sendTelegramMessage).toHaveBeenCalledWith(expect.stringContaining('https://www.instagram.com/reel/x'));
  });

  it('a failure is saved with the reason and you are told', async () => {
    const { projectId, postId } = project();
    scheduleContentPost({ projectId, postId, platform: 'instagram', scheduledAt: NOW - 60_000 });
    publishPost.mockResolvedValue({ status: 'failed', reason: 'Token expired' });
    await runScheduledPublishes(NOW);
    expect(postOf(projectId)).toMatchObject({ status: 'failed', reason: 'Token expired' });
    expect(appendNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', message: expect.stringContaining('Token expired') }));
  });

  it('a post not yet due waits', async () => {
    const { projectId, postId } = project('instagram', NOW + HOUR);
    scheduleContentPost({ projectId, postId, platform: 'instagram', scheduledAt: NOW + HOUR });
    await runScheduledPublishes(NOW);
    expect(publishPost).not.toHaveBeenCalled();
  });

  it('scheduling the same post again moves it instead of adding a second', () => {
    const { projectId, postId } = project();
    scheduleContentPost({ projectId, postId, platform: 'instagram', scheduledAt: NOW + HOUR });
    scheduleContentPost({ projectId, postId, platform: 'instagram', scheduledAt: NOW + 2 * HOUR });
    const items = getScheduledPublishes().filter((i) => i.postId === postId && i.status === 'pending');
    expect(items).toHaveLength(1);
    expect(items[0].scheduledAt).toBe(NOW + 2 * HOUR);
  });

  it('a cancelled post is not sent', async () => {
    const { projectId, postId } = project();
    scheduleContentPost({ projectId, postId, platform: 'instagram', scheduledAt: NOW - 60_000 });
    cancelScheduledContentPost(postId);
    await runScheduledPublishes(NOW);
    expect(publishPost).not.toHaveBeenCalled();
  });
});

describe('when the app starts', () => {
  it('a post cut off while sending is never sent again blindly: check it', async () => {
    const { projectId, postId } = project();
    scheduleContentPost({ projectId, postId, platform: 'instagram', scheduledAt: NOW - HOUR });
    const items = getScheduledPublishes();
    items[0].status = 'posting';
    localStorage.setItem('alphonso_marcus_schedule_v1', JSON.stringify(items));
    recoverScheduledPublishes(NOW);
    await runScheduledPublishes(NOW);
    expect(publishPost).not.toHaveBeenCalled();
    expect(postOf(projectId).status).toBe('check');
    expect(postOf(projectId).reason).toContain('Instagram');
  });

  it('a post 3 days late goes out with a note that it is late', async () => {
    const { projectId, postId } = project('instagram', NOW - 3 * DAY);
    scheduleContentPost({ projectId, postId, platform: 'instagram', scheduledAt: NOW - 3 * DAY });
    publishPost.mockResolvedValue({ status: 'posted', link: 'l' });
    recoverScheduledPublishes(NOW);
    await runScheduledPublishes(NOW);
    expect(publishPost).toHaveBeenCalledTimes(1);
    expect(appendNotification).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('late') }));
  });

  it('a post more than 7 days late asks first, and goes when you say so', async () => {
    const { projectId, postId } = project('instagram', NOW - 8 * DAY);
    scheduleContentPost({ projectId, postId, platform: 'instagram', scheduledAt: NOW - 8 * DAY });
    recoverScheduledPublishes(NOW);
    await runScheduledPublishes(NOW);
    expect(publishPost).not.toHaveBeenCalled();
    expect(postOf(projectId).status).toBe('ask');
    publishPost.mockResolvedValue({ status: 'posted' });
    postOverdueNow(postId, NOW);
    await runScheduledPublishes(NOW);
    expect(publishPost).toHaveBeenCalledTimes(1);
  });
});

it("a locked YouTube video's reminder comes at its time, with the Studio link", async () => {
  const { projectId, postId } = project('youtube', NOW - 60_000);
  scheduleContentReminder({ projectId, postId, scheduledAt: NOW - 60_000, message: 'Make "Launch" public now: https://studio.youtube.com/video/v1/edit' });
  await runScheduledPublishes(NOW);
  expect(publishPost).not.toHaveBeenCalled();
  expect(sendTelegramMessage).toHaveBeenCalledWith(expect.stringContaining('https://studio.youtube.com/video/v1/edit'));
  expect(getScheduledPublishes()[0].status).toBe('done');
});

it('text items still go through executeMarcusPublish as before', async () => {
  schedulePublish({ content: 'Hello', platform: 'telegram', scheduledAt: NOW - 1000, agentId: 'marcus' });
  await runScheduledPublishes(NOW);
  expect(getScheduledPublishes()[0].status).toBe('executed');
  expect(publishPost).not.toHaveBeenCalled();
});

// Final review: the store keeps 100 items; trimming must never drop a post still to go out.
it('keeps every post still waiting when the store is trimmed', () => {
  const { projectId, postId } = project('instagram', NOW + 30 * DAY);
  scheduleContentPost({ projectId, postId, platform: 'instagram', scheduledAt: NOW + 30 * DAY });
  const items = getScheduledPublishes();
  for (let i = 0; i < 150; i += 1) items.push({ ...items[0], id: `old-${i}`, kind: 'text', postId: undefined, status: 'executed' });
  localStorage.setItem('alphonso_marcus_schedule_v1', JSON.stringify(items));
  schedulePublish({ content: 'Hello', platform: 'telegram', scheduledAt: NOW, agentId: 'marcus' });
  const kept = getScheduledPublishes();
  expect(kept.find((i) => i.postId === postId)?.status).toBe('pending');
  expect(kept.length).toBeLessThanOrEqual(101);
});

// Phase 3b: a sign-in running out is told once a day, in the app and on Telegram.
it('warns about a sign-in running out once a day', async () => {
  recordSignIn('youtube', NOW - 6 * DAY);
  await checkSignIns(NOW);
  await checkSignIns(NOW + HOUR);
  expect(appendNotification).toHaveBeenCalledTimes(1);
  expect(appendNotification).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('YouTube sign-in') }));
  expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
  await checkSignIns(NOW + DAY);
  expect(appendNotification).toHaveBeenCalledTimes(2);
});

// Phase 3b: over the daily limit, a post waits and goes when there is room.
it('a post over the daily limit waits, then goes at its retry time', async () => {
  const { projectId, postId } = project();
  scheduleContentPost({ projectId, postId, platform: 'instagram', scheduledAt: NOW - 60_000 });
  checkDailyLimit.mockResolvedValueOnce({ ok: false, retryAtMs: NOW + HOUR, reason: "Instagram's daily limit is reached" });
  await runScheduledPublishes(NOW);
  expect(publishPost).not.toHaveBeenCalled();
  expect(postOf(projectId)).toMatchObject({ status: 'over_limit', reason: expect.stringContaining('daily limit') });
  expect(getScheduledPublishes()[0]).toMatchObject({ status: 'pending', scheduledAt: NOW + HOUR });
  publishPost.mockResolvedValue({ status: 'posted' });
  await runScheduledPublishes(NOW + HOUR);
  expect(publishPost).toHaveBeenCalledTimes(1);
  expect(postOf(projectId)).toMatchObject({ status: 'posted', sentAtMs: NOW + HOUR });
});
