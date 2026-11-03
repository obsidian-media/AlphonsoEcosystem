import { describe, it, expect, vi } from 'vitest';
import { createDesktopPhoneSignIn, NO_SIGN_IN_PAGE } from '../../../services/phone/desktopSignIn';

const config = { pageUrl: 'https://example.web.app/', apiKey: 'AIzaTest' };

function backend(answers: Record<string, unknown>) {
  return vi.fn(async (cmd: string) => {
    const a = answers[cmd];
    if (a instanceof Error) throw a;
    return a;
  });
}

describe('signing the computer in through the sign-in page', () => {
  it('opens the page with the chosen way and keeps only the email it was told', async () => {
    const invoke = backend({ phone_sign_in: { ok: true, email: 'me@x.com' } });
    const s = createDesktopPhoneSignIn({ invoke, ...config });
    expect(await s.signIn('google')).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith('phone_sign_in', { request: { pageUrl: config.pageUrl, apiKey: 'AIzaTest', method: 'google', email: '' } });
    expect(s.signedIn()).toBe(true);
    expect(s.email()).toBe('me@x.com');
  });

  it("says why when the sign-in didn't finish, and stays signed out", async () => {
    const s = createDesktopPhoneSignIn({ invoke: backend({ phone_sign_in: { ok: false, reason: 'No answer from the browser within 5 minutes. Try again.' } }), ...config });
    expect(await s.signIn('email', 'me@x.com')).toEqual({ ok: false, reason: 'No answer from the browser within 5 minutes. Try again.' });
    expect(s.signedIn()).toBe(false);
  });

  it('gets ID tokens from the backend; the refresh token never reaches the window', async () => {
    const invoke = backend({ phone_id_token: { idToken: 'id.tok.en', email: 'me@x.com' } });
    const s = createDesktopPhoneSignIn({ invoke, ...config });
    expect(await s.idToken()).toBe('id.tok.en');
    expect(invoke).toHaveBeenCalledWith('phone_id_token', { apiKey: 'AIzaTest' });
    expect(s.signedIn()).toBe(true);
    expect(s.email()).toBe('me@x.com');
  });

  it('a sign-in that has ended counts as signed out', async () => {
    const s = createDesktopPhoneSignIn({ invoke: backend({ phone_sign_in: { ok: true, email: 'a@b.c' }, phone_id_token: { reason: 'Your sign-in has ended. Sign in again.' } }), ...config });
    await s.signIn('google');
    expect(await s.idToken()).toBeNull();
    expect(s.signedIn()).toBe(false);
  });

  it('signing out forgets it on this computer', async () => {
    const invoke = backend({ phone_sign_in: { ok: true, email: 'a@b.c' }, phone_sign_out: undefined });
    const s = createDesktopPhoneSignIn({ invoke, ...config });
    await s.signIn('google');
    await s.signOut();
    expect(invoke).toHaveBeenCalledWith('phone_sign_out');
    expect(s.signedIn()).toBe(false);
    expect(s.email()).toBeNull();
  });

  it('a build without the sign-in page says so instead of opening anything', async () => {
    const invoke = backend({});
    const s = createDesktopPhoneSignIn({ invoke, pageUrl: '', apiKey: '' });
    expect(await s.signIn('google')).toEqual({ ok: false, reason: NO_SIGN_IN_PAGE });
    expect(await s.idToken()).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('a backend error is a plain reason, never a crash', async () => {
    const s = createDesktopPhoneSignIn({ invoke: backend({ phone_sign_in: new Error('boom'), phone_id_token: new Error('boom') }), ...config });
    expect((await s.signIn('google')).ok).toBe(false);
    expect(await s.idToken()).toBeNull();
  });
});
