// Miya content factory phase 3b: the platforms' daily limits. A post that would
// go over waits (status `over_limit`) and goes when there is room, instead of
// failing. Instagram says how many posts are left; Facebook Reels (30 in 24
// hours) are counted from the posts Alphonso sent.
import { instagramPublishingLimit } from '../metaPublishService';
import { listProjects } from './contentProjectService';
import type { ProjectPost } from './contentTypes';

export const FACEBOOK_DAILY_LIMIT = 30;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** `ok`: send now. Otherwise `retryAtMs` and `reason` say when and why it waits. */
export interface LimitCheck { ok: boolean; retryAtMs?: number; reason?: string }

/** Whether `post` can be sent now; when not, when to try again and why. */
export async function checkDailyLimit(post: ProjectPost, nowMs = Date.now()): Promise<LimitCheck> {
  if (post.platform === 'instagram') {
    // Instagram not answering is not a reason to hold the post: it refuses itself if really over.
    const left = await instagramPublishingLimit().catch(() => null);
    if (left === 0) {
      return { ok: false, retryAtMs: nowMs + HOUR, reason: "Instagram's daily limit is reached; it goes when there is room (checked again every hour)." };
    }
    return { ok: true };
  }
  // The 30-a-day limit is for Reels; a photo post (a carousel, phase 3c) isn't held or counted.
  if (post.platform === 'facebook' && post.piece !== 'carousel') {
    const sent = listProjects()
      .flatMap((p) => p.posts || [])
      .filter((p) => p.platform === 'facebook' && p.piece !== 'carousel' && p.id !== post.id && typeof p.sentAtMs === 'number' && p.sentAtMs > nowMs - DAY)
      .map((p) => p.sentAtMs as number)
      .sort((a, b) => a - b);
    if (sent.length >= FACEBOOK_DAILY_LIMIT) {
      const retryAtMs = sent[sent.length - FACEBOOK_DAILY_LIMIT] + DAY;
      return { ok: false, retryAtMs, reason: `Facebook allows ${FACEBOOK_DAILY_LIMIT} Reels in 24 hours; this one goes at ${new Date(retryAtMs).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.` };
    }
  }
  return { ok: true };
}
