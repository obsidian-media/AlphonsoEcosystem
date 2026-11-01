// The phone's native parts, handed to the shared screens (src/mobile/MobileApp.tsx):
// sign-in (Firebase Authentication: Apple, Google, email link), secure storage and Face ID /
// fingerprint and notifications (this app's own AlphonsoPhone plugin, mobile/ios and
// mobile/android), and the QR scanner.
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } from '@capacitor/barcode-scanner';
import type { PhoneSignIn, SignInMethod } from '../../src/services/phone/phoneAccount';
import type { PhoneSecrets } from '../../src/mobile/phoneSession';
import type { NotificationAction, OnNotificationAction, PhoneLock } from '../../src/mobile/MobileApp';

interface AlphonsoPhonePlugin {
  getSecret(o: { key: string }): Promise<{ value: string | null }>;
  setSecret(o: { key: string; value: string }): Promise<void>;
  confirm(o: { reason: string; strict: boolean }): Promise<{ ok: boolean }>;
  requestNotifications(): Promise<{ granted: boolean }>;
  pushToken(): Promise<{ token: string | null }>;
  takePendingActions(): Promise<{ actions: NotificationAction[] }>;
  addListener(event: 'notificationAction', fn: (a: NotificationAction) => void): Promise<PluginListenerHandle>;
}
const AlphonsoPhone = registerPlugin<AlphonsoPhonePlugin>('AlphonsoPhone');

export const secrets: PhoneSecrets = {
  get: async (key) => (await AlphonsoPhone.getSecret({ key })).value,
  set: async (key, value) => { await AlphonsoPhone.setSecret({ key, value }); },
};

export const lock: PhoneLock = {
  confirm: async (reason, opts) => {
    try { return (await AlphonsoPhone.confirm({ reason, strict: !!opts?.strict })).ok; } catch { return false; }
  },
};

/** The Firebase push token, after asking to show notifications (once, after pairing). */
export async function notificationToken(): Promise<string | undefined> {
  try {
    const { granted } = await AlphonsoPhone.requestNotifications();
    if (!granted) return undefined;
    return (await AlphonsoPhone.pushToken()).token || undefined;
  } catch { return undefined; }
}

/** A notification's button. Ones tapped before the screens were ready come first. */
export const onNotificationAction: OnNotificationAction = (fn) => {
  let handle: PluginListenerHandle | null = null;
  let stopped = false;
  void AlphonsoPhone.addListener('notificationAction', fn).then((h) => { if (stopped) void h.remove(); else handle = h; });
  void AlphonsoPhone.takePendingActions().then(({ actions }) => { if (!stopped) actions.forEach(fn); }).catch(() => {});
  return () => { stopped = true; void handle?.remove(); };
};

export async function scanQr(): Promise<string | null> {
  try {
    const result = await CapacitorBarcodeScanner.scanBarcode({ hint: CapacitorBarcodeScannerTypeHint.QR_CODE });
    return result.ScanResult || null;
  } catch { return null; }
}

const EMAIL_KEY = 'alphonso_phone_signin_email';
const LINK_SENT = 'Check your email on this phone and open the link from Alphonso.';

/** Firebase Authentication. The email link needs the project's own link domain, set at build. */
export async function createSignIn(): Promise<PhoneSignIn> {
  let user = (await FirebaseAuthentication.getCurrentUser().catch(() => ({ user: null }))).user;
  const done = (u: typeof user) => { user = u; return { ok: !!u, reason: u ? undefined : 'Sign-in did not finish.' }; };
  // An email link opened on this phone finishes the sign-in it started.
  void App.addListener('appUrlOpen', async ({ url }) => {
    const email = localStorage.getItem(EMAIL_KEY);
    if (!email) return;
    const { isSignInWithEmailLink } = await FirebaseAuthentication.isSignInWithEmailLink({ emailLink: url });
    if (!isSignInWithEmailLink) return;
    const result = await FirebaseAuthentication.signInWithEmailLink({ email, emailLink: url }).catch(() => null);
    if (result?.user) { localStorage.removeItem(EMAIL_KEY); window.location.reload(); }
  });
  return {
    signedIn: () => !!user,
    email: () => user?.email ?? null,
    idToken: async () => (user ? (await FirebaseAuthentication.getIdToken().catch(() => ({ token: null as unknown as string }))).token || null : null),
    signIn: async (method: SignInMethod, email?: string) => {
      try {
        if (method === 'apple') return done((await FirebaseAuthentication.signInWithApple()).user);
        if (method === 'google') return done((await FirebaseAuthentication.signInWithGoogle()).user);
        const url = String(import.meta.env.VITE_PHONE_EMAIL_LINK_URL || '').trim();
        if (!url || !email) return { ok: false, reason: "Signing in by email isn't set up in this build. Use Apple or Google." };
        const { id } = await App.getInfo();
        await FirebaseAuthentication.sendSignInLinkToEmail({
          email,
          actionCodeSettings: { url, handleCodeInApp: true, iOS: { bundleId: id }, android: { packageName: id, installApp: true } },
        });
        localStorage.setItem(EMAIL_KEY, email);
        return { ok: false, reason: LINK_SENT };
      } catch (e) {
        return { ok: false, reason: e instanceof Error && e.message ? e.message : 'Sign-in did not finish.' };
      }
    },
    signOut: async () => { await FirebaseAuthentication.signOut(); user = null; },
  };
}

export function phoneName(): string {
  return Capacitor.getPlatform() === 'ios' ? 'iPhone' : 'Android phone';
}
