// Miya content factory phase 3b: what the Calendar page shows. Every brand's
// posts, Content Studio's scheduled drafts and Marcus's other scheduled sends,
// as one list of calendar items, with filters, month and week views, and one
// way to move an item (each kind moves in its own store).
import { assignDraftSchedule, listDraftHistory } from '../../features/content-catalyst/state/contentCatalystState';
import { getScheduledPublishes, rescheduleScheduledPublish } from '../marcusExecutionService';
import { listBrands } from './contentBrandService';
import { movePost, type MoveResult } from './contentPostMoves';
import { POST_STATUS_LABEL } from './contentPosts';
import { listProjects } from './contentProjectService';
import type { ContentBrand, ProjectPost } from './contentTypes';

export type { CalendarPlatform, CalendarItem } from './calendarView';
export { filterCalendarItems, itemsForMonth, itemsForWeek, hoursWithItems } from './calendarView';
import type { CalendarItem, CalendarPlatform } from './calendarView';

export const BRAND_COLORS = ['#30a46c', '#f76b15', '#8e4ec6', '#0090ff', '#e54666', '#12a594', '#ffb224', '#7c66dc'];
const STUDIO_COLOR = '#8d8d8d';

const NEEDS_YOU: string[] = ['locked_private', 'failed', 'check', 'ask', 'over_limit', 'by_hand'];
const GONE: string[] = ['posted', 'posting', 'check', 'cancelled', 'locked_private', 'by_hand'];
const PIECE: Record<ProjectPost['piece'], string> = { video: 'video', short: 'Short', reel: 'Reel', carousel: 'carousel' };

/** A brand's colour (its first palette colour, else a fixed one by order) and initials. */
export function brandMarker(brand: Pick<ContentBrand, 'name' | 'palette'>, index: number): { color: string; initials: string } {
  const color = (brand.palette || []).find((c) => /^#[0-9a-f]{3,8}$/i.test(c)) || BRAND_COLORS[index % BRAND_COLORS.length];
  const initials = brand.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
  return { color, initials };
}

function draftTime(date: string, time: string): { atMs: number; hasTime: boolean } | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(date || '');
  if (!d) return null;
  const t = /^(\d{1,2}):(\d{2})/.exec(time || '');
  const atMs = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), t ? Number(t[1]) : 0, t ? Number(t[2]) : 0).getTime();
  return { atMs, hasTime: Boolean(t) };
}

/** Everything on the calendar. `expiries`: when the YouTube / Meta sign-ins run out (phase 3b). */
export function listCalendarItems(
  nowMs: number,
  options: { expiries?: { youtube?: number | null; meta?: number | null } } = {},
): CalendarItem[] {
  void nowMs;
  const items: CalendarItem[] = [];
  const brands = listBrands();
  brands.forEach((brand, index) => {
    const marker = brandMarker(brand, index);
    for (const project of listProjects(brand.id)) {
      for (const post of project.posts || []) {
        if (post.status === 'cancelled') continue;
        const expiry = post.platform === 'youtube' ? options.expiries?.youtube : options.expiries?.meta;
        // Alphonso still needs the sign-in at the post's time: an Instagram post (sent by
        // Alphonso), or anything not yet on its platform. A video scheduled on YouTube or
        // Facebook goes out by itself.
        const onPlatform = post.status === 'scheduled' && !!post.platformId && post.platform !== 'instagram';
        const needsSignIn = !GONE.includes(post.status) && !onPlatform;
        const afterExpiry = needsSignIn && typeof expiry === 'number' && post.scheduledAtMs > expiry;
        const needsYou = NEEDS_YOU.includes(post.status) || afterExpiry;
        const service = post.platform === 'youtube' ? 'YouTube' : 'Meta';
        items.push({
          id: `post:${post.id}`,
          kind: 'post',
          brandId: brand.id,
          brandName: brand.name,
          brandColor: marker.color,
          initials: marker.initials,
          platform: post.platform,
          piece: PIECE[post.piece],
          isShort: Boolean(post.shortId),
          post,
          title: post.title,
          caption: post.caption,
          atMs: post.scheduledAtMs,
          hasTime: true,
          status: post.status,
          statusLabel: POST_STATUS_LABEL[post.status] || post.status,
          needsYou,
          ...(post.reason ? { reason: post.reason } : afterExpiry ? { reason: `The ${service} sign-in runs out before this; sign in again in Settings → Connectors.` } : {}),
          ...(post.link ? { link: post.link } : {}),
          projectId: project.id,
          projectName: project.name,
          postId: post.id,
          draggable: !GONE.includes(post.status),
          movesOnPlatform: onPlatform,
        });
      }
    }
  });
  for (const draft of listDraftHistory() as { id: string; idea?: string; caption?: string; platform?: string; scheduled_date?: string; scheduled_time?: string; published_status?: string; status?: string }[]) {
    const when = draftTime(draft.scheduled_date || '', draft.scheduled_time || '');
    if (!when) continue;
    const platform = (['youtube', 'instagram', 'facebook'].includes(draft.platform || '') ? draft.platform : 'other') as CalendarPlatform;
    const published = draft.published_status === 'published';
    items.push({
      id: `draft:${draft.id}`, kind: 'draft',
      isShort: false, brandId: null, brandName: 'Content Studio', brandColor: STUDIO_COLOR, initials: 'CS',
      platform, piece: 'draft', title: draft.idea || 'Content Studio draft', caption: draft.caption || '',
      atMs: when.atMs, hasTime: when.hasTime, status: published ? 'posted' : 'draft', statusLabel: published ? 'Posted' : 'Content Studio draft',
      needsYou: draft.status === 'failed', draftId: draft.id, draggable: !published, movesOnPlatform: false,
    });
  }
  for (const send of getScheduledPublishes()) {
    if ((send.kind && send.kind !== 'text' && send.kind !== 'approved_send') || send.status !== 'pending') continue;
    items.push({
      id: `send:${send.id}`, kind: 'send',
      isShort: false, brandId: null, brandName: 'Marcus', brandColor: STUDIO_COLOR, initials: 'M',
      platform: 'other', piece: send.platform, title: send.content.slice(0, 60) || 'Scheduled send', caption: send.content,
      atMs: send.scheduledAt, hasTime: true, status: 'scheduled', statusLabel: `Scheduled send (${send.platform})`,
      needsYou: false, sendId: send.id, draggable: true, movesOnPlatform: false,
    });
  }
  return items.sort((a, b) => a.atMs - b.atMs);
}



/** Moves an item; each kind in its own store (a post through `movePost`). */
export async function moveCalendarItem(item: CalendarItem, atMs: number): Promise<MoveResult> {
  if (!item.draggable) return { ok: false, reason: 'This can no longer be moved.' };
  if (item.kind === 'post' && item.projectId && item.postId) return movePost(item.projectId, item.postId, atMs);
  // A send moved into the past would go out at once; a draft with no time may go on today.
  const now = Date.now();
  const midnight = (ms: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const past = item.kind === 'draft' && !item.hasTime ? midnight(atMs) < midnight(now) : atMs < now;
  if (past) return { ok: false, reason: 'That time is in the past.' };
  if (item.kind === 'draft' && item.draftId) {
    const d = new Date(atMs);
    const pad = (n: number) => String(n).padStart(2, '0');
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    // A draft with no time dropped on a day (midnight) stays without one; dropped on an hour, it gets it.
    const noTime = !item.hasTime && d.getHours() === 0 && d.getMinutes() === 0;
    const saved = assignDraftSchedule(item.draftId, date, noTime ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`);
    return saved ? { ok: true } : { ok: false, reason: 'That draft was not found.' };
  }
  if (item.kind === 'send' && item.sendId) {
    return rescheduleScheduledPublish(item.sendId, atMs) ? { ok: true } : { ok: false, reason: 'That send has already gone or was cancelled.' };
  }
  return { ok: false, reason: 'This can no longer be moved.' };
}
