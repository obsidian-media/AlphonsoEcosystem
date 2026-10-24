// Phase 3a: one publishing path. A post goes to YouTube or Meta and the result is what the platform did.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const uploadYouTube = vi.fn();
const publishMetaVideo = vi.fn();
const publishMetaContent = vi.fn();
vi.mock('../../../services/connectors/connectorOutbound', () => ({ uploadYouTubeConnectorVideo: (...a: unknown[]) => uploadYouTube(...a) }));
vi.mock('../../../services/metaPublishService', () => ({
  publishMetaVideo: (...a: unknown[]) => publishMetaVideo(...a),
  publishMetaContent: (...a: unknown[]) => publishMetaContent(...a),
}));

import { publishPost, type PublishablePost } from '../../../services/contentFactory/publishPost';
import type { ProjectPost } from '../../../services/contentFactory/contentTypes';

const NOW = new Date(2026, 9, 26, 10, 0).getTime();
const HOUR = 3_600_000;
const post = (patch: Partial<PublishablePost> = {}): PublishablePost => ({
  id: 'post-1', platform: 'youtube', piece: 'video', file: 'acme/launch/output/video-16x9-v1.mp4',
  thumbnail: 'acme/launch/thumbnail/t2.png', title: 'Launch', caption: 'Watch this', hashtags: ['#ai', '#tools'],
  scheduledAtMs: NOW + 5 * HOUR, status: 'approved', ...patch,
});
const settings = { outputFolder: 'D:\\Content' };

beforeEach(() => { uploadYouTube.mockReset(); publishMetaVideo.mockReset(); publishMetaContent.mockReset(); });

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
    expect(await publishPost(post({ platform: 'instagram', piece: 'reel' }), settings, NOW)).toEqual({ status: 'failed', reason: 'Add the Meta access token…', setupRequired: true });
  });
});

it('without an output folder nothing is sent', async () => {
  const result = await publishPost(post(), { outputFolder: '' }, NOW);
  expect(result.status).toBe('failed');
  expect(result.reason).toContain('output folder');
  expect(uploadYouTube).not.toHaveBeenCalled();
});

// Content Studio's posts (phase 3a): a full path on this computer, or a public media address.
describe('publishPost: Content Studio', () => {
  it('a full path is used as it is, with no output folder needed', async () => {
    publishMetaVideo.mockResolvedValue({ ok: true, status: 'posted', postId: 'm1' });
    await publishPost(post({ platform: 'instagram', piece: 'reel', file: 'D:/Videos/reel.mp4', scheduledAtMs: NOW }), { outputFolder: '' }, NOW);
    expect(publishMetaVideo.mock.calls[0][0].localFilePath).toBe('D:/Videos/reel.mp4');
  });

  it('a public image or video address goes through the address path', async () => {
    publishMetaContent.mockResolvedValue({ ok: true, published: true, postIds: ['p9'], url: 'https://www.instagram.com/p/9' });
    const result = await publishPost(post({ platform: 'instagram', piece: 'reel', file: '', mediaUrl: 'https://cdn.example/x.jpg', mediaType: 'image', caption: 'Hi', hashtags: [] }), { outputFolder: '' }, NOW);
    expect(publishMetaContent).toHaveBeenCalledWith({}, expect.objectContaining({ approved: true, platform: 'instagram', caption: 'Hi', imageUrl: 'https://cdn.example/x.jpg', videoUrl: '' }));
    expect(result).toEqual({ status: 'posted', link: 'https://www.instagram.com/p/9', platformId: 'p9' });
  });

  it('says when Meta needs setting up', async () => {
    publishMetaContent.mockResolvedValue({ ok: true, published: false, setupRequired: true, message: 'Add the keys.' });
    const result = await publishPost(post({ platform: 'facebook', piece: 'reel', file: '', mediaUrl: '' }), { outputFolder: '' }, NOW);
    expect(result).toEqual({ status: 'failed', reason: 'Add the keys.', setupRequired: true });
  });
});

// Phase 3b: an expired sign-in says so plainly.
describe('publishPost: expired sign-ins', () => {
  it('YouTube', async () => {
    uploadYouTube.mockResolvedValue({ ok: false, error: 'invalid_grant: Token has been expired or revoked.' });
    expect((await publishPost(post(), settings, NOW)).reason).toBe('Sign in to YouTube again in Settings → Connectors: the sign-in has run out.');
  });
  it('Meta', async () => {
    publishMetaVideo.mockResolvedValue({ ok: false, status: 'failed', message: 'Error validating access token: Session has expired' });
    expect((await publishPost(post({ platform: 'instagram', piece: 'reel' }), settings, NOW)).reason).toBe('Sign in to Meta again in Settings → Connectors: the sign-in has run out.');
  });
});

// Phase 3d: a post that doesn't fit its platform is refused before anything is sent.
it("publishPost refuses a post that doesn't fit, before sending", async () => {
  const result = await publishPost(post({ platform: 'facebook', piece: 'reel', seconds: 252 }), settings, NOW);
  expect(result).toEqual({ status: 'failed', reason: 'Not a Facebook Reel: it is 4:12 long; Facebook takes 3–90 seconds.' });
  expect(publishMetaVideo).not.toHaveBeenCalled();
});
