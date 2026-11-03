// The computer's sign-in for phone access (phone app phase 1): the backend opens the Alphonso
// sign-in page (gateway/signin-page) in the browser and keeps the account in the OS keychain
// (phone_signin.rs); this window only ever gets ID tokens. The page's address and the
// Firebase web API key come from the build (VITE_PHONE_SIGNIN_URL, VITE_FIREBASE_API_KEY).
import type { PhoneSignIn, SignInMethod } from './phoneAccount';

export const NO_SIGN_IN_PAGE = "Signing in isn't set up in this build.";

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
interface Config { invoke: Invoke; pageUrl: string; apiKey: string }

export function desktopSignInConfig(): { pageUrl: string; apiKey: string } {
  return {
    pageUrl: String(import.meta.env.VITE_PHONE_SIGNIN_URL || '').trim(),
    apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY || '').trim(),
  };
}

export function createDesktopPhoneSignIn({ invoke, pageUrl, apiKey }: Config): PhoneSignIn {
  const setUp = !!pageUrl && !!apiKey;
  let signedIn = false;
  let email: string | null = null;

  return {
    signedIn: () => signedIn,
    email: () => email,
    async signIn(method: SignInMethod, typedEmail?: string) {
      if (!setUp) return { ok: false, reason: NO_SIGN_IN_PAGE };
      try {
        const r = (await invoke('phone_sign_in', { request: { pageUrl, apiKey, method, email: typedEmail || '' } })) as { ok?: boolean; email?: string; reason?: string } | null;
        if (r?.ok) {
          signedIn = true;
          email = r.email ?? null;
          return { ok: true };
        }
        return { ok: false, reason: r?.reason || 'The sign-in did not finish. Try again.' };
      } catch {
        return { ok: false, reason: 'The sign-in did not finish. Try again.' };
      }
    },
    async signOut() {
      signedIn = false;
      email = null;
      try { await invoke('phone_sign_out'); } catch { /* nothing kept to forget */ }
    },
    async idToken() {
      if (!setUp) return null;
      try {
        const r = (await invoke('phone_id_token', { apiKey })) as { idToken?: string; email?: string } | null;
        if (r?.idToken) {
          signedIn = true;
          email = r.email ?? email;
          return r.idToken;
        }
      } catch { /* treated as signed out below */ }
      signedIn = false;
      return null;
    },
  };
}
