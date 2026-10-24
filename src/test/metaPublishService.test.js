import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));
vi.mock('../services/connectors/connectorAuth', () => ({
  getConnectorCredential: vi.fn((id, key) => (id === 'meta' ? ({ META_ACCESS_TOKEN: 'saved-token', META_PAGE_ID: '42' })[key] || '' : '')),
}));

import { invoke } from '@tauri-apps/api/core';
import { buildMetaPublishRequest, publishMetaContent, publishMetaVideo, rescheduleMetaVideo, cancelMetaVideo, instagramPublishingLimit, metaTokenExpiry } from '../services/metaPublishService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildMetaPublishRequest', () => {
  it('returns a request with default platform "instagram" when none supplied', () => {
    const req = buildMetaPublishRequest({}, {});
    expect(req.platform).toBe('instagram');
  });

  it('uses options.platform when provided', () => {
    const req = buildMetaPublishRequest({}, { platform: 'facebook' });
    expect(req.platform).toBe('facebook');
  });

  it('falls back to job.request.platform when options.platform is absent', () => {
    const req = buildMetaPublishRequest({ request: { platform: 'threads' } }, {});
    expect(req.platform).toBe('threads');
  });

  it('sets approved: true when options.approved is truthy', () => {
    const req = buildMetaPublishRequest({}, { approved: true });
    expect(req.approved).toBe(true);
  });

  it('sets approved: false when options.approved is not set', () => {
    const req = buildMetaPublishRequest({}, {});
    expect(req.approved).toBe(false);
  });

  it('extracts caption from job.draft.caption', () => {
    const req = buildMetaPublishRequest({ draft: { caption: 'Hello world' } }, {});
    expect(req.caption).toBe('Hello world');
  });

  it('extracts imageUrl from job.assets.image_url', () => {
    const req = buildMetaPublishRequest({ assets: { image_url: 'https://img.example.com/1.jpg' } }, {});
    expect(req.imageUrl).toBe('https://img.example.com/1.jpg');
  });

  it('overrides job fields with options fields', () => {
    const req = buildMetaPublishRequest(
      { draft: { caption: 'Job caption' } },
      { caption: 'Override caption' }
    );
    expect(req.caption).toBe('Override caption');
  });

  it('returns empty strings for absent optional fields', () => {
    const req = buildMetaPublishRequest({}, {});
    expect(req.videoUrl).toBe('');
    expect(req.localFilePath).toBe('');
    expect(req.requestId).toBe('');
  });
});

describe('publishMetaContent', () => {
  it('calls invoke with meta_publish_content and the built request', async () => {
    invoke.mockResolvedValue({ ok: true });
    await publishMetaContent({ request: { platform: 'instagram' } }, { approved: true });
    expect(invoke).toHaveBeenCalledWith('meta_publish_content', expect.objectContaining({ request: expect.any(Object) }));
  });

  it('passes approved: true from options to invoke', async () => {
    invoke.mockResolvedValue({ ok: true });
    await publishMetaContent({}, { approved: true });
    const callArgs = invoke.mock.calls[0][1];
    expect(callArgs.request.approved).toBe(true);
  });

  it('forwards invoke result to caller', async () => {
    invoke.mockResolvedValue({ ok: true, published_id: '999' });
    const result = await publishMetaContent({}, {});
    expect(result.published_id).toBe('999');
  });
});

// Phase 3a: keys saved in Settings → Connectors → Meta reach the backend (QA Bug 32's rule).
describe('saved Meta keys', () => {
  it('passes the saved keys with every request; a key not saved is left for the environment', async () => {
    invoke.mockResolvedValue({ ok: true });
    await publishMetaContent({}, { platform: 'facebook', approved: true });
    const { request } = invoke.mock.calls[0][1];
    expect(request.credentials).toEqual({
      accessToken: 'saved-token', pageAccessToken: null, pageId: '42', instagramBusinessAccountId: null, appSecret: null, appId: null,
    });
  });
});

// Phase 3a: a video file on this computer posted as a Reel (meta_publish_video).
describe('publishMetaVideo', () => {
  it('sends the file, caption, time and saved keys, and returns what Meta did', async () => {
    invoke.mockResolvedValue({ ok: true, status: 'scheduled', postId: '9', url: 'https://www.facebook.com/reel/9', publishAtMs: 1800000000000 });
    const result = await publishMetaVideo({ platform: 'facebook', localFilePath: 'D:/out/v.mp4', caption: 'Hi #a', title: 'T', scheduledAtMs: 1800000000000, approved: true });
    expect(invoke).toHaveBeenCalledWith('meta_publish_video', {
      request: {
        approved: true, platform: 'facebook', localFilePath: 'D:/out/v.mp4', caption: 'Hi #a', title: 'T', scheduledAtMs: 1800000000000,
        credentials: expect.objectContaining({ accessToken: 'saved-token', pageId: '42' }),
      },
    });
    expect(result.status).toBe('scheduled');
  });

  it('is never approved unless the caller says so', async () => {
    invoke.mockResolvedValue({ ok: false, status: 'failed' });
    await publishMetaVideo({ platform: 'instagram', localFilePath: 'v.mp4', caption: '' });
    expect(invoke.mock.calls[0][1].request.approved).toBe(false);
    expect(invoke.mock.calls[0][1].request.scheduledAtMs).toBeNull();
  });

  it('says it failed when the backend cannot be reached', async () => {
    invoke.mockRejectedValue(new Error('no backend'));
    const result = await publishMetaVideo({ platform: 'instagram', localFilePath: 'v.mp4', caption: '', approved: true });
    expect(result).toEqual(expect.objectContaining({ ok: false, status: 'failed', message: 'no backend' }));
  });
});

// Phase 3b: move or cancel a scheduled Reel, Instagram's daily limit, the Meta sign-in's expiry.
describe('Meta changes and limits', () => {
  it('moves a scheduled Reel with the saved keys', async () => {
    invoke.mockResolvedValue({ ok: true, scheduledAtMs: 1800000000000 });
    const result = await rescheduleMetaVideo({ videoId: '123', scheduledAtMs: 1800000000000 });
    expect(invoke).toHaveBeenCalledWith('meta_reschedule_video', { request: expect.objectContaining({ videoId: '123', scheduledAtMs: 1800000000000, credentials: expect.objectContaining({ accessToken: 'saved-token' }) }) });
    expect(result.ok).toBe(true);
  });

  it('cancels a scheduled Reel', async () => {
    invoke.mockResolvedValue({ ok: false, reason: 'This has already gone out on Facebook.', manageUrl: 'https://business.facebook.com/latest/content_calendar' });
    const result = await cancelMetaVideo({ videoId: '123' });
    expect(invoke.mock.calls[0][0]).toBe('meta_cancel_video');
    expect(result).toMatchObject({ ok: false, manageUrl: expect.stringContaining('business.facebook.com') });
  });

  it("reads Instagram's posts left; null when Meta does not say", async () => {
    invoke.mockResolvedValueOnce({ ok: true, postsLeft: 97 });
    expect(await instagramPublishingLimit()).toBe(97);
    invoke.mockResolvedValueOnce({ ok: false, reason: 'x' });
    expect(await instagramPublishingLimit()).toBeNull();
    invoke.mockRejectedValueOnce(new Error('offline'));
    expect(await instagramPublishingLimit()).toBeNull();
  });

  it("reads the Meta sign-in's expiry; null when it can't", async () => {
    invoke.mockResolvedValueOnce({ ok: true, expiresAtMs: 1800000000000 });
    expect(await metaTokenExpiry()).toBe(1800000000000);
    invoke.mockResolvedValueOnce({ ok: false });
    expect(await metaTokenExpiry()).toBeNull();
  });
});
