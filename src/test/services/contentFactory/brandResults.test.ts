// Phase 4a: a post is compared with its own brand's usual numbers.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  BANDS, MIN_POSTS_TO_COMPARE, MAIN_METRIC, brandMedian, postBand, brandResultRows, permissionBanners, FIRST_POSTS,
} from '../../../services/contentFactory/brandResults';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { createProject, emptyBrief } from '../../../services/contentFactory/contentProjectService';
import { savePosts } from '../../../services/contentFactory/contentPosts';
import type { ProjectPost } from '../../../services/contentFactory/contentTypes';

const NOW = Date.UTC(2026, 9, 24);
const reading = (views: number) => ({ readAtMs: NOW, values: { views }, unavailable: [] });
const post = (id: string, views: number | null, platform: ProjectPost['platform'] = 'instagram'): ProjectPost => ({
  id, platform, piece: 'reel', file: 'f', title: id, caption: '', hashtags: [], scheduledAtMs: NOW, status: 'posted',
  platformId: id, sentAtMs: NOW, ...(views === null ? {} : { metrics: { readings: { '7d': reading(views) } } }),
});

function brandWith(posts: ProjectPost[]) {
  const b = saveBrand({ name: 'Acme' });
  const p = createProject(b.id, 'Launch', emptyBrief());
  savePosts(p.id, posts);
  return b.id;
}

beforeEach(() => localStorage.clear());

describe('brandResults', () => {
  it('uses the agreed bands', () => {
    expect(BANDS).toEqual({ good: 1.5, weak: 0.5 });
    expect(MIN_POSTS_TO_COMPARE).toBe(3);
    expect(MAIN_METRIC).toBe('views');
  });

  it('a post is compared with its own brand', () => {
    const brandId = brandWith([post('a', 100), post('b', 200), post('c', 300), post('hit', 450), post('miss', 90), post('mid', 200)]);
    const other = saveBrand({ name: 'Other' });
    const op = createProject(other.id, 'X', emptyBrief());
    savePosts(op.id, [post('o1', 100000), post('o2', 100000), post('o3', 100000)]);
    expect(brandMedian(brandId, 'instagram', '7d', 'hit')).toBe(200);
    const band = (id: string, views: number) => postBand(post(id, views), brandId, '7d');
    expect(band('hit', 450)).toBe('good');
    expect(band('miss', 90)).toBe('weak');
    expect(band('mid', 200)).toBe('usual');
  });

  it('with fewer than 3 earlier posts there is nothing to compare', () => {
    const brandId = brandWith([post('a', 100), post('b', 200)]);
    expect(postBand(post('b', 200), brandId, '7d')).toBe('first');
    expect(FIRST_POSTS).toBe('First posts: nothing to compare with yet');
  });

  it('another platform is not compared with', () => {
    const brandId = brandWith([post('a', 100, 'youtube'), post('b', 100, 'youtube'), post('c', 100, 'youtube'), post('ig', 500)]);
    expect(postBand(post('ig', 500), brandId, '7d')).toBe('first');
  });

  it('a post without the number has no band', () => {
    const brandId = brandWith([post('a', 100), post('b', 100), post('c', 100)]);
    expect(postBand(post('none', null), brandId, '7d')).toBeNull();
  });

  it("the brand's results list each post with its 7-day numbers and band", () => {
    const brandId = brandWith([post('a', 100), post('b', 200), post('c', 300), post('d', 900), post('e', null)]);
    const rows = brandResultRows(brandId);
    expect(rows.map((r) => r.post.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(rows.find((r) => r.post.id === 'd')).toMatchObject({ projectName: 'Launch', band: 'good' });
  });

  it('a banner per service that needs a new sign-in', () => {
    localStorage.setItem('alphonso_metrics_permissions_v1', JSON.stringify({ youtube: true, meta: true, instagram: true }));
    expect(permissionBanners()).toEqual([
      'Sign in again to see YouTube numbers',
      'Sign in again to see Facebook and Instagram numbers',
      'Sign in again with Instagram to see Instagram numbers',
    ]);
  });
});
