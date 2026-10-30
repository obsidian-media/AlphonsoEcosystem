// Phase 3b: what the Calendar page shows: every brand's posts, Content Studio's drafts, Marcus's sends.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const movePost = vi.fn();
vi.mock('../../../services/contentFactory/contentPostMoves', async () => {
  const actual = await vi.importActual<any>('../../../services/contentFactory/contentPostMoves');
  return { ...actual, movePost: (...a: unknown[]) => movePost(...a) };
});

import {
  listCalendarItems, brandMarker, filterCalendarItems, itemsForMonth, itemsForWeek, hoursWithItems, moveCalendarItem, BRAND_COLORS,
} from '../../../services/contentFactory/calendarItems';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { createProject, emptyBrief } from '../../../services/contentFactory/contentProjectService';
import { savePosts } from '../../../services/contentFactory/contentPosts';
import { schedulePublish, getScheduledPublishes } from '../../../services/marcusExecutionService';
import type { ProjectPost } from '../../../services/contentFactory/contentTypes';

const NOW = new Date(2026, 9, 26, 10, 0).getTime();
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime();

function seed() {
  const lw = saveBrand({ name: 'Learn With Alphonso', palette: ['#30a46c'], platforms: ['YouTube', 'Instagram'] });
  const sp = saveBrand({ name: 'ShipToPhone', platforms: ['Instagram'] });
  const p1 = createProject(lw.id, 'Why we are tired', { ...emptyBrief(), idea: 'x' });
  const p2 = createProject(sp.id, 'Launch', { ...emptyBrief(), idea: 'y' });
  const post = (id: string, patch: Partial<ProjectPost>): ProjectPost => ({
    id, platform: 'instagram', piece: 'reel', file: 'f', title: 'T', caption: 'c', hashtags: [], scheduledAtMs: at(27, 18), status: 'scheduled', ...patch,
  });
  savePosts(p1.id, [
    post('yt', { platform: 'youtube', piece: 'video', title: 'Why we are tired', scheduledAtMs: at(26, 18), platformId: 'v1' }),
    post('ig', {}),
    post('locked', { platform: 'youtube', piece: 'short', status: 'locked_private', scheduledAtMs: at(30, 17), reason: 'kept private' }),
    post('gone', { status: 'cancelled' }),
  ]);
  savePosts(p2.id, [post('sp1', { scheduledAtMs: at(31, 10), title: 'Launch reel' })]);
  localStorage.setItem('alphonso_content_catalyst_jobs_v1', JSON.stringify([{
    id: 'job1', request: { idea: 'Studio draft', platform: 'instagram' }, scheduled_date: '2026-10-29', scheduled_time: '', status: 'ready',
  }]));
  schedulePublish({ content: 'Hello Slack', platform: 'slack', scheduledAt: at(28, 9), agentId: 'marcus' });
  return { lw, sp };
}

// The seeded times are in late October 2026: the clock stays at NOW so moves are judged against it, not today.
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); localStorage.clear(); movePost.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

describe('listCalendarItems', () => {
  it('merges posts of every brand, Content Studio drafts and Marcus sends', () => {
    seed();
    const items = listCalendarItems(NOW);
    expect(items.map((i) => `${i.kind}:${i.title}`).sort()).toEqual([
      'draft:Studio draft', 'post:Launch reel', 'post:T', 'post:T', 'post:Why we are tired', 'send:Hello Slack',
    ]);
    const yt = items.find((i) => i.postId === 'yt')!;
    expect(yt).toMatchObject({ platform: 'youtube', brandName: 'Learn With Alphonso', brandColor: '#30a46c', initials: 'LW', hasTime: true, movesOnPlatform: true, draggable: true });
    const draft = items.find((i) => i.kind === 'draft')!;
    expect(draft).toMatchObject({ brandName: 'Content Studio', platform: 'instagram', hasTime: false, draggable: true });
    expect(new Date(draft.atMs).getDate()).toBe(29);
    expect(items.find((i) => i.kind === 'send')).toMatchObject({ platform: 'other', draggable: true, atMs: at(28, 9) });
  });

  it('marks what needs you, and what has gone out cannot be dragged', () => {
    seed();
    const items = listCalendarItems(NOW);
    expect(items.find((i) => i.postId === 'locked')).toMatchObject({ needsYou: true, draggable: false, reason: 'kept private' });
    expect(items.find((i) => i.postId === 'ig')!.needsYou).toBe(false);
  });

  it('a post Alphonso still has to send after a sign-in runs out needs you; one already on YouTube does not', () => {
    seed();
    const items = listCalendarItems(NOW, { expiries: { youtube: at(26, 12), meta: at(27, 12) } });
    expect(items.find((i) => i.postId === 'ig')).toMatchObject({ needsYou: true, reason: expect.stringContaining('Meta sign-in') });
    expect(items.find((i) => i.postId === 'yt')!.needsYou).toBe(false);
    expect(items.find((i) => i.postId === 'sp1')!.needsYou).toBe(true);
  });
});

describe('brands, filters, month and week', () => {
  it('brandMarker: the first palette colour, else a fixed colour; two initials', () => {
    expect(brandMarker({ name: 'Learn With Alphonso', palette: ['#30a46c'] }, 0)).toEqual({ color: '#30a46c', initials: 'LW' });
    expect(brandMarker({ name: 'shiptophone', palette: [] }, 9)).toEqual({ color: BRAND_COLORS[9 % BRAND_COLORS.length], initials: 'S' });
  });

  it('filters by brand and platform', () => {
    const { sp } = seed();
    const items = listCalendarItems(NOW);
    expect(filterCalendarItems(items, { brands: new Set([sp.id]), platforms: null }).map((i) => i.postId)).toEqual(['sp1']);
    expect(filterCalendarItems(items, { brands: null, platforms: new Set(['youtube']) }).map((i) => i.postId).sort()).toEqual(['locked', 'yt']);
  });

  it('month and week; the week lists only hours that have posts', () => {
    seed();
    const items = listCalendarItems(NOW);
    expect(itemsForMonth(items, 2026, 9).length).toBe(6);
    const week = itemsForWeek(items, new Date(2026, 9, 26).getTime());
    expect(week.length).toBe(6);
    expect(hoursWithItems(week)).toEqual([9, 10, 17, 18]);
  });
});

describe('moveCalendarItem', () => {
  it('a post goes through movePost; a draft and a send move in their own stores', async () => {
    seed();
    const items = listCalendarItems(NOW);
    movePost.mockResolvedValue({ ok: true });
    await moveCalendarItem(items.find((i) => i.postId === 'ig')!, at(28, 18));
    expect(movePost).toHaveBeenCalledWith(expect.any(String), 'ig', at(28, 18));

    expect((await moveCalendarItem(items.find((i) => i.kind === 'draft')!, at(30, 9, 15))).ok).toBe(true);
    const job = JSON.parse(localStorage.getItem('alphonso_content_catalyst_jobs_v1') || '[]')[0];
    expect([job.scheduled_date, job.scheduled_time]).toEqual(['2026-10-30', '09:15']);

    expect((await moveCalendarItem(items.find((i) => i.kind === 'send')!, at(29, 11))).ok).toBe(true);
    expect(getScheduledPublishes().find((s) => s.content === 'Hello Slack')!.scheduledAt).toBe(at(29, 11));
  });
});

// Final review: a Marcus send moved into the past would go out at once; drafts and sends refuse it too.
it('a draft or a send cannot be moved into the past', async () => {
  seed();
  const items = listCalendarItems(NOW);
  const past = Date.now() - 3_600_000;
  expect(await moveCalendarItem(items.find((i) => i.kind === 'send')!, past)).toEqual({ ok: false, reason: 'That time is in the past.' });
  // A draft with no time is judged by its day: yesterday is past, today is not.
  const yesterday = Date.now() - 24 * 3_600_000;
  expect(await moveCalendarItem(items.find((i) => i.kind === 'draft')!, yesterday)).toEqual({ ok: false, reason: 'That time is in the past.' });
  const todayMidnight = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
  expect((await moveCalendarItem(items.find((i) => i.kind === 'draft')!, todayMidnight)).ok).toBe(true);
  expect(getScheduledPublishes().find((s) => s.content === 'Hello Slack')!.scheduledAt).toBe(at(28, 9));
});

// Phase 3c: a post saved to post by hand needs you, and can't be dragged.
it('a post to post by hand needs you', () => {
  seed();
  const p = createProject(saveBrand({ name: 'Hand' }).id, 'Hand', { ...emptyBrief(), idea: 'z' });
  savePosts(p.id, [{ id: 'hand', platform: 'instagram', piece: 'carousel', file: 'f', title: 'Slides', caption: '', hashtags: [], scheduledAtMs: at(29, 9), status: 'by_hand', folder: 'h/ready-to-post/x' }]);
  expect(listCalendarItems(NOW).find((i) => i.postId === 'hand')).toMatchObject({ needsYou: true, draggable: false });
});

// Phase 4a: a Short's post is marked on the Calendar.
describe('Shorts on the Calendar', () => {
  it("a Short's post is marked", () => {
    const b = saveBrand({ name: 'Acme' });
    const pr = createProject(b.id, 'P', emptyBrief());
    savePosts(pr.id, [
      { id: 's', platform: 'instagram', piece: 'reel', file: 'f', title: 'Short one', caption: '', hashtags: [], scheduledAtMs: Date.now() + 3600e3, status: 'scheduled', shortId: 'sh1' },
      { id: 'v', platform: 'youtube', piece: 'video', file: 'g', title: 'Long', caption: '', hashtags: [], scheduledAtMs: Date.now() + 7200e3, status: 'scheduled' },
    ] as any);
    const items = listCalendarItems(Date.now());
    expect(items.find((i) => i.postId === 's')?.isShort).toBe(true);
    expect(items.find((i) => i.postId === 'v')?.isShort).toBe(false);
  });
});
