// Better posting times from a brand's own results (content factory phase 4a). With at least
// 5 posts that have 7-day numbers on a platform, the weekday and hour its good posts went
// out are suggested (up to 3), each with the reason. Nothing changes until you accept one.
import { getBrand, saveBrand } from './contentBrandService';
import { brandResultRows } from './brandResults';
import type { PostingSlot, PostPlatform } from './contentTypes';

export const MIN_POSTS_FOR_TIMES = 5;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PLATFORM_NAME: Record<PostPlatform, string> = { youtube: 'YouTube', instagram: 'Instagram', facebook: 'Facebook' };
const PIECES: Record<string, string> = { video: 'videos', short: 'Shorts', reel: 'Reels', carousel: 'carousels' };

export interface SuggestedSlot { slot: PostingSlot; reason: string }

export function suggestPostTimes(brandId: string, platform: PostPlatform): SuggestedSlot[] {
  const rows = brandResultRows(brandId).filter((r) => r.post.platform === platform);
  if (rows.length < MIN_POSTS_FOR_TIMES) return [];
  const good = rows.filter((r) => r.band === 'good');
  if (!good.length) return [];
  const groups = new Map<string, { day: number; hour: number; count: number; pieces: string[] }>();
  for (const row of good) {
    const at = new Date(row.post.sentAtMs || row.post.scheduledAtMs);
    const key = `${at.getDay()}-${at.getHours()}`;
    const group = groups.get(key) || { day: at.getDay(), hour: at.getHours(), count: 0, pieces: [] };
    group.count += 1;
    group.pieces.push(row.post.piece);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || a.day - b.day || a.hour - b.hour)
    .slice(0, 3)
    .map((g) => {
      const time = `${String(g.hour).padStart(2, '0')}:00`;
      const piece = PIECES[g.pieces[0]] || 'posts';
      return {
        slot: { platform, day: g.day, time },
        reason: `${g.count} of your ${good.length} good ${piece} on ${PLATFORM_NAME[platform]} went out on ${DAYS[g.day]} at ${time}.`,
      };
    });
}

/** Adds a suggested slot to the brand's posting times (no duplicates). */
export function acceptSuggestedSlot(brandId: string, slot: PostingSlot): boolean {
  const brand = getBrand(brandId);
  if (!brand) return false;
  const slots = brand.postingSlots || [];
  if (slots.some((s) => s.platform === slot.platform && s.day === slot.day && s.time === slot.time)) return true;
  saveBrand({ ...brand, postingSlots: [...slots, slot] });
  return true;
}
