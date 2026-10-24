// Phase 3c: carousels, Instagram by link through the user's storage, Facebook photo posts,
// and "Post by hand" when there is no storage.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const publishMetaVideo = vi.fn();
const publishInstagramByUrl = vi.fn();
const publishFacebookPhotos = vi.fn();
const storageConfigured = vi.fn();
const stageFile = vi.fn();
const removeStaged = vi.fn();
const getInstagramRoute = vi.fn();
const exportForHand = vi.fn();
vi.mock('../../../services/connectors/connectorOutbound', () => ({ uploadYouTubeConnectorVideo: vi.fn() }));
vi.mock('../../../services/metaPublishService', () => ({
  publishMetaVideo: (...a: unknown[]) => publishMetaVideo(...a),
  publishMetaContent: vi.fn(),
  publishInstagramByUrl: (...a: unknown[]) => publishInstagramByUrl(...a),
  publishFacebookPhotos: (...a: unknown[]) => publishFacebookPhotos(...a),
}));
vi.mock('../../../services/mediaStorageService', () => ({
  storageConfigured: () => storageConfigured(),
  stageFile: (...a: unknown[]) => stageFile(...a),
  removeStaged: (...a: unknown[]) => removeStaged(...a),
}));
vi.mock('../../../services/contentFactory/instagramRoute', () => ({ getInstagramRoute: () => getInstagramRoute() }));
vi.mock('../../../services/contentFactory/readyToPost', () => ({ exportForHand: (...a: unknown[]) => exportForHand(...a) }));

import { publishPost, type PublishablePost } from '../../../services/contentFactory/publishPost';

const NOW = new Date(2026, 9, 26, 10, 0).getTime();
const HOUR = 3_600_000;
const settings = { outputFolder: 'D:/Content' };
const reel = (patch: Partial<PublishablePost> = {}): PublishablePost => ({
  id: 'p1', platform: 'instagram', piece: 'reel', file: 'acme/launch/output/video-9x16-v1.mp4', title: 'Launch',
  caption: 'Watch', hashtags: ['#ai'], scheduledAtMs: NOW, status: 'approved', ...patch,
});
const slides = ['acme/launch/carousel/v1-1.png', 'acme/launch/carousel/v1-2.png', 'acme/launch/carousel/v1-3.png'];
const carousel = (patch: Partial<PublishablePost> = {}) => reel({ id: 'c1', piece: 'carousel', file: slides[0], files: slides, ...patch });

let staged = 0;
beforeEach(() => {
  [publishMetaVideo, publishInstagramByUrl, publishFacebookPhotos, storageConfigured, stageFile, removeStaged, getInstagramRoute, exportForHand].forEach((f) => f.mockReset());
  staged = 0;
  storageConfigured.mockResolvedValue(true);
  stageFile.mockImplementation(async (_root: string, rel: string) => ({ ok: true, url: `https://link/${rel.split('/').pop()}`, key: `k${++staged}` }));
  exportForHand.mockResolvedValue({ folder: 'acme/launch/ready-to-post/instagram-carousel-v1' });
});

describe('Instagram Reels', () => {
  it('an Instagram Reel on the Page route still uploads from the computer', async () => {
    getInstagramRoute.mockResolvedValue('page');
    publishMetaVideo.mockResolvedValue({ ok: true, status: 'posted', postId: 'm1', url: 'https://ig/p' });
    expect((await publishPost(reel(), settings, NOW)).status).toBe('posted');
    expect(stageFile).not.toHaveBeenCalled();
    expect(publishMetaVideo).toHaveBeenCalled();
  });

  it('an Instagram Reel on Instagram Login is staged, posted by link, and the staged file removed', async () => {
    getInstagramRoute.mockResolvedValue('instagram_login');
    publishInstagramByUrl.mockResolvedValue({ ok: true, status: 'posted', postId: 'm2', url: 'https://ig/r' });
    const result = await publishPost(reel(), settings, NOW);
    expect(stageFile).toHaveBeenCalledWith('D:/Content', 'acme/launch/output/video-9x16-v1.mp4');
    expect(publishInstagramByUrl).toHaveBeenCalledWith({ route: 'instagram_login', mediaType: 'REELS', videoUrl: 'https://link/video-9x16-v1.mp4', caption: 'Watch\n\n#ai' });
    expect(removeStaged).toHaveBeenCalledWith('k1');
    expect(result).toEqual({ status: 'posted', link: 'https://ig/r', platformId: 'm2' });
  });

  it('without storage, a Reel on Instagram Login becomes Post by hand', async () => {
    getInstagramRoute.mockResolvedValue('instagram_login');
    storageConfigured.mockResolvedValue(false);
    exportForHand.mockResolvedValue({ folder: 'acme/launch/ready-to-post/instagram-reel-v1' });
    const result = await publishPost(reel(), settings, NOW);
    expect(result).toMatchObject({ status: 'by_hand', folder: 'acme/launch/ready-to-post/instagram-reel-v1' });
    expect(publishInstagramByUrl).not.toHaveBeenCalled();
  });
});

describe('Carousels', () => {
  it('a carousel on Instagram stages every slide and posts one carousel', async () => {
    getInstagramRoute.mockResolvedValue('page');
    publishInstagramByUrl.mockResolvedValue({ ok: true, status: 'posted', postId: 'm3', url: 'https://ig/c' });
    const result = await publishPost(carousel(), settings, NOW);
    expect(stageFile.mock.calls.map((c) => c[1])).toEqual(slides);
    expect(publishInstagramByUrl).toHaveBeenCalledWith({
      route: 'page', mediaType: 'CAROUSEL', imageUrls: ['https://link/v1-1.png', 'https://link/v1-2.png', 'https://link/v1-3.png'], caption: 'Watch\n\n#ai',
    });
    expect(removeStaged.mock.calls.map((c) => c[0])).toEqual(['k1', 'k2', 'k3']);
    expect(result.status).toBe('posted');
  });

  it('without storage, an Instagram carousel becomes Post by hand with its folder', async () => {
    getInstagramRoute.mockResolvedValue('page');
    storageConfigured.mockResolvedValue(false);
    const result = await publishPost(carousel(), settings, NOW);
    expect(exportForHand).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1', files: slides }), 'D:/Content');
    expect(result).toEqual({
      status: 'by_hand', folder: 'acme/launch/ready-to-post/instagram-carousel-v1',
      reason: 'Saved to post by hand (no storage is set up): acme/launch/ready-to-post/instagram-carousel-v1',
    });
    expect(stageFile).not.toHaveBeenCalled();
  });

  it('when posting by link fails, the staged files are still removed', async () => {
    getInstagramRoute.mockResolvedValue('page');
    publishInstagramByUrl.mockResolvedValue({ ok: false, status: 'failed', message: 'Instagram refused the post.' });
    const result = await publishPost(carousel(), settings, NOW);
    expect(result).toEqual({ status: 'failed', reason: 'Instagram refused the post.' });
    expect(removeStaged).toHaveBeenCalledTimes(3);
  });

  it('when a slide cannot be staged, nothing is posted and the ones staged are removed', async () => {
    getInstagramRoute.mockResolvedValue('page');
    stageFile.mockResolvedValueOnce({ ok: true, url: 'https://link/1', key: 'k1' }).mockResolvedValueOnce({ ok: false, reason: 'Your storage refused the upload (403).' });
    const result = await publishPost(carousel(), settings, NOW);
    expect(result).toEqual({ status: 'failed', reason: 'Your storage refused the upload (403).' });
    expect(publishInstagramByUrl).not.toHaveBeenCalled();
    expect(removeStaged).toHaveBeenCalledWith('k1');
  });

  it('a Facebook carousel uploads the photos from the computer and is scheduled on Meta', async () => {
    publishFacebookPhotos.mockResolvedValue({ ok: true, status: 'scheduled', postId: '1_2', url: 'https://www.facebook.com/1_2' });
    const at = NOW + 5 * HOUR;
    const result = await publishPost(carousel({ platform: 'facebook', scheduledAtMs: at }), settings, NOW);
    expect(publishFacebookPhotos).toHaveBeenCalledWith({ root: 'D:/Content', photoFiles: slides, message: 'Watch\n\n#ai', scheduledAtMs: at });
    expect(stageFile).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'scheduled', link: 'https://www.facebook.com/1_2', platformId: '1_2' });
  });

  it('with no Instagram route set up, says what to set up', async () => {
    getInstagramRoute.mockResolvedValue(null);
    const result = await publishPost(carousel(), settings, NOW);
    expect(result).toMatchObject({ status: 'failed', setupRequired: true });
    expect(result.reason).toMatch(/Settings → Connectors → Meta/);
  });
});
