// Phase 4a: a post's numbers at fixed checkpoints, saved on the post.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock('../../../services/metaPublishService', () => ({ savedMetaCredentials: () => ({}) }));
vi.mock('../../../services/contentFactory/instagramRoute', () => ({ getInstagramRoute: async () => 'page' }));
vi.mock('../../../features/content-catalyst/services/contentCatalystService', () => ({ listContentJobs: () => jobs }));
let jobs: unknown[] = [];

import {
  CHECKPOINT_MS, dueCheckpoint, readDueMetrics, refreshPostMetrics, needsPermission, clearNeedsPermission,
  onSevenDays, measurablePosts, contentStudioMetrics,
} from '../../../services/contentFactory/postMetrics';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { createProject, emptyBrief, getProject } from '../../../services/contentFactory/contentProjectService';
import { savePosts } from '../../../services/contentFactory/contentPosts';
import type { ProjectPost } from '../../../services/contentFactory/contentTypes';

const NOW = Date.UTC(2026, 9, 24, 12);
const H = 3600e3;
const post = (patch: Partial<ProjectPost> = {}): ProjectPost => ({
  id: 'p1', platform: 'instagram', piece: 'reel', file: 'f', title: 'T', caption: '', hashtags: [],
  scheduledAtMs: NOW - 2 * H, status: 'posted', platformId: '1789', sentAtMs: NOW - 2 * H, ...patch,
});

function project(posts: ProjectPost[]) {
  const b = saveBrand({ name: 'Acme' });
  const p = createProject(b.id, 'P', emptyBrief());
  savePosts(p.id, posts);
  return p.id;
}
const saved = (projectId: string, postId = 'p1') => getProject(projectId)!.posts!.find((x) => x.id === postId)!;
const reads = () => invoke.mock.calls.filter((c) => c[0] === 'content_read_metrics');

beforeEach(() => {
  localStorage.clear();
  jobs = [];
  invoke.mockReset();
  invoke.mockImplementation(async (cmd: string) => (cmd === 'content_read_metrics'
    ? { ok: true, values: { views: 900, reach: 700 }, unavailable: ['saves'] }
    : { ok: true }));
});

describe('dueCheckpoint', () => {
  it('checkpoints come due one at a time', () => {
    expect(CHECKPOINT_MS).toEqual({ '1h': H, '1d': 24 * H, '7d': 7 * 24 * H, '30d': 30 * 24 * H });
    expect(dueCheckpoint(post(), NOW)).toBe('1h');
    expect(dueCheckpoint(post({ sentAtMs: NOW - 9 * 24 * H }), NOW)).toBe('7d');
    expect(dueCheckpoint(post({ sentAtMs: NOW - 30 * 60e3 }), NOW)).toBeNull();
    expect(dueCheckpoint(post({ metrics: { readings: { '1h': { readAtMs: NOW, values: {}, unavailable: [] } } } }), NOW)).toBeNull();
    expect(dueCheckpoint(post({ sentAtMs: NOW - 40 * 24 * H, metrics: { readings: { '30d': { readAtMs: NOW, values: {}, unavailable: [] } } } }), NOW)).toBeNull();
    expect(dueCheckpoint(post({ metrics: { readings: {}, removed: true } }), NOW)).toBeNull();
    expect(dueCheckpoint(post({ platformId: undefined }), NOW)).toBeNull();
    expect(dueCheckpoint(post({ status: 'by_hand' as ProjectPost['status'] }), NOW)).toBeNull();
  });

  it('a post scheduled on the platform counts from its publish time', () => {
    expect(dueCheckpoint(post({ status: 'scheduled', sentAtMs: NOW - 5 * H, scheduledAtMs: NOW - 30 * 60e3 }), NOW)).toBeNull();
  });

  it('a temporary refusal waits an hour', () => {
    expect(dueCheckpoint(post({ metrics: { readings: {}, retryAfterMs: NOW + 1000 } }), NOW)).toBeNull();
  });
});

describe('readDueMetrics', () => {
  it('due numbers are read and saved on the post', async () => {
    const id = project([post()]);
    expect(await readDueMetrics(NOW)).toBe(1);
    expect(reads()[0][1]).toMatchObject({ request: { platform: 'instagram', piece: 'reel', platformId: '1789', instagramRoute: 'page', sinceDate: '2026-10-24', untilDate: '2026-10-24' } });
    expect(saved(id).metrics?.readings['1h']).toEqual({ readAtMs: NOW, values: { views: 900, reach: 700 }, unavailable: ['saves'] });
  });

  it('at most three posts per call', async () => {
    project([post({ id: 'a' }), post({ id: 'b' }), post({ id: 'c' }), post({ id: 'd' })]);
    expect(await readDueMetrics(NOW)).toBe(3);
  });

  it('a long absence fetches one checkpoint, not four', async () => {
    const id = project([post({ sentAtMs: NOW - 40 * 24 * H })]);
    await readDueMetrics(NOW);
    expect(reads()).toHaveLength(1);
    expect(Object.keys(saved(id).metrics!.readings)).toEqual(['30d']);
  });

  it('a permission refusal marks only that service', async () => {
    const id = project([post({ id: 'yt', platform: 'youtube', piece: 'video', platformId: 'abc' }), post({ id: 'ig' })]);
    invoke.mockImplementation(async (cmd: string, args: { request?: { platform: string } }) => (cmd === 'content_read_metrics'
      ? (args.request?.platform === 'youtube' ? { ok: false, values: {}, unavailable: [], problem: 'permission' } : { ok: true, values: { views: 5 }, unavailable: [] })
      : { ok: true }));
    await readDueMetrics(NOW);
    expect(needsPermission()).toEqual({ youtube: true });
    expect(saved(id, 'ig').metrics?.readings['1h']?.values.views).toBe(5);
    expect(saved(id, 'yt').metrics?.readings['1h']).toBeUndefined();
    clearNeedsPermission('youtube');
    expect(needsPermission()).toEqual({});
  });

  it('a removed post gets no more checkpoints; a temporary refusal retries in an hour', async () => {
    const id = project([post({ id: 'gone' }), post({ id: 'busy' })]);
    invoke.mockImplementation(async (cmd: string, args: { request?: { platformId: string } }) => (cmd !== 'content_read_metrics' ? { ok: true }
      : { ok: false, values: {}, unavailable: [], problem: 'removed' }));
    await readDueMetrics(NOW, 1);
    expect(saved(id, 'gone').metrics?.removed).toBe(true);
    invoke.mockImplementation(async (cmd: string) => (cmd !== 'content_read_metrics' ? { ok: true } : { ok: false, values: {}, unavailable: [], problem: 'temporary' }));
    await readDueMetrics(NOW, 1);
    expect(saved(id, 'busy').metrics?.retryAfterMs).toBe(NOW + H);
  });

  it("the 7-day reading tells who's listening", async () => {
    const id = project([post({ sentAtMs: NOW - 8 * 24 * H })]);
    const seen: string[] = [];
    const stop = onSevenDays((projectId, postId) => { seen.push(`${projectId}:${postId}`); });
    await readDueMetrics(NOW);
    stop();
    expect(seen).toEqual([`${id}:p1`]);
  });

  it("Content Studio's posts are measured too, by their job", async () => {
    jobs = [{ id: 'job1', publish: { platform: 'facebook', published: true, postIds: ['55'], sentAtMs: NOW - 2 * H } }];
    expect(measurablePosts().map((m) => m.post.id)).toEqual(['job1']);
    await readDueMetrics(NOW);
    expect(contentStudioMetrics('job1')?.readings['1h']?.values.views).toBe(900);
  });
});

describe('refused reads', () => {
  it('a refusal for permission waits an hour and a refusal for anything else a day, so other posts get their turn', async () => {
    const id = project([post({ id: 'perm', platformId: 'perm' }), post({ id: 'odd', platformId: 'odd' }), post({ id: 'fine', platformId: 'fine' })]);
    invoke.mockImplementation(async (cmd: string, args: { request?: { platformId: string } }) => {
      if (cmd !== 'content_read_metrics') return { ok: true };
      if (args.request?.platformId === 'perm') return { ok: false, values: {}, unavailable: [], problem: 'permission' };
      if (args.request?.platformId === 'odd') return { ok: false, values: {}, unavailable: [], problem: 'other' };
      return { ok: true, values: { views: 1 }, unavailable: [] };
    });
    await readDueMetrics(NOW, 2);
    expect(saved(id, 'perm').metrics?.retryAfterMs).toBe(NOW + H);
    expect(saved(id, 'odd').metrics?.retryAfterMs).toBe(NOW + 24 * H);
    invoke.mockClear();
    await readDueMetrics(NOW + 60e3, 2);
    expect(reads().map((c) => c[1].request.platformId)).toEqual(['fine']);
  });
});

describe('refreshPostMetrics', () => {
  it('Refresh is limited to once per 10 minutes', async () => {
    const id = project([post()]);
    expect((await refreshPostMetrics(id, 'p1', NOW)).ok).toBe(true);
    const again = await refreshPostMetrics(id, 'p1', NOW + 5 * 60e3);
    expect(again).toEqual({ ok: false, reason: 'Refreshed a moment ago; try again in a few minutes.' });
    expect((await refreshPostMetrics(id, 'p1', NOW + 11 * 60e3)).ok).toBe(true);
    expect(reads()).toHaveLength(2);
  });
});
