import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

import { invoke } from '@tauri-apps/api/core';
import { buildMetaPublishRequest, publishMetaContent } from '../services/metaPublishService';

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
