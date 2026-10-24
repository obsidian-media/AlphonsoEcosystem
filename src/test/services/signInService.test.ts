// Phase 3c: signing in to YouTube, Meta and Instagram from Settings (no terminal).
import { describe, it, expect, beforeEach, vi } from 'vitest';

const invoke = vi.fn();
const saved: Record<string, Record<string, string>> = {};
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock('../../services/connectors/connectorAuth', () => ({
  getConnectorCredential: (id: string, key: string) => saved[id]?.[key] || '',
  saveConnectorCredential: (id: string, key: string, value: string) => { (saved[id] ||= {})[key] = value; },
}));

import { signIn, finishPastedSignIn, chooseMetaPage, refreshInstagramIfDue } from '../../services/signInService';

const NOW = new Date(2026, 9, 26, 10).getTime();
const DAY = 24 * 3_600_000;
const signIns = () => JSON.parse(localStorage.getItem('alphonso_sign_ins_v1') || '{}');

beforeEach(() => {
  localStorage.clear();
  invoke.mockReset();
  for (const k of Object.keys(saved)) delete saved[k];
});

describe('signIn', () => {
  it('without an app ID says what to fill in', async () => {
    expect(await signIn('youtube')).toEqual({ ok: false, reason: 'Fill in the Client ID and Client Secret first.' });
    expect(await signIn('meta')).toEqual({ ok: false, reason: 'Fill in the App ID and App Secret first.' });
    expect(await signIn('instagram')).toEqual({ ok: false, reason: 'Fill in the Instagram App ID and App Secret first.' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('saves every returned token and records the sign-in', async () => {
    saved.youtube = { YOUTUBE_CLIENT_ID: 'cid', YOUTUBE_CLIENT_SECRET: 'sec' };
    invoke.mockResolvedValue({ ok: true, tokens: { YOUTUBE_REFRESH_TOKEN: 'rt' }, pages: [] });
    expect(await signIn('youtube', NOW)).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith('oauth_sign_in', { request: { service: 'youtube', clientId: 'cid', clientSecret: 'sec' } });
    expect(saved.youtube.YOUTUBE_REFRESH_TOKEN).toBe('rt');
    expect(signIns().youtube.savedAtMs).toBe(NOW);
  });

  it('a new sign-in clears the "sign in again to see numbers" flag', async () => {
    localStorage.setItem('alphonso_metrics_permissions_v1', JSON.stringify({ youtube: true, meta: true }));
    saved.youtube = { YOUTUBE_CLIENT_ID: 'cid', YOUTUBE_CLIENT_SECRET: 'sec' };
    invoke.mockResolvedValue({ ok: true, tokens: { YOUTUBE_REFRESH_TOKEN: 'rt' }, pages: [] });
    await signIn('youtube', NOW);
    expect(JSON.parse(localStorage.getItem('alphonso_metrics_permissions_v1') || '{}')).toEqual({ meta: true });
  });

  it('a refusal is passed on and nothing is saved', async () => {
    saved.youtube = { YOUTUBE_CLIENT_ID: 'cid', YOUTUBE_CLIENT_SECRET: 'sec' };
    invoke.mockResolvedValue({ ok: false, reason: 'The sign-in was cancelled or refused.', tokens: {}, pages: [] });
    expect(await signIn('youtube')).toEqual({ ok: false, reason: 'The sign-in was cancelled or refused.' });
    expect(saved.youtube.YOUTUBE_REFRESH_TOKEN).toBeUndefined();
  });

  it('Meta with one Page saves the Page; with several, asks which', async () => {
    saved.meta = { META_APP_ID: 'app', META_APP_SECRET: 'sec' };
    const page = (id: string, ig?: string) => ({ id, name: `Page ${id}`, accessToken: `pt${id}`, instagramBusinessAccountId: ig });
    invoke.mockResolvedValueOnce({ ok: true, tokens: { META_ACCESS_TOKEN: 'long' }, pages: [page('1', 'ig1')] });
    expect(await signIn('meta', NOW)).toEqual({ ok: true });
    expect(saved.meta).toMatchObject({ META_ACCESS_TOKEN: 'long', META_PAGE_ID: '1', META_PAGE_ACCESS_TOKEN: 'pt1', INSTAGRAM_BUSINESS_ACCOUNT_ID: 'ig1' });

    invoke.mockResolvedValueOnce({ ok: true, tokens: { META_ACCESS_TOKEN: 'long2' }, pages: [page('2'), page('3', 'ig3')] });
    const result = await signIn('meta', NOW);
    expect(result).toMatchObject({ ok: true, pages: [{ id: '2' }, { id: '3' }] });
    chooseMetaPage(result.pages![1]);
    expect(saved.meta).toMatchObject({ META_PAGE_ID: '3', META_PAGE_ACCESS_TOKEN: 'pt3', INSTAGRAM_BUSINESS_ACCOUNT_ID: 'ig3' });
  });

  // Final review: no Page means Facebook posts can't work; say so instead of a plain "signed in".
  it('Meta with no Page says so', async () => {
    saved.meta = { META_APP_ID: 'app', META_APP_SECRET: 'sec' };
    invoke.mockResolvedValue({ ok: true, tokens: { META_ACCESS_TOKEN: 'long' }, pages: [] });
    const result = await signIn('meta', NOW);
    expect(result.ok).toBe(true);
    expect(result.note).toMatch(/no Facebook Page/);
    expect(saved.meta.META_ACCESS_TOKEN).toBe('long');
  });

  it('Instagram saves the token and account and records the sign-in', async () => {
    saved.meta = { INSTAGRAM_APP_ID: 'iga', INSTAGRAM_APP_SECRET: 'igs' };
    invoke.mockResolvedValue({ ok: true, tokens: { INSTAGRAM_LOGIN_TOKEN: 'lt', INSTAGRAM_LOGIN_USER_ID: 'u1' }, pages: [], expiresInSecs: 5_184_000 });
    expect(await signIn('instagram', NOW)).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith('oauth_sign_in', { request: { service: 'instagram', clientId: 'iga', clientSecret: 'igs' } });
    expect(saved.meta).toMatchObject({ INSTAGRAM_LOGIN_TOKEN: 'lt', INSTAGRAM_LOGIN_USER_ID: 'u1' });
    expect(signIns().instagram.savedAtMs).toBe(NOW);
  });
});

it('finishPastedSignIn sends the pasted address and saves the tokens', async () => {
  saved.meta = { INSTAGRAM_APP_ID: 'iga', INSTAGRAM_APP_SECRET: 'igs' };
  invoke.mockResolvedValue({ ok: true, tokens: { INSTAGRAM_LOGIN_TOKEN: 'lt', INSTAGRAM_LOGIN_USER_ID: 'u1' }, pages: [] });
  expect(await finishPastedSignIn('instagram', 'http://localhost:8087/callback?code=x&state=y')).toEqual({ ok: true });
  expect(invoke).toHaveBeenCalledWith('oauth_finish_pasted', {
    request: { service: 'instagram', pastedUrl: 'http://localhost:8087/callback?code=x&state=y', clientId: 'iga', clientSecret: 'igs' },
  });
});

describe('refreshInstagramIfDue', () => {
  it('renews the Instagram token under 10 days left and saves it', async () => {
    saved.meta = { INSTAGRAM_LOGIN_TOKEN: 'old' };
    localStorage.setItem('alphonso_sign_ins_v1', JSON.stringify({ instagram: { savedAtMs: NOW - 52 * DAY } }));
    invoke.mockResolvedValue({ ok: true, token: 'new', expiresInSecs: 5_184_000 });
    expect(await refreshInstagramIfDue(NOW)).toBe(true);
    expect(invoke).toHaveBeenCalledWith('instagram_refresh_token', { token: 'old' });
    expect(saved.meta.INSTAGRAM_LOGIN_TOKEN).toBe('new');
    expect(signIns().instagram.savedAtMs).toBe(NOW);
  });

  it('leaves it alone with more than 10 days left, or with no sign-in', async () => {
    saved.meta = { INSTAGRAM_LOGIN_TOKEN: 'old' };
    localStorage.setItem('alphonso_sign_ins_v1', JSON.stringify({ instagram: { savedAtMs: NOW - 20 * DAY } }));
    expect(await refreshInstagramIfDue(NOW)).toBe(false);
    localStorage.clear();
    expect(await refreshInstagramIfDue(NOW)).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
});
