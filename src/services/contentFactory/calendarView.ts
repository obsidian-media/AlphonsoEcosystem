// The Calendar's item and its pure filters, shared by the computer's Calendar and the phone's
// (phone app phase 2). No services here, so the phone app can import it.
import type { ProjectPost } from './contentTypes';

export type CalendarPlatform = 'youtube' | 'instagram' | 'facebook' | 'other';

export interface CalendarItem {
  id: string;
  kind: 'post' | 'draft' | 'send';
  brandId: string | null;
  brandName: string;
  brandColor: string;
  initials: string;
  platform: CalendarPlatform;
  /** "video", "Short", "Reel", or the send's channel. */
  piece: string;
  /** One of the project's Shorts (phase 4a: marked on the Calendar). */
  isShort: boolean;
  /** The project's post itself (phase 4a: its numbers in the side panel). */
  post?: ProjectPost;
  title: string;
  caption: string;
  atMs: number;
  hasTime: boolean;
  status: string;
  statusLabel: string;
  needsYou: boolean;
  reason?: string;
  link?: string;
  projectId?: string;
  projectName?: string;
  postId?: string;
  draftId?: string;
  sendId?: string;
  draggable: boolean;
  movesOnPlatform: boolean;
}

/** `null` = no filter. A brand filter keeps Content Studio and Marcus items only when `brands` has `null`'s key ''. */
export function filterCalendarItems(items: CalendarItem[], filter: { brands: Set<string> | null; platforms: Set<string> | null }): CalendarItem[] {
  return items.filter((item) => (!filter.brands || filter.brands.has(item.brandId || ''))
    && (!filter.platforms || filter.platforms.has(item.platform)));
}

export function itemsForMonth(items: CalendarItem[], year: number, month: number): CalendarItem[] {
  return items.filter((item) => {
    const d = new Date(item.atMs);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

/** Seven days from `weekStartMs` (local midnight). */
export function itemsForWeek(items: CalendarItem[], weekStartMs: number): CalendarItem[] {
  const start = new Date(weekStartMs);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7).getTime();
  return items.filter((item) => item.atMs >= weekStartMs && item.atMs < end);
}

/** The hours that have timed items, for the week view's rows. */
export function hoursWithItems(items: CalendarItem[]): number[] {
  return [...new Set(items.filter((i) => i.hasTime).map((i) => new Date(i.atMs).getHours()))].sort((a, b) => a - b);
}
