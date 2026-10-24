// Phase 3a: a project's posts (one row per platform and piece) and their times.
import { describe, it, expect, beforeEach } from 'vitest';
import { createProject, emptyBrief, getProject, saveStepVersion } from '../../../services/contentFactory/contentProjectService';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import {
  buildPosts, nextPostTime, savePosts, updatePost, cancelPost,
} from '../../../services/contentFactory/contentPosts';
import type { ContentBrand, ContentProject, ProjectPost } from '../../../services/contentFactory/contentTypes';

// Monday 26 October 2026, 10:00 local time.
const NOW = new Date(2026, 9, 26, 10, 0).getTime();
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();

const campaign = {
  miya: {
    platforms: [
      { platform: 'YouTube', caption: 'Watch this', hashtags: ['#a'], description: 'The long description' },
      { platform: 'Instagram', caption: 'IG caption', hashtags: ['#ig'], description: '' },
      { platform: 'Facebook', caption: 'FB caption', hashtags: [], description: '' },
    ],
    short: { title: 'Short title', caption: 'Short caption', hashtags: ['#short'] },
    ads: [],
    calendar: [],
  },
  nova: { times: [{ platform: 'Instagram', dayOfWeek: 'Wednesday', time: '19:30', reason: 'evenings' }] },
};

function setup(opts: { platforms?: string[]; outputs?: string[]; slots?: ContentBrand['postingSlots'] } = {}): { project: ContentProject; brand: ContentBrand } {
  const brand = saveBrand({ name: 'Acme', platforms: ['YouTube', 'Instagram', 'Facebook'], postingSlots: opts.slots || [] });
  let project = createProject(brand.id, 'Launch', { ...emptyBrief(), idea: 'x', platforms: opts.platforms || [] });
  const outputs = (opts.outputs || ['16x9', '9x16']).map((aspect) => ({ aspect, path: `acme/launch/output/video-${aspect}-v1.mp4`, durationSec: 40, frames: [] }));
  saveStepVersion(project.id, 'assemble', { output: { miya: { outputs } }, summary: 'video', joseCommandId: null });
  saveStepVersion(project.id, 'thumbnail', {
    output: { miya: { concepts: [] }, pictures: [{ sceneId: 't1', status: 'failed' }, { sceneId: 't2', status: 'done', relativePath: 'acme/launch/thumbnail/t2.png' }] },
    summary: 'thumbs', joseCommandId: null,
  });
  project = saveStepVersion(project.id, 'campaign', { output: campaign, summary: 'campaign', joseCommandId: null });
  return { project, brand };
}

beforeEach(() => localStorage.clear());

describe('buildPosts', () => {
  it('makes the YouTube video and Short, and Instagram and Facebook Reels, with their own copy', () => {
    const { project, brand } = setup();
    const { posts } = buildPosts(project, brand, NOW);
    expect(posts.map((p) => `${p.platform}:${p.piece}`)).toEqual(['youtube:video', 'youtube:short', 'instagram:reel', 'facebook:reel']);
    const video = posts[0];
    expect(video.file).toBe('acme/launch/output/video-16x9-v1.mp4');
    expect(video.thumbnail).toBe('acme/launch/thumbnail/t2.png');
    expect(video.title).toBe('Launch');
    expect(video.caption).toBe('The long description');
    expect(video.hashtags).toEqual(['#a']);
    expect(posts[1]).toMatchObject({ file: 'acme/launch/output/video-9x16-v1.mp4', title: 'Short title', caption: 'Short caption', hashtags: ['#short'] });
    expect(posts[2]).toMatchObject({ caption: 'IG caption', hashtags: ['#ig'], status: 'draft' });
    expect(new Set(posts.map((p) => p.id)).size).toBe(4);
  });

  it("uses the project's own platforms before the brand's", () => {
    const { project, brand } = setup({ platforms: ['Instagram'] });
    expect(buildPosts(project, brand, NOW).posts.map((p) => p.platform)).toEqual(['instagram']);
  });

  it('offers no Short or Reels without a 9:16 video, and says why', () => {
    const { project, brand } = setup({ outputs: ['16x9'] });
    const { posts, notes } = buildPosts(project, brand, NOW);
    expect(posts.map((p) => p.piece)).toEqual(['video']);
    expect(notes.join(' ')).toContain('9:16');
  });

  it('offers no YouTube video without a 16:9 video, and says why', () => {
    const { project, brand } = setup({ outputs: ['9x16'] });
    const { posts, notes } = buildPosts(project, brand, NOW);
    expect(posts.map((p) => `${p.platform}:${p.piece}`)).toEqual(['youtube:short', 'instagram:reel', 'facebook:reel']);
    expect(notes.join(' ')).toContain('16:9');
  });

  it('has nothing to post before the finished video exists', () => {
    const brand = saveBrand({ name: 'Acme', platforms: ['YouTube'] });
    const project = createProject(brand.id, 'Empty', { ...emptyBrief(), idea: 'x' });
    const { posts, notes } = buildPosts(project, brand, NOW);
    expect(posts).toEqual([]);
    expect(notes.join(' ')).toContain('Finished video');
  });
});

describe('nextPostTime', () => {
  const brand = { postingSlots: [{ platform: 'youtube' as const, day: 2, time: '17:00' }, { platform: 'youtube' as const, day: 4, time: '17:00' }] };

  it("takes the brand's next free slot for the platform", () => {
    expect(nextPostTime('youtube', brand, [], NOW, [])).toBe(at(27, 17));
    expect(nextPostTime('youtube', brand, [], NOW, [at(27, 17)])).toBe(at(29, 17));
  });

  it("falls back to Nova's suggested day and time", () => {
    const nova = [{ platform: 'Instagram', dayOfWeek: 'Wednesday', time: '19:30' }];
    expect(nextPostTime('instagram', brand, nova, NOW, [])).toBe(at(28, 19, 30));
  });

  it('falls back to tomorrow at 18:00, and never shares a time', () => {
    expect(nextPostTime('facebook', { postingSlots: [] }, [], NOW, [])).toBe(at(27, 18));
    expect(nextPostTime('facebook', { postingSlots: [] }, [], NOW, [at(27, 18)])).toBe(at(28, 18));
  });

  it('skips a slot today that is too close to now', () => {
    const today = { postingSlots: [{ platform: 'youtube' as const, day: 1, time: '10:05' }] };
    expect(nextPostTime('youtube', today, [], NOW, [])).toBe(at(26 + 7, 10, 5));
  });

  it('two posts built for one project never share a time', () => {
    const { project, brand: b } = setup({ slots: [{ platform: 'youtube', day: 2, time: '17:00' }] });
    const youtube = buildPosts(project, b, NOW).posts.filter((p) => p.platform === 'youtube');
    expect(youtube[0].scheduledAtMs).toBe(at(27, 17));
    expect(youtube[1].scheduledAtMs).toBe(at(27 + 7, 17));
  });
});

describe('editing posts', () => {
  function saved(): { projectId: string; posts: ProjectPost[] } {
    const { project, brand } = setup();
    const { posts } = buildPosts(project, brand, NOW);
    savePosts(project.id, posts);
    return { projectId: project.id, posts };
  }

  it('changes a draft post', () => {
    const { projectId, posts } = saved();
    const result = updatePost(projectId, posts[2].id, { caption: 'New', scheduledAtMs: at(30, 12) });
    expect(result.ok).toBe(true);
    expect(getProject(projectId)!.posts![2]).toMatchObject({ caption: 'New', scheduledAtMs: at(30, 12) });
  });

  it('refuses to change a post that has gone out', () => {
    const { projectId, posts } = saved();
    updatePost(projectId, posts[2].id, { status: 'posted', link: 'https://instagram.com/p/1' });
    const result = updatePost(projectId, posts[2].id, { caption: 'Too late' });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('already');
    expect(getProject(projectId)!.posts![2].caption).toBe('IG caption');
  });

  it('a post already scheduled on YouTube is changed in YouTube Studio, not here', () => {
    const { projectId, posts } = saved();
    updatePost(projectId, posts[0].id, { status: 'scheduled', platformId: 'vid1' });
    const result = updatePost(projectId, posts[0].id, { scheduledAtMs: at(30, 9) });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('https://studio.youtube.com/video/vid1/edit');
    expect(cancelPost(projectId, posts[0].id).reason).toContain('https://studio.youtube.com/video/vid1/edit');
  });

  it('an Instagram post waiting for its time can still be changed or cancelled', () => {
    const { projectId, posts } = saved();
    updatePost(projectId, posts[2].id, { status: 'scheduled' });
    expect(updatePost(projectId, posts[2].id, { caption: 'Edited' }).ok).toBe(true);
    expect(cancelPost(projectId, posts[2].id).ok).toBe(true);
    expect(getProject(projectId)!.posts![2].status).toBe('cancelled');
  });
});
