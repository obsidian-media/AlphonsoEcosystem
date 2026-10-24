// Signing in from Settings (content factory phase 3c, owner): YouTube, Facebook (Meta)
// and Instagram, with no terminal. The user's own Google project / Meta app is used:
// its id and secret are saved in Settings → Connectors first. The backend opens the
// browser, receives the sign-in on this computer and exchanges it (`oauth_sign_in`);
// this saves what comes back in the OS keychain, like a key typed into Settings.
import { clearNeedsPermission } from './contentFactory/postMetrics';
import { invoke } from '@tauri-apps/api/core';
import { getConnectorCredential, saveConnectorCredential } from './connectors/connectorAuth';
import { recordSignIn, signedInAt, type SignInService } from './contentFactory/signInExpiry';

export interface MetaPage { id: string; name: string; accessToken: string; instagramBusinessAccountId?: string | null }
export interface SignInOutcome { ok: boolean; reason?: string; pages?: MetaPage[]; /** Something to know about a sign-in that worked. */ note?: string }

interface BackendResult { ok: boolean; tokens?: Record<string, string>; pages?: MetaPage[]; expiresInSecs?: number | null; reason?: string | null }

/** Where each service's app id and secret are saved, and what to call them. */
const APP_KEYS: Record<SignInService, { connector: string; id: string; secret: string; missing: string }> = {
  youtube: { connector: 'youtube', id: 'YOUTUBE_CLIENT_ID', secret: 'YOUTUBE_CLIENT_SECRET', missing: 'Fill in the Client ID and Client Secret first.' },
  meta: { connector: 'meta', id: 'META_APP_ID', secret: 'META_APP_SECRET', missing: 'Fill in the App ID and App Secret first.' },
  instagram: { connector: 'meta', id: 'INSTAGRAM_APP_ID', secret: 'INSTAGRAM_APP_SECRET', missing: 'Fill in the Instagram App ID and App Secret first.' },
};

const DAY = 24 * 3_600_000;
/** Instagram Login's token is renewed when fewer days than this are left. */
export const INSTAGRAM_RENEW_DAYS = 10;
const INSTAGRAM_DAYS = 60;

function appKeys(service: SignInService): { clientId: string; clientSecret: string } | null {
  const keys = APP_KEYS[service];
  const clientId = String(getConnectorCredential(keys.connector, keys.id) || '').trim();
  const clientSecret = String(getConnectorCredential(keys.connector, keys.secret) || '').trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** Saves the Page Alphonso posts to (Meta), with its token and linked Instagram account. */
export function chooseMetaPage(page: MetaPage): void {
  saveConnectorCredential('meta', 'META_PAGE_ID', page.id);
  saveConnectorCredential('meta', 'META_PAGE_ACCESS_TOKEN', page.accessToken);
  if (page.instagramBusinessAccountId) saveConnectorCredential('meta', 'INSTAGRAM_BUSINESS_ACCOUNT_ID', page.instagramBusinessAccountId);
}

function finish(service: SignInService, result: BackendResult | null, nowMs: number): SignInOutcome {
  if (!result?.ok) return { ok: false, reason: result?.reason || 'The sign-in did not finish.' };
  const connector = APP_KEYS[service].connector;
  for (const [key, value] of Object.entries(result.tokens || {})) {
    if (value) saveConnectorCredential(connector, key, value);
  }
  recordSignIn(service, nowMs);
  // A new sign-in carries the reading permissions (phase 4a).
  clearNeedsPermission(service);
  if (service === 'meta') {
    const pages = result.pages || [];
    if (pages.length === 1) chooseMetaPage(pages[0]);
    else if (pages.length > 1) return { ok: true, pages };
    else return { ok: true, note: 'Signed in, but this account has no Facebook Page: Facebook posts (and Instagram through a Page) need one. Create a Page, then sign in again, or use Instagram Login.' };
  }
  return { ok: true };
}

/** Opens the browser to sign in; resolves once the sign-in comes back (5 minutes at most). */
export async function signIn(service: SignInService, nowMs = Date.now()): Promise<SignInOutcome> {
  const keys = appKeys(service);
  if (!keys) return { ok: false, reason: APP_KEYS[service].missing };
  try {
    return finish(service, await invoke<BackendResult>('oauth_sign_in', { request: { service, ...keys } }), nowMs);
  } catch {
    return { ok: false, reason: 'The sign-in could not start.' };
  }
}

/** Finishes the last sign-in from the address the browser ended on. */
export async function finishPastedSignIn(service: SignInService, pastedUrl: string, nowMs = Date.now()): Promise<SignInOutcome> {
  const keys = appKeys(service);
  if (!keys) return { ok: false, reason: APP_KEYS[service].missing };
  try {
    return finish(service, await invoke<BackendResult>('oauth_finish_pasted', { request: { service, pastedUrl: pastedUrl.trim(), ...keys } }), nowMs);
  } catch {
    return { ok: false, reason: 'The sign-in could not be finished.' };
  }
}

/** Renews the Instagram Login token when under 10 days are left; true when it did. */
export async function refreshInstagramIfDue(nowMs = Date.now()): Promise<boolean> {
  const token = String(getConnectorCredential('meta', 'INSTAGRAM_LOGIN_TOKEN') || '').trim();
  const at = signedInAt('instagram');
  if (!token || at === null) return false;
  if (at + INSTAGRAM_DAYS * DAY - nowMs > INSTAGRAM_RENEW_DAYS * DAY) return false;
  try {
    const result = await invoke<{ ok: boolean; token?: string | null }>('instagram_refresh_token', { token });
    if (!result?.ok || !result.token) return false;
    saveConnectorCredential('meta', 'INSTAGRAM_LOGIN_TOKEN', result.token);
    recordSignIn('instagram', nowMs);
    return true;
  } catch {
    return false;
  }
}
