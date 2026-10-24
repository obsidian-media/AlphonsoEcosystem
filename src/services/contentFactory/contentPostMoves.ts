// Miya content factory phase 3b: the one way a post is moved or cancelled.
// A draft or an Instagram post (sent by Alphonso) changes at once; a post already
// scheduled on YouTube or Facebook changes there first, and only what the platform
// kept is saved. The calendar and the Posts list both call these.
import { rescheduleYouTubeVideo } from '../connectors/connectorOutbound';
import { appendConnectorAudit } from '../connectorRegistryService';
import { cancelScheduledContentPost, scheduleContentPost } from '../marcusExecutionService';
import { cancelMetaVideo, rescheduleMetaVideo } from '../metaPublishService';
import { cancelPost, updatePost } from './contentPosts';
import { getProject } from './contentProjectService';
import type { ProjectPost } from './contentTypes';

export interface MoveResult { ok: boolean; reason?: string; manageUrl?: string }

const PLATFORM_LEAD_MS = 15 * 60_000;
const GONE: Record<string, string> = {
  posted: 'This has already gone out.',
  posting: 'This is already being posted.',
  check: 'This may already have gone out; check the platform first.',
  cancelled: 'This post was already cancelled.',
  locked_private: 'YouTube keeps this video private; make it public in YouTube Studio.',
};
const moving = new Set<string>();

const onPlatform = (post: ProjectPost) =>
  post.status === 'scheduled' && !!post.platformId && (post.platform === 'youtube' || post.platform === 'facebook');

function findPost(projectId: string, postId: string): ProjectPost | null {
  return getProject(projectId)?.posts?.find((p) => p.id === postId) || null;
}

/** The same local time of day on another day (local setters, so a clock change keeps the hour). */
export function moveToDay(atMs: number, dayStartMs: number): number {
  const at = new Date(atMs);
  const day = new Date(dayStartMs);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), at.getHours(), at.getMinutes()).getTime();
}

/** A day at this hour and minute, local time. */
export function moveToSlot(dayStartMs: number, hour: number, minute: number): number {
  const day = new Date(dayStartMs);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime();
}

/** Moves a post to `atMs`; for one scheduled on YouTube or Facebook, only once the platform keeps it. */
export async function movePost(projectId: string, postId: string, atMs: number, nowMs = Date.now()): Promise<MoveResult> {
  const post = findPost(projectId, postId);
  if (!post) return { ok: false, reason: 'That post was not found.' };
  if (GONE[post.status]) return { ok: false, reason: GONE[post.status] };
  if (atMs < nowMs) return { ok: false, reason: 'That time is in the past.' };
  if (moving.has(postId)) return { ok: false, reason: 'Moving…' };
  if (!onPlatform(post)) {
    const result = updatePost(projectId, postId, { scheduledAtMs: atMs });
    // A send waiting in Marcus's runner moves with it: an Instagram post, or one held by a daily limit.
    if (result.ok && ((post.platform === 'instagram' && post.status === 'scheduled') || post.status === 'over_limit')) {
      scheduleContentPost({ projectId, postId, platform: post.platform, scheduledAt: atMs });
    }
    return result.ok ? { ok: true } : { ok: false, reason: result.reason };
  }
  if (atMs < nowMs + PLATFORM_LEAD_MS) return { ok: false, reason: 'Pick a time at least 15 minutes from now: the platform needs it.' };
  moving.add(postId);
  try {
    const answer = post.platform === 'youtube'
      ? await rescheduleYouTubeVideo({ videoId: post.platformId as string, publishAt: new Date(atMs).toISOString() })
      : await rescheduleMetaVideo({ videoId: post.platformId as string, scheduledAtMs: atMs, ...metaKind(post) });
    appendConnectorAudit(post.platform, 'post_moved', { projectId, postId, fromMs: post.scheduledAtMs, toMs: atMs, ok: Boolean(answer?.ok) });
    if (!answer?.ok) {
      return { ok: false, reason: answer?.reason || 'The platform did not take the new time.', ...(answer?.manageUrl ? { manageUrl: answer.manageUrl } : {}) };
    }
    updatePost(projectId, postId, { scheduledAtMs: atMs }, { onPlatform: true });
    return { ok: true };
  } finally {
    moving.delete(postId);
  }
}

/** A Facebook carousel is a Page photo post (phase 3c), not a Reel. */
const metaKind = (post: ProjectPost): { kind?: 'post' } => (post.piece === 'carousel' ? { kind: 'post' } : {});

/** Cancels a post; one scheduled on YouTube loses its schedule (stays private), on Facebook it is deleted. */
export async function cancelProjectPost(projectId: string, postId: string): Promise<MoveResult> {
  const post = findPost(projectId, postId);
  if (!post) return { ok: false, reason: 'That post was not found.' };
  if (!onPlatform(post)) {
    const result = cancelPost(projectId, postId);
    if (result.ok) cancelScheduledContentPost(postId);
    return result.ok ? { ok: true } : { ok: false, reason: result.reason };
  }
  if (moving.has(postId)) return { ok: false, reason: 'Moving…' };
  moving.add(postId);
  try {
    const answer = post.platform === 'youtube'
      ? await rescheduleYouTubeVideo({ videoId: post.platformId as string, publishAt: null })
      : await cancelMetaVideo({ videoId: post.platformId as string, ...metaKind(post) });
    appendConnectorAudit(post.platform, 'post_cancelled', { projectId, postId, ok: Boolean(answer?.ok) });
    if (!answer?.ok) {
      return { ok: false, reason: answer?.reason || 'The platform did not cancel it.', ...(answer?.manageUrl ? { manageUrl: answer.manageUrl } : {}) };
    }
    updatePost(projectId, postId, {
      status: 'cancelled',
      reason: post.platform === 'youtube'
        ? "Kept private on YouTube; delete it in YouTube Studio if you don't want it."
        : 'Cancelled on Facebook.',
    }, { onPlatform: true });
    cancelScheduledContentPost(postId);
    return { ok: true };
  } finally {
    moving.delete(postId);
  }
}
