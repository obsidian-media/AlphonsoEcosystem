// A post's real numbers (content factory phase 4a), read at fixed checkpoints after it
// goes out — 1 hour, 1 day, 7 days and 30 days — then never again. Marcus's runner calls
// readDueMetrics() every minute while the app is open; only the latest checkpoint that has
// passed is read, so a long time away costs one call per post, not four. The backend
// (`content_read_metrics`) talks to YouTube and Meta with the saved keys.
import { invoke } from '@tauri-apps/api/core';
import { getConnectorCredential } from '../connectors/connectorAuth';
import { savedMetaCredentials } from '../metaPublishService';
import { listContentJobs } from '../../features/content-catalyst/services/contentCatalystService';
import { getInstagramRoute } from './instagramRoute';
import { getProject, listProjects } from './contentProjectService';
import { updatePost } from './contentPosts';
import type { Checkpoint, MetricsReading, PostMetrics, ProjectPost } from './contentTypes';

const H = 3600e3;
export const CHECKPOINT_MS: Record<Checkpoint, number> = { '1h': H, '1d': 24 * H, '7d': 7 * 24 * H, '30d': 30 * 24 * H };
const ORDER: Checkpoint[] = ['1h', '1d', '7d', '30d'];
export const REFRESH_WAIT_MS = 10 * 60e3;
export const REFRESHED_RECENTLY = 'Refreshed a moment ago; try again in a few minutes.';
const PERMISSIONS_KEY = 'alphonso_metrics_permissions_v1';
const STUDIO_KEY = 'alphonso_content_studio_metrics_v1';
const MEASURED: ProjectPost['status'][] = ['posted', 'scheduled'];

export type MetricsService = 'youtube' | 'meta' | 'instagram';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

/** When the post went live: a post scheduled on the platform counts from its publish time. */
function liveAtMs(post: ProjectPost): number | null {
  if (!post.sentAtMs) return null;
  return post.status === 'scheduled' ? Math.max(post.sentAtMs, post.scheduledAtMs) : post.sentAtMs;
}

/** The checkpoint to read now: the latest that has passed, if it has no reading yet. */
export function dueCheckpoint(post: ProjectPost, nowMs: number): Checkpoint | null {
  if (!post.platformId || !MEASURED.includes(post.status)) return null;
  const metrics = post.metrics;
  if (metrics?.removed) return null;
  if (metrics?.retryAfterMs && nowMs < metrics.retryAfterMs) return null;
  const live = liveAtMs(post);
  if (live === null) return null;
  const passed = ORDER.filter((c) => live + CHECKPOINT_MS[c] <= nowMs);
  const latest = passed[passed.length - 1];
  if (!latest) return null;
  return metrics?.readings?.[latest] ? null : latest;
}

export interface MeasurablePost { projectId: string | null; brandId: string | null; post: ProjectPost }

/** Content Studio's posts, measured by their job (stored apart from the factory's posts). */
export function contentStudioMetrics(jobId: string): PostMetrics | undefined {
  return readJson<Record<string, PostMetrics>>(STUDIO_KEY, {})[jobId];
}

/** Every post Alphonso put on a platform and has an id for. */
export function measurablePosts(): MeasurablePost[] {
  const out: MeasurablePost[] = [];
  for (const project of listProjects()) {
    for (const post of project.posts || []) {
      if (post.platformId && post.sentAtMs && MEASURED.includes(post.status)) out.push({ projectId: project.id, brandId: project.brandId, post });
    }
  }
  for (const job of (listContentJobs() || []) as { id: string; publish?: { platform?: string; published?: boolean; postIds?: string[]; sentAtMs?: number } }[]) {
    const publish = job.publish;
    const platformId = publish?.postIds?.[0];
    if (!publish?.published || !platformId || !publish.sentAtMs) continue;
    const platform = publish.platform === 'youtube' ? 'youtube' : publish.platform === 'instagram' ? 'instagram' : 'facebook';
    out.push({
      projectId: null, brandId: null,
      post: {
        id: job.id, platform, piece: platform === 'youtube' ? 'video' : 'reel', file: '', title: '', caption: '', hashtags: [],
        scheduledAtMs: publish.sentAtMs, sentAtMs: publish.sentAtMs, status: 'posted', platformId, metrics: contentStudioMetrics(job.id),
      },
    });
  }
  return out;
}

export function needsPermission(): Partial<Record<MetricsService, boolean>> {
  return readJson<Partial<Record<MetricsService, boolean>>>(PERMISSIONS_KEY, {});
}
export function markNeedsPermission(service: MetricsService): void {
  writeJson(PERMISSIONS_KEY, { ...needsPermission(), [service]: true });
}
/** After a new sign-in with the reading permissions. */
export function clearNeedsPermission(service: MetricsService): void {
  const next = { ...needsPermission() };
  delete next[service];
  writeJson(PERMISSIONS_KEY, next);
}

type SevenDaysListener = (projectId: string, postId: string) => void;
const sevenDayListeners = new Set<SevenDaysListener>();
/** Called after a factory post's 7-day reading is saved (lessons and ideas listen). */
export function onSevenDays(listener: SevenDaysListener): () => void {
  sevenDayListeners.add(listener);
  return () => { sevenDayListeners.delete(listener); };
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

interface ReadResult { ok: boolean; values?: Record<string, number>; unavailable?: string[]; problem?: 'permission' | 'removed' | 'temporary' | 'other' }

async function readNow(post: ProjectPost, nowMs: number): Promise<{ result: ReadResult; service: MetricsService }> {
  const route = post.platform === 'instagram' ? (await getInstagramRoute()) || 'page' : null;
  const service: MetricsService = post.platform === 'youtube' ? 'youtube' : route === 'instagram_login' ? 'instagram' : 'meta';
  const request = {
    platform: post.platform, piece: post.piece, platformId: post.platformId,
    ...(route ? { instagramRoute: route } : {}),
    sinceDate: day(liveAtMs(post) || nowMs), untilDate: day(nowMs),
    ...(post.platform === 'youtube'
      ? { youtubeOauth: {
        clientId: getConnectorCredential('youtube', 'YOUTUBE_CLIENT_ID') || null,
        clientSecret: getConnectorCredential('youtube', 'YOUTUBE_CLIENT_SECRET') || null,
        refreshToken: getConnectorCredential('youtube', 'YOUTUBE_REFRESH_TOKEN') || null,
      } }
      : { credentials: savedMetaCredentials() }),
  };
  try {
    return { result: (await invoke<ReadResult>('content_read_metrics', { request })) || { ok: false, problem: 'other' }, service };
  } catch {
    return { result: { ok: false, problem: 'temporary' }, service };
  }
}

function saveMetrics(target: MeasurablePost, metrics: PostMetrics): void {
  if (target.projectId) {
    updatePost(target.projectId, target.post.id, { metrics });
    return;
  }
  writeJson(STUDIO_KEY, { ...readJson<Record<string, PostMetrics>>(STUDIO_KEY, {}), [target.post.id]: metrics });
}

/** Reads one checkpoint for one post and saves what came back. */
async function readCheckpoint(target: MeasurablePost, checkpoint: Checkpoint | null, nowMs: number): Promise<void> {
  const { result, service } = await readNow(target.post, nowMs);
  const before: PostMetrics = target.post.metrics || { readings: {} };
  const metrics: PostMetrics = { ...before, readings: { ...before.readings } };
  delete metrics.retryAfterMs;
  if (result.problem === 'permission') markNeedsPermission(service);
  if (result.ok) {
    const reading: MetricsReading = { readAtMs: nowMs, values: result.values || {}, unavailable: result.unavailable || [] };
    // A refresh updates the latest reading; a checkpoint gets its own.
    const key = checkpoint || ORDER.filter((c) => metrics.readings[c]).pop() || '1h';
    metrics.readings[key] = reading;
    if (result.problem !== 'permission') clearNeedsPermission(service);
  } else if (result.problem === 'removed') {
    metrics.removed = true;
  } else if (result.problem === 'temporary') {
    metrics.retryAfterMs = nowMs + H;
  } else {
    metrics.lastProblem = result.problem || 'other';
  }
  saveMetrics(target, metrics);
  if (result.ok && checkpoint === '7d' && target.projectId) {
    for (const listener of sevenDayListeners) {
      try { listener(target.projectId, target.post.id); } catch { /* a listener's failure stays its own */ }
    }
  }
}

/** Reads the checkpoints now due, a few posts at a time; returns how many were read. */
export async function readDueMetrics(nowMs: number = Date.now(), max = 3): Promise<number> {
  let count = 0;
  for (const target of measurablePosts()) {
    if (count >= max) break;
    const checkpoint = dueCheckpoint(target.post, nowMs);
    if (!checkpoint) continue;
    count += 1;
    await readCheckpoint(target, checkpoint, nowMs);
  }
  return count;
}

/** Reads a post's numbers now (at most once per 10 minutes), without changing its checkpoints. */
export async function refreshPostMetrics(projectId: string, postId: string, nowMs: number = Date.now()): Promise<{ ok: boolean; reason?: string }> {
  const post = getProject(projectId)?.posts?.find((p) => p.id === postId);
  if (!post?.platformId) return { ok: false, reason: 'This post has no numbers to read yet.' };
  const last = post.metrics?.lastRefreshMs;
  if (last && nowMs - last < REFRESH_WAIT_MS) return { ok: false, reason: REFRESHED_RECENTLY };
  const target: MeasurablePost = { projectId, brandId: getProject(projectId)!.brandId, post: { ...post, metrics: { ...(post.metrics || { readings: {} }), lastRefreshMs: nowMs } } };
  await readCheckpoint(target, null, nowMs);
  return { ok: true };
}
