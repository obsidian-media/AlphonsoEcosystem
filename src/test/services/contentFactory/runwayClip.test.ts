import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../services/runwayService', () => ({ generateRunwayVideo: vi.fn() }));
vi.mock('../../../services/contentFactory/contentProjectFiles', async () => {
  const actual = await vi.importActual<typeof import('../../../services/contentFactory/contentProjectFiles')>('../../../services/contentFactory/contentProjectFiles');
  return { ...actual, loadProjectImage: vi.fn(async () => 'data:image/png;base64,AAAA') };
});
vi.mock('../../../services/connectors/connectorAuth', () => ({
  getConnectorCredential: vi.fn((id: string, key: string) => ((globalThis as any).__keys?.[key] ?? '')),
  isConnectorAuthenticated: vi.fn(() => ({ ok: true })),
}));

import { generateRunwayVideo } from '../../../services/runwayService';
import { monthSpendUsd } from '../../../services/jose/joseSpend';
import {
  estimateRunwayUsd, makeRunwayClip, runwayClipAvailable, runwayClipSeconds,
} from '../../../services/contentFactory/runwayClip';

const setSettings = (paid: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  localStorage.setItem('alphonso_settings', JSON.stringify({ zeroCostMode: false, ...extra, paidModels: { runwayPricePerSecondUsd: 0.05, ...paid } }));

beforeEach(() => {
  localStorage.clear();
  (globalThis as any).__keys = { RUNWAYML_API_SECRET: 'key_x' };
  vi.mocked(generateRunwayVideo).mockReset();
  setSettings();
});

const input = { root: 'D:\\Content', imageRel: 'b/p/scenes/v1-s1.png', outDirRel: 'b/p/clips', prompt: 'A barista pours coffee', seconds: 7, vertical: false, model: 'gen4_turbo' };

// Miya content factory phase 2b: Runway clips with the cost and the monthly limit.
describe('Runway clip lengths and cost', () => {
  it('a clip is 5 or 10 seconds, the shorter that covers the scene', () => {
    expect(runwayClipSeconds(3)).toBe(5);
    expect(runwayClipSeconds(5)).toBe(5);
    expect(runwayClipSeconds(7)).toBe(10);
    expect(runwayClipSeconds(14)).toBe(10);
  });

  it('estimates from the clip lengths and your price per second', () => {
    expect(estimateRunwayUsd([3, 7])).toBeCloseTo((5 + 10) * 0.05);
    setSettings({ runwayPricePerSecondUsd: '' });
    expect(estimateRunwayUsd([3])).toBeNull();
  });
});

describe('runwayClipAvailable', () => {
  it('needs the key, Zero-Cost Mode off and a price', () => {
    expect(runwayClipAvailable()).toEqual({ ok: true });
    (globalThis as any).__keys = {};
    expect(runwayClipAvailable().reason).toBe('Add a Runway key in Connectors.');
    (globalThis as any).__keys = { RUNWAYML_API_SECRET: 'key_x' };
    setSettings({}, { zeroCostMode: true });
    expect(runwayClipAvailable().reason).toBe('Zero-Cost Mode is on; turn it off in Settings to use Runway.');
    setSettings({ runwayPricePerSecondUsd: '' });
    expect(runwayClipAvailable().reason).toBe("Enter Runway's price per second in Settings → General → Allow paid models.");
  });
});

describe('makeRunwayClip', () => {
  it('sends the picture, the ratio and the length, approved, and records the cost', async () => {
    vi.mocked(generateRunwayVideo).mockResolvedValue({ ok: true, outputFiles: ['D:\\Content\\b\\p\\clips\\runway-t1-0.mp4'], taskId: 't1' } as any);
    const result = await makeRunwayClip(input);
    expect(generateRunwayVideo).toHaveBeenCalledWith(
      expect.objectContaining({ promptText: 'A barista pours coffee', promptImage: 'data:image/png;base64,AAAA', model: 'gen4_turbo', ratio: '1280:720', duration: 10, outputDir: 'D:\\Content\\b\\p\\clips' }),
      expect.objectContaining({ approved: true }),
    );
    expect(result).toEqual({ status: 'done', path: 'b/p/clips/runway-t1-0.mp4', costUsd: 0.5 });
    expect(monthSpendUsd()).toBeCloseTo(0.5);
  });

  it('a vertical project asks for a portrait clip', async () => {
    vi.mocked(generateRunwayVideo).mockResolvedValue({ ok: true, outputFiles: ['D:\\Content\\b\\p\\clips\\r.mp4'] } as any);
    await makeRunwayClip({ ...input, vertical: true, seconds: 3 });
    expect(vi.mocked(generateRunwayVideo).mock.calls[0][0]).toMatchObject({ ratio: '720:1280', duration: 5 });
  });

  it('refuses before sending anything when the monthly limit would be passed', async () => {
    setSettings({ monthlyCapUsd: 0.3 });
    const result = await makeRunwayClip(input);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('monthly cap');
    expect(generateRunwayVideo).not.toHaveBeenCalled();
  });

  it('says why when Runway fails, and records nothing', async () => {
    vi.mocked(generateRunwayVideo).mockResolvedValue({ ok: false, error: 'Insufficient credits', outputFiles: [] } as any);
    expect(await makeRunwayClip(input)).toEqual({ status: 'failed', error: 'Insufficient credits' });
    expect(monthSpendUsd()).toBe(0);
  });

  it('waits up to 30 minutes, and a timeout says Runway may still charge for it', async () => {
    vi.mocked(generateRunwayVideo).mockResolvedValue({ ok: false, error: 'Runway task timed out after 1800s.', outputFiles: [] } as any);
    const result = await makeRunwayClip(input);
    expect(vi.mocked(generateRunwayVideo).mock.calls[0][0]).toMatchObject({ timeoutSeconds: 1800 });
    expect(result.status).toBe('failed');
    expect(result.error).toBe('Runway task timed out after 1800s. Runway may still charge for this clip; check your Runway account.');
  });

  it('a saved file outside the output folder is refused', async () => {
    vi.mocked(generateRunwayVideo).mockResolvedValue({ ok: true, outputFiles: ['C:\\elsewhere\\x.mp4'] } as any);
    expect((await makeRunwayClip(input)).status).toBe('failed');
    // Runway made it, so it was paid for: the month's total says so.
    expect(monthSpendUsd()).toBeCloseTo(0.5);
  });
});
