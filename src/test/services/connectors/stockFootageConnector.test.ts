import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../../../services/connectors/connectorAuth', () => ({
  getConnectorCredential: vi.fn((id: string, key: string) => ((globalThis as any).__keys || {})[`${id}:${key}`] || ''),
}));
vi.mock('../../../services/policyEnforcementService', () => ({ evaluatePolicyGate: vi.fn(() => ({ ok: true })) }));

import { invoke } from '@tauri-apps/api/core';
import { evaluatePolicyGate } from '../../../services/policyEnforcementService';
import { configuredStockSources, searchStockClips } from '../../../services/connectors/stockFootageConnector';

const PEXELS = {
  videos: [{
    id: 11, duration: 12, width: 3840, height: 2160, url: 'https://www.pexels.com/video/11/', user: { name: 'Ana' },
    video_files: [
      { link: 'https://videos.pexels.com/11-hd.mp4', width: 1920, height: 1080, file_type: 'video/mp4' },
      { link: 'https://videos.pexels.com/11-4k.mp4', width: 3840, height: 2160, file_type: 'video/mp4' },
    ],
  }],
};
const PIXABAY = {
  hits: [{ id: 22, duration: 3, pageURL: 'https://pixabay.com/videos/22/', user: 'Ben', videos: { large: { url: 'https://cdn.pixabay.com/22.mp4', width: 1920, height: 1080 } } }],
};
const COVERR = {
  hits: [{ id: 'c3', duration: 9.5, title: 'Coffee', urls: { mp4_download: 'https://storage.coverr.co/c3.mp4' }, max_width: 1080, max_height: 1920 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as any).__keys = {};
});

// Miya content factory phase 2a (owner): whichever stock sources have keys.
describe('stock footage', () => {
  it('with no keys, no source is searched', async () => {
    expect(configuredStockSources()).toEqual([]);
    expect(await searchStockClips('coffee', { orientation: 'landscape', minSeconds: 3 })).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('searches each source that has a key, through the backend, after the policy check', async () => {
    (globalThis as any).__keys = { 'pexels:PEXELS_API_KEY': 'pk', 'pixabay:PIXABAY_API_KEY': 'xk' };
    expect(configuredStockSources()).toEqual(['pexels', 'pixabay']);
    vi.mocked(invoke).mockImplementation(async (_cmd, args: any) => (args.request.source === 'pexels' ? PEXELS : PIXABAY));
    const clips = await searchStockClips('coffee shop', { orientation: 'landscape', minSeconds: 2 });
    expect(vi.mocked(invoke).mock.calls.map((c) => [c[0], (c[1] as any).request])).toEqual([
      ['content_stock_search', { source: 'pexels', query: 'coffee shop', orientation: 'landscape', apiKey: 'pk' }],
      ['content_stock_search', { source: 'pixabay', query: 'coffee shop', orientation: 'landscape', apiKey: 'xk' }],
    ]);
    expect(evaluatePolicyGate).toHaveBeenCalledWith(expect.objectContaining({ connectorId: 'pexels' }));
    expect(clips).toEqual([
      { source: 'pexels', id: '11', url: 'https://videos.pexels.com/11-hd.mp4', durationSec: 12, width: 1920, height: 1080, author: 'Ana', pageUrl: 'https://www.pexels.com/video/11/', license: 'Pexels License (free to use, no attribution required)' },
      { source: 'pixabay', id: '22', url: 'https://cdn.pixabay.com/22.mp4', durationSec: 3, width: 1920, height: 1080, author: 'Ben', pageUrl: 'https://pixabay.com/videos/22/', license: 'Pixabay Content License (free to use)' },
    ]);
  });

  it('keeps only clips of the right shape and length', async () => {
    (globalThis as any).__keys = { 'coverr:COVERR_API_KEY': 'ck', 'pixabay:PIXABAY_API_KEY': 'xk' };
    vi.mocked(invoke).mockImplementation(async (_cmd, args: any) => (args.request.source === 'coverr' ? COVERR : PIXABAY));
    const portrait = await searchStockClips('coffee', { orientation: 'portrait', minSeconds: 4 });
    expect(portrait.map((c) => [c.source, c.id, c.license])).toEqual([['coverr', 'c3', 'Coverr License (free to use, no attribution required)']]);
  });

  it('a source that fails does not stop the others', async () => {
    (globalThis as any).__keys = { 'pexels:PEXELS_API_KEY': 'pk', 'pixabay:PIXABAY_API_KEY': 'xk' };
    vi.mocked(invoke).mockImplementation(async (_cmd, args: any) => {
      if (args.request.source === 'pexels') throw new Error('HTTP 401');
      return PIXABAY;
    });
    const clips = await searchStockClips('coffee', { orientation: 'landscape', minSeconds: 1 });
    expect(clips.map((c) => c.source)).toEqual(['pixabay']);
  });
});
