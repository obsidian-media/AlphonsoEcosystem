// What each platform takes as a vertical post (content factory phase 3d, checked
// 2026-10-24 against the official pages below). Every Short and every 9:16 post is
// checked before it becomes a post and again before it is sent, so a platform never
// refuses one for its length.
import type { PostPlatform, ProjectPost } from './contentTypes';

const MB = 1024 * 1024;

export const PLATFORM_LIMITS = {
  youtube: { name: 'YouTube', maxShortSec: 180, source: 'https://support.google.com/youtube/answer/15424877' },
  facebook: { name: 'Facebook', minSec: 3, maxSec: 90, source: 'https://developers.facebook.com/docs/video-api/guides/reels-publishing' },
  instagram: {
    name: 'Instagram', minSec: 3, maxSec: 900, maxBytes: 300 * MB,
    source: 'https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media',
  },
} as const;

/** 252 → "4:12". */
export function formatSeconds(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export interface PlatformFit { ok: boolean; asRegularVideo?: boolean; reason?: string }

/**
 * Whether a vertical post fits its platform. `seconds` null means unknown (not refused).
 * A YouTube Short over 3 minutes still goes, as a regular video, saying so.
 */
export function fitsPlatform(platform: PostPlatform, piece: ProjectPost['piece'], seconds: number | null | undefined, bytes?: number | null): PlatformFit {
  const vertical = piece === 'short' || piece === 'reel';
  if (!vertical) return { ok: true };
  if (platform === 'youtube') {
    if (typeof seconds === 'number' && seconds > PLATFORM_LIMITS.youtube.maxShortSec) {
      return { ok: true, asRegularVideo: true, reason: `YouTube will show it as a regular video, not a Short: it is ${formatSeconds(Math.ceil(seconds))} long (Shorts are up to 3 minutes).` };
    }
    return { ok: true };
  }
  const limit = PLATFORM_LIMITS[platform];
  if (typeof seconds === 'number' && (seconds < limit.minSec || seconds > limit.maxSec)) {
    const range = platform === 'facebook' ? '3–90 seconds' : '3 seconds to 15 minutes';
    return { ok: false, reason: `Not ${platform === 'facebook' ? 'a Facebook' : 'an Instagram'} Reel: it is ${formatSeconds(seconds)} long; ${limit.name} takes ${range}.` };
  }
  if (platform === 'instagram' && typeof bytes === 'number' && bytes > PLATFORM_LIMITS.instagram.maxBytes) {
    return { ok: false, reason: `Not an Instagram Reel: the file is ${Math.ceil(bytes / MB)} MB; Instagram takes 300 MB at most.` };
  }
  return { ok: true };
}
