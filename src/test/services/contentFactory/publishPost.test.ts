// Phase 3a: one publishing path. A post goes to YouTube or Meta and the result is what the platform did.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const uploadYouTube = vi.fn();
const publishMetaVideo = vi.fn();
vi.mock('../../../services/connectors/connectorOutbound', () => ({ uploadYouTubeConnectorVideo: (...a: unknown[]) => uploadYouTube(...a) }));
vi.mock('../../../services/metaPublishService', () => ({ publishMetaVideo: (...a: unknown[]) => publishMetaVideo(...a) }));

import { publishPost } from '../../../services/contentFactory/publishPost';
import type { ProjectPost } from '../../../services/contentFactory/contentTypes';

const NOW = new Date(2026, 9, 26, 10, 0).getTime();
const HOUR = 3_600_000;
const post = (patch: Partial<ProjectPost> = {}): ProjectPost => ({
  id: 'post-1', platform: 'youtube', piece: 'video', file: 'acme/launch/output/video-16x9-v1.mp4',
  thumbnail: 'acme/launch/thumbnail/t2.png', title: 'Launch', caption: 'Watch this', hashtags: ['#ai', '#tools'],
  scheduledAtMs: NOW + 5 * HOUR, status: 'approved', ...patch,
});
const settings = { outputFolder: 'D:\\Content' };

beforeEach(() => { uploadYouTube.mockReset(); publishMetaVideo.mockReset(); });

describe('publishPost: YouTube', () => {
  it('uploads with the scheduled time and thumbnail, already approved', async () => {
    uploadYouTube.mockResolvedValue({ ok: true, videoId: 'v1', url: 'https://www.youtube.com/watch?v=v1', privacyStatus: 'private', publishAt: '2026-10-26T13:00:00.000Z' });
    const result = await publishPost(post(), settings, NOW);
    const [args, options] = uploadYouTube.mock.calls[0];
    expect(args).toMatchObject({
      filePath: 'D:\\Content\\acme\\launch\\output\\video-16x9-v1.mp4', title: 'Launch', privacyStatus: 'public',
      publishAt: new Date(NOW + 5 * HOUR).toISOString(), thumbnailPath: 'D:\\Content\\acme\\launch\\thumbnail\\t2.png', tags: ['ai', 'tools'],
    });
    expect(args.description).toBe('Watch this\n\n#ai #tools');
    expect(options).toMatchObject({ approved: true });
    expect(result).toEqual({ status: 'scheduled', link: 'https://www.youtube.com/watch?v=v1', platformId: 'v1' });
  });

  it('a time already past (or minutes away) uploads public now', async () => {
    uploadYouTube.mockResolvedValue({ ok: true, videoId: 'v1', url: 'u', privacyStatus: 'public' });
    const result = await publishPost(post({ scheduledAtMs: NOW - HOUR }), settings, NOW);
    expect(uploadYouTube.mock.calls[0][0].publishAt).toBeNull();
    expect(result.status).toBe('posted');
  });

  it('a channel YouTube keeps private says so, with the Studio link', async () => {
    uploadYouTube.mockResolvedValue({ ok: true, videoId: 'v1', url: 'u', privacyStatus: 'private', lockedPrivate: true, note: 'YouTube kept this video private … https://studio.youtube.com/video/v1/edit' });
    const result = await publishPost(post(), settings, NOW);
    expect(result).toMatchObject({ status: 'locked_private', platformId: 'v1' });
    expect(result.reason).toContain('https://studio.youtube.com/video/v1/edit');
  });

  it('uploaded but its state could not be confirmed: check, never "posted"', async () => {
    uploadYouTube.mockResolvedValue({ ok: true, videoId: 'v1', url: 'u', privacyStatus: 'public', note: "Uploaded, but YouTube's status could not be read back; check YouTube Studio." });
    expect((await publishPost(post({ scheduledAtMs: NOW }), settings, NOW)).status).toBe('check');
  });

  it("a failed upload is failed with YouTube's reason", async () => {
    uploadYouTube.mockResolvedValue({ ok: false, error: 'quotaExceeded' });
    expect(await publishPost(post(), settings, NOW)).toEqual({ status: 'failed', reason: 'quotaExceeded' });
  });

  it('the Short goes without a thumbnail', async () => {
    uploadYouTube.mockResolvedValue({ ok: true, videoId: 'v2', url: 'u', privacyStatus: 'public' });
    await publishPost(post({ piece: 'short', thumbnail: undefined, scheduledAtMs: NOW }), settings, NOW);
    expect(uploadYouTube.mock.calls[0][0].thumbnailPath).toBeNull();
  });
});

describe('publishPost: Meta', () => {
  it('posts an Instagram Reel now, with its caption and hashtags', async () => {
    publishMetaVideo.mockResolvedValue({ ok: true, status: 'posted', postId: 'm1', url: 'https://www.instagram.com/reel/x' });
    const result = await publishPost(post({ platform: 'instagram', piece: 'reel', caption: 'IG #ai', hashtags: ['#ai', '#more'] }), settings, NOW);
    expect(publishMetaVideo).toHaveBeenCalledWith({
      platform: 'instagram', localFilePath: 'D:\\Content\\acme\\launch\\output\\video-16x9-v1.mp4',
      caption: 'IG #ai #more', title: 'Launch', scheduledAtMs: null, approved: true,
    });
    expect(result).toEqual({ status: 'posted', link: 'https://www.instagram.com/reel/x', platformId: 'm1' });
  });

  it('schedules a Facebook Reel on Meta', async () => {
    publishMetaVideo.mockResolvedValue({ ok: true, status: 'scheduled', postId: 'f1', url: 'https://www.facebook.com/reel/f1' });
    const result = await publishPost(post({ platform: 'facebook', piece: 'reel' }), settings, NOW);
    expect(publishMetaVideo.mock.calls[0][0].scheduledAtMs).toBe(NOW + 5 * HOUR);
    expect(result.status).toBe('scheduled');
  });

  it('missing keys or a refusal fail with the reason', async () => {
    publishMetaVideo.mockResolvedValue({ ok: false, status: 'setup_required', message: 'Add the Meta access token…' });
    expect(await publishPost(post({ platform: 'instagram', piece: 'reel' }), settings, NOW)).toEqual({ status: 'failed', reason: 'Add the Meta access token…' });
  });
});

it('without an output folder nothing is sent', async () => {
  const result = await publishPost(post(), { outputFolder: '' }, NOW);
  expect(result.status).toBe('failed');
  expect(result.reason).toContain('output folder');
  expect(uploadYouTube).not.toHaveBeenCalled();
});
