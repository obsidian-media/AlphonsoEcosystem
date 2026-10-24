// Miya content factory phase 3a: a project's posts. One row per platform and
// piece (the YouTube video and Short, Instagram and Facebook Reels), with copy
// from the campaign step and a time from the brand's posting slots, then Nova's
// suggested times, then tomorrow at 18:00. Everything is editable until it goes out.
import { changeProjectPosts, chosenVersionOf, getProject } from './contentProjectService';
import { fitsPlatform } from './platformLimits';
import {
  secureId,
  type ContentBrand, type ContentProject, type PostPlatform, type PostStatus, type PostingSlot, type ProjectPost, type ShortPlan,
} from './contentTypes';

/** What each post status says on screen (the Posts list and the Calendar). */
export const POST_STATUS_LABEL: Record<PostStatus, string> = {
  draft: 'Not approved yet', approved: 'Approved', scheduled: 'Scheduled', posting: 'Posting…', posted: 'Posted',
  locked_private: 'Kept private by YouTube', waiting_app: 'Waiting for the app', failed: 'Failed', check: 'Check it',
  cancelled: 'Cancelled', ask: 'Waiting for you', over_limit: 'Waiting: daily limit',
  by_hand: 'Post by hand',
};

const PLATFORMS: PostPlatform[] = ['youtube', 'instagram', 'facebook'];
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** A slot sooner than this is skipped: the user still has to review and approve. */
const LEAD_MS = 15 * MINUTE;
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

interface CampaignCopy { platform?: string; caption?: string; hashtags?: string[]; description?: string; title?: string }
interface Campaign {
  platforms?: CampaignCopy[];
  short?: { title?: string; caption?: string; hashtags?: string[] };
  /** The carousel's own copy (phase 3c). */
  carousel?: { caption?: string; hashtags?: string[] };
}
export interface NovaTime { platform?: string; dayOfWeek?: string; time?: string }

function platformOf(name: string): PostPlatform | null {
  const n = name.toLowerCase();
  return PLATFORMS.find((p) => n.includes(p)) || null;
}

function wantedPlatforms(project: ContentProject, brand: ContentBrand): { platforms: PostPlatform[]; note?: string } {
  for (const list of [project.brief.platforms || [], brand.platforms || []]) {
    const found = PLATFORMS.filter((p) => list.some((name) => platformOf(name) === p));
    if (found.length) return { platforms: found };
  }
  return { platforms: PLATFORMS, note: 'Neither the project nor the brand names YouTube, Instagram or Facebook, so all three are offered; cancel the ones you do not use.' };
}

/** Parses "HH:MM" (or "18", "6pm"); `null` when it is not a time. */
function parseTime(text: string): { h: number; m: number } | null {
  const t = text.trim().toLowerCase();
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(t);
  if (!match) return null;
  let h = Number(match[1]);
  const m = Number(match[2] || 0);
  if (match[3] === 'pm' && h < 12) h += 12;
  if (match[3] === 'am' && h === 12) h = 0;
  return h < 24 && m < 60 ? { h, m } : null;
}

/** The next time on `day` at `time` that is at least LEAD_MS after `nowMs`, for four weeks. */
function occurrences(day: number, time: { h: number; m: number }, nowMs: number): number[] {
  const start = new Date(nowMs);
  const out: number[] = [];
  for (let i = 0; i < 35; i += 1) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, time.h, time.m);
    if (d.getDay() === day && d.getTime() >= nowMs + LEAD_MS) out.push(d.getTime());
  }
  return out;
}

/** When a post on `platform` goes out by default (see the file comment); never a time in `taken`. */
export function nextPostTime(
  platform: PostPlatform,
  brand: Pick<ContentBrand, 'postingSlots'>,
  novaTimes: NovaTime[],
  nowMs: number,
  taken: number[],
): number {
  const free = (times: number[]) => times.sort((a, b) => a - b).find((t) => !taken.includes(t));
  const slots = (brand.postingSlots || []).filter((s: PostingSlot) => s.platform === platform);
  const fromSlots = free(slots.flatMap((s) => {
    const time = parseTime(s.time);
    return time ? occurrences(s.day, time, nowMs) : [];
  }));
  if (fromSlots !== undefined) return fromSlots;
  const fromNova = free(novaTimes.filter((t) => platformOf(t.platform || '') === platform).flatMap((t) => {
    const day = DAYS.indexOf((t.dayOfWeek || '').trim().toLowerCase());
    const time = parseTime(t.time || '');
    return day >= 0 && time ? occurrences(day, time, nowMs) : [];
  }));
  if (fromNova !== undefined) return fromNova;
  const now = new Date(nowMs);
  let t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 18, 0).getTime();
  while (taken.includes(t)) t += DAY;
  return t;
}

/** The posts a finished project can make, with notes on any it cannot. */
export function buildPosts(project: ContentProject, brand: ContentBrand, nowMs: number): { posts: ProjectPost[]; notes: string[] } {
  const notes: string[] = [];
  const assembled = (chosenVersionOf(project, 'assemble')?.output as { miya?: { outputs?: { aspect: string; path: string; durationSec?: number }[] } } | undefined)?.miya?.outputs || [];
  const NO_VIDEO = 'Run the Finished video step first: there is no video to post yet.';
  // A carousel or Shorts can go out without the video (phases 3c, 3d); with none there is nothing to post.
  const shortsOutput = chosenVersionOf(project, 'shorts')?.output as { miya?: { shorts?: ShortPlan[] }; made?: Record<string, { status?: string; path?: string; seconds?: number }> } | undefined;
  if (!assembled.length && !chosenVersionOf(project, 'carousel') && !shortsOutput) return { posts: [], notes: [NO_VIDEO] };
  if (!assembled.length) notes.push(NO_VIDEO);
  const wide = assembled.find((o) => o.aspect === '16x9')?.path;
  const tall = assembled.find((o) => o.aspect === '9x16')?.path;
  const tallSeconds = assembled.find((o) => o.aspect === '9x16')?.durationSec;
  const withSeconds = typeof tallSeconds === 'number' ? { seconds: tallSeconds } : {};
  const thumbs = (chosenVersionOf(project, 'thumbnail')?.output as { pictures?: { status: string; relativePath?: string }[] } | undefined)?.pictures || [];
  const thumbnail = thumbs.find((t) => t.status === 'done' && t.relativePath)?.relativePath;
  const campaignOutput = chosenVersionOf(project, 'campaign')?.output as { miya?: Campaign; nova?: { times?: NovaTime[] } } | undefined;
  const campaign = campaignOutput?.miya || {};
  const novaTimes = campaignOutput?.nova?.times || [];
  const copyFor = (p: PostPlatform) => (campaign.platforms || []).find((c) => platformOf(c.platform || '') === p) || {};

  const { platforms, note } = wantedPlatforms(project, brand);
  if (note) notes.push(note);
  const rows: Omit<ProjectPost, 'id' | 'scheduledAtMs' | 'status'>[] = [];
  for (const platform of assembled.length ? platforms : []) {
    const copy = copyFor(platform);
    if (platform === 'youtube') {
      if (wide) {
        rows.push({
          platform, piece: 'video', file: wide, ...(thumbnail ? { thumbnail } : {}),
          title: copy.title || project.name, caption: copy.description || copy.caption || '', hashtags: copy.hashtags || [],
        });
      } else notes.push('No YouTube video: the finished video has no 16:9 version.');
      if (tall) {
        rows.push({
          platform, piece: 'short', file: tall, ...withSeconds,
          title: campaign.short?.title || copy.title || project.name,
          caption: campaign.short?.caption || copy.caption || '', hashtags: campaign.short?.hashtags || copy.hashtags || [],
        });
      } else notes.push('No YouTube Short: the finished video has no 9:16 version.');
    } else if (tall) {
      rows.push({ platform, piece: 'reel', file: tall, ...withSeconds, title: project.name, caption: copy.caption || '', hashtags: copy.hashtags || [] });
    } else {
      notes.push(`No ${platform === 'instagram' ? 'Instagram' : 'Facebook'} Reel: the finished video has no 9:16 version.`);
    }
  }
  // A carousel (phase 3c): an Instagram carousel and a Facebook photo post, with its own copy.
  const carouselOutput = chosenVersionOf(project, 'carousel')?.output as { pictures?: { status: string; relativePath?: string }[] } | undefined;
  if (carouselOutput) {
    const pictures = carouselOutput.pictures || [];
    const files = pictures.map((p) => (p.status === 'done' ? p.relativePath || '' : ''));
    if (!pictures.length || files.some((f) => !f)) {
      notes.push('No carousel posts yet: some slides have no picture. Check them in Carousel Studio.');
    } else {
      for (const platform of platforms.filter((p) => p !== 'youtube')) {
        const copy = copyFor(platform);
        rows.push({
          platform, piece: 'carousel', file: files[0], files, title: project.name,
          caption: campaign.carousel?.caption || copy.caption || '', hashtags: campaign.carousel?.hashtags || copy.hashtags || [],
        });
      }
    }
  }
  // Shorts (phase 3d): each made Short on the platforms ticked for it, with its own copy.
  for (const short of shortsOutput?.miya?.shorts || []) {
    const made = shortsOutput?.made?.[short.id];
    const label = `"${short.title || short.id}"`;
    if (!short.platforms?.length) { notes.push(`${label} is not posted anywhere: tick a platform for it in Shorts Studio.`); continue; }
    if (made?.status !== 'done' || !made.path) { notes.push(`${label} is not made yet; make it in Shorts Studio.`); continue; }
    for (const platform of short.platforms) {
      const copy = short.copy?.find((c) => c.platform === platform);
      rows.push({
        platform, piece: platform === 'youtube' ? 'short' : 'reel', file: made.path, shortId: short.id,
        ...(typeof made.seconds === 'number' ? { seconds: made.seconds } : {}),
        title: copy?.title || short.title || project.name, caption: copy?.caption || '', hashtags: copy?.hashtags || [],
      });
    }
  }
  // Each platform's length limits (phase 3d): a post it won't take is left out, with a note.
  const fitting = rows.filter((row) => {
    const fit = fitsPlatform(row.platform, row.piece, row.seconds ?? null);
    if (!fit.ok) notes.push(fit.reason as string);
    else if (fit.asRegularVideo) row.reason = fit.reason;
    return fit.ok;
  });
  const taken: number[] = [];
  const posts = fitting.map((row) => {
    const scheduledAtMs = nextPostTime(row.platform, brand, novaTimes, nowMs, taken);
    taken.push(scheduledAtMs);
    return { ...row, id: secureId('post'), scheduledAtMs, status: 'draft' as const };
  });
  return { posts, notes };
}

export function savePosts(projectId: string, posts: ProjectPost[]): ContentProject {
  return changeProjectPosts(projectId, () => posts);
}

const GONE = ['posting', 'posted', 'locked_private', 'check', 'cancelled'];

function onPlatformOnly(post: ProjectPost): string | null {
  // Already scheduled on the platform itself: Alphonso cannot move it from here.
  if (post.status !== 'scheduled' || !post.platformId) return null;
  if (post.platform === 'youtube') return `This is already scheduled on YouTube; change it in YouTube Studio: https://studio.youtube.com/video/${post.platformId}/edit`;
  if (post.platform === 'facebook') return 'This is already scheduled on your Facebook Page; change it in Meta Business Suite.';
  return null;
}

/** Changes a post that has not gone out yet. */
/** `onPlatform`: the platform already made this change (phase 3b), so a post scheduled there may change. */
export function updatePost(projectId: string, postId: string, patch: Partial<ProjectPost>, options: { onPlatform?: boolean } = {}): { ok: boolean; reason?: string } {
  let result: { ok: boolean; reason?: string } = { ok: false, reason: 'That post was not found.' };
  changeProjectPosts(projectId, (posts) => posts.map((post) => {
    if (post.id !== postId) return post;
    const statusOnly = Object.keys(patch).every((k) => ['status', 'link', 'platformId', 'reason', 'sentAtMs', 'folder'].includes(k));
    if (!statusOnly) {
      if (GONE.includes(post.status)) {
        result = { ok: false, reason: `This post has already ${post.status === 'cancelled' ? 'been cancelled' : 'gone out'}.` };
        return post;
      }
      const locked = options.onPlatform ? null : onPlatformOnly(post);
      if (locked) {
        result = { ok: false, reason: locked };
        return post;
      }
    }
    result = { ok: true };
    return { ...post, ...patch, id: post.id };
  }));
  return result;
}

/** Cancels a post before it goes out. */
export function cancelPost(projectId: string, postId: string, options: { onPlatform?: boolean } = {}): { ok: boolean; reason?: string } {
  const post = getProject(projectId)?.posts?.find((p) => p.id === postId);
  if (!post) return { ok: false, reason: 'That post was not found.' };
  if (GONE.includes(post.status)) return { ok: false, reason: `This post has already ${post.status === 'cancelled' ? 'been cancelled' : 'gone out'}.` };
  const locked = options.onPlatform ? null : onPlatformOnly(post);
  if (locked) return { ok: false, reason: locked.replace('change it', 'cancel it') };
  return updatePost(projectId, postId, { status: 'cancelled' }, options);
}
