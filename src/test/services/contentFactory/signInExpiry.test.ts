// Phase 3b: knowing when the YouTube and Meta sign-ins run out, and warning before.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const metaTokenExpiry = vi.fn();
vi.mock('../../../services/metaPublishService', () => ({ metaTokenExpiry: (...a: unknown[]) => metaTokenExpiry(...a) }));

import {
  recordSignIn, getSignInExpiry, signInWarnings, setYoutubeProjectPublished, isYoutubeProjectPublished, plainSignInReason,
} from '../../../services/contentFactory/signInExpiry';
import type { ProjectPost } from '../../../services/contentFactory/contentTypes';

const DAY = 24 * 3_600_000;
const NOW = new Date(2026, 9, 26, 10, 0).getTime();
const post = (patch: Partial<ProjectPost>): ProjectPost => ({
  id: 'p', platform: 'instagram', piece: 'reel', file: 'f', title: 'Launch', caption: '', hashtags: [], scheduledAtMs: NOW + DAY, status: 'scheduled', ...patch,
});

beforeEach(() => { localStorage.clear(); metaTokenExpiry.mockReset().mockResolvedValue(null); });

describe('getSignInExpiry', () => {
  it('YouTube: about 7 days from when the keys were saved; none when the project is Published or never saved', async () => {
    expect(await getSignInExpiry('youtube', NOW)).toEqual({ expiresAtMs: null, exact: false });
    recordSignIn('youtube', NOW - 2 * DAY);
    expect(await getSignInExpiry('youtube', NOW)).toEqual({ expiresAtMs: NOW + 5 * DAY, exact: false });
    setYoutubeProjectPublished(true);
    expect(isYoutubeProjectPublished()).toBe(true);
    expect(await getSignInExpiry('youtube', NOW)).toEqual({ expiresAtMs: null, exact: false });
  });

  it("Meta: Meta's own date when it says, else 60 days from saving", async () => {
    recordSignIn('meta', NOW);
    expect(await getSignInExpiry('meta', NOW)).toEqual({ expiresAtMs: NOW + 60 * DAY, exact: false });
    metaTokenExpiry.mockResolvedValueOnce(NOW + 10 * DAY);
    expect(await getSignInExpiry('meta', NOW)).toEqual({ expiresAtMs: NOW + 10 * DAY, exact: true });
  });
});

describe('signInWarnings', () => {
  it('YouTube warns 2 days before, not earlier; and says when it has run out', async () => {
    recordSignIn('youtube', NOW - 4 * DAY);
    expect(await signInWarnings(NOW, [])).toEqual([]);
    const soon = await signInWarnings(NOW + DAY + 1, []);
    expect(soon).toHaveLength(1);
    expect(soon[0]).toMatchObject({ service: 'youtube', expiresAtMs: NOW + 3 * DAY });
    expect(soon[0].message).toMatch(/about/);
    const gone = await signInWarnings(NOW + 4 * DAY, []);
    expect(gone[0].message).toContain('Sign in to YouTube again');
  });

  it('Meta warns 7 days before', async () => {
    metaTokenExpiry.mockResolvedValue(NOW + 6 * DAY);
    recordSignIn('meta', NOW - 50 * DAY);
    const warnings = await signInWarnings(NOW, []);
    expect(warnings.map((w) => w.service)).toEqual(['meta']);
  });

  it('lists posts Alphonso must still send after the expiry, even when it is far off', async () => {
    recordSignIn('meta', NOW);
    const posts = [
      post({ id: 'late', scheduledAtMs: NOW + 70 * DAY }),
      post({ id: 'early', scheduledAtMs: NOW + 5 * DAY }),
      post({ id: 'onfb', platform: 'facebook', platformId: '1', scheduledAtMs: NOW + 70 * DAY }),
    ];
    const [w] = await signInWarnings(NOW, posts);
    expect(w.service).toBe('meta');
    expect(w.postsAfter).toEqual(['late']);
    expect(w.message).toContain('1 post');
  });
});

describe('plainSignInReason', () => {
  it('turns an expired sign-in into a plain message', () => {
    expect(plainSignInReason('youtube', 'invalid_grant: Token has been expired or revoked.')).toBe('Sign in to YouTube again in Settings → Connectors: the sign-in has run out.');
    expect(plainSignInReason('instagram', 'Error validating access token: Session has expired (#190)')).toBe('Sign in to Meta again in Settings → Connectors: the sign-in has run out.');
    expect(plainSignInReason('youtube', 'quotaExceeded')).toBeNull();
  });
});
