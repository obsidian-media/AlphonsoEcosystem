// Phase 3d: what each platform takes as a vertical post (checked 2026-10-24).
import { describe, it, expect } from 'vitest';
import { fitsPlatform, formatSeconds, PLATFORM_LIMITS } from '../../../services/contentFactory/platformLimits';

const MB = 1024 * 1024;

describe('fitsPlatform', () => {
  it('Facebook Reels take 3 to 90 seconds', () => {
    expect(fitsPlatform('facebook', 'reel', 2.9).ok).toBe(false);
    expect(fitsPlatform('facebook', 'reel', 3).ok).toBe(true);
    expect(fitsPlatform('facebook', 'reel', 90).ok).toBe(true);
    const long = fitsPlatform('facebook', 'reel', 252);
    expect(long).toEqual({ ok: false, reason: 'Not a Facebook Reel: it is 4:12 long; Facebook takes 3–90 seconds.' });
    expect(fitsPlatform('facebook', 'reel', 90.1).ok).toBe(false);
  });

  it('a YouTube Short is up to 3 minutes; longer goes up as a regular video', () => {
    expect(fitsPlatform('youtube', 'short', 180)).toEqual({ ok: true });
    expect(fitsPlatform('youtube', 'short', 180.1)).toEqual({
      ok: true, asRegularVideo: true, reason: 'YouTube will show it as a regular video, not a Short: it is 3:01 long (Shorts are up to 3 minutes).',
    });
  });

  it('Instagram Reels take 3 seconds to 15 minutes and 300 MB', () => {
    expect(fitsPlatform('instagram', 'reel', 900).ok).toBe(true);
    expect(fitsPlatform('instagram', 'reel', 900.1).ok).toBe(false);
    expect(fitsPlatform('instagram', 'reel', 60, 300 * MB).ok).toBe(true);
    expect(fitsPlatform('instagram', 'reel', 60, 300 * MB + 1)).toMatchObject({ ok: false, reason: expect.stringContaining('300 MB') });
  });

  it('an unknown length is not refused; wide videos and carousels are not checked here', () => {
    expect(fitsPlatform('facebook', 'reel', null)).toEqual({ ok: true });
    expect(fitsPlatform('youtube', 'video', 3600)).toEqual({ ok: true });
    expect(fitsPlatform('instagram', 'carousel', null)).toEqual({ ok: true });
  });
});

it('formatSeconds writes m:ss', () => {
  expect(formatSeconds(252)).toBe('4:12');
  expect(formatSeconds(45)).toBe('0:45');
  expect(formatSeconds(180.4)).toBe('3:00');
});

it('the table says where each limit comes from', () => {
  expect(PLATFORM_LIMITS.facebook.source).toMatch(/developers\.facebook\.com/);
  expect(PLATFORM_LIMITS.youtube.source).toMatch(/support\.google\.com/);
});
