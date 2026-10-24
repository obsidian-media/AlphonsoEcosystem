// Miya content factory phase 3b: when the YouTube and Meta sign-ins run out.
// YouTube does not say: a Google project in Testing ends a sign-in after 7 days,
// so Alphonso counts from when the keys were saved (off when the user marks the
// project Published). Meta says, through debug_token (needs the App ID and
// secret); otherwise 60 days from saving. Only the times are kept, never a key.
import { metaTokenExpiry } from '../metaPublishService';
import type { ProjectPost } from './contentTypes';

// Phase 3c: Instagram Login's token lasts 60 days from signing in or renewing it.
export type SignInService = 'youtube' | 'meta' | 'instagram';
const KEY = 'alphonso_sign_ins_v1';
const DAY = 24 * 3_600_000;
const COUNTED_DAYS: Record<SignInService, number> = { youtube: 7, meta: 60, instagram: 60 };
const WARN_DAYS: Record<SignInService, number> = { youtube: 2, meta: 7, instagram: 7 };
export const SIGN_IN_NAME: Record<SignInService, string> = { youtube: 'YouTube', meta: 'Meta', instagram: 'Instagram' };
const NAME = SIGN_IN_NAME;

interface SignIns { youtube?: { savedAtMs: number }; meta?: { savedAtMs: number }; instagram?: { savedAtMs: number }; youtubePublished?: boolean }

function read(): SignIns {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}
function write(next: SignIns): void {
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full */ }
}

/** When a sign-in was saved: its keys saved in Settings, a sign-in from Settings, or a renewal. */
export function signedInAt(service: SignInService): number | null {
  return read()[service]?.savedAtMs ?? null;
}

/** Called when the YouTube or Meta keys are saved in Settings. */
export function recordSignIn(service: SignInService, nowMs = Date.now()): void {
  write({ ...read(), [service]: { savedAtMs: nowMs } });
}

export function setYoutubeProjectPublished(published: boolean): void {
  write({ ...read(), youtubePublished: published });
}

export function isYoutubeProjectPublished(): boolean {
  return read().youtubePublished === true;
}

/** When the sign-in runs out (`null`: unknown or never); `exact` when the platform said so. */
export async function getSignInExpiry(service: SignInService, nowMs = Date.now()): Promise<{ expiresAtMs: number | null; exact: boolean }> {
  void nowMs;
  const saved = read();
  if (service === 'youtube') {
    if (saved.youtubePublished || !saved.youtube) return { expiresAtMs: null, exact: false };
    return { expiresAtMs: saved.youtube.savedAtMs + COUNTED_DAYS.youtube * DAY, exact: false };
  }
  if (service === 'instagram') {
    return { expiresAtMs: saved.instagram ? saved.instagram.savedAtMs + COUNTED_DAYS.instagram * DAY : null, exact: false };
  }
  const exact = await metaTokenExpiry().catch(() => null);
  if (typeof exact === 'number') return { expiresAtMs: exact, exact: true };
  return { expiresAtMs: saved.meta ? saved.meta.savedAtMs + COUNTED_DAYS.meta * DAY : null, exact: false };
}

/** Whether Alphonso still needs this service's sign-in at the post's time. */
function needsSignInAt(post: ProjectPost, service: SignInService): boolean {
  if (['posted', 'posting', 'check', 'cancelled', 'locked_private'].includes(post.status)) return false;
  if (service === 'instagram') {
    if (post.platform !== 'instagram') return false;
  } else if ((post.platform === 'youtube' ? 'youtube' : 'meta') !== service) {
    return false;
  }
  const onPlatform = post.status === 'scheduled' && !!post.platformId && post.platform !== 'instagram';
  return !onPlatform;
}

export interface SignInWarning { service: SignInService; message: string; expiresAtMs: number; postsAfter: string[] }

/** Sign-ins running out soon (YouTube 2 days, Meta 7), run out, or with posts due after them. */
export async function signInWarnings(nowMs: number, posts: ProjectPost[]): Promise<SignInWarning[]> {
  const warnings: SignInWarning[] = [];
  for (const service of ['youtube', 'meta', 'instagram'] as SignInService[]) {
    const { expiresAtMs, exact } = await getSignInExpiry(service, nowMs);
    if (expiresAtMs === null) continue;
    const postsAfter = posts.filter((p) => needsSignInAt(p, service) && p.scheduledAtMs > expiresAtMs).map((p) => p.id);
    const soon = expiresAtMs - nowMs <= WARN_DAYS[service] * DAY;
    if (!soon && postsAfter.length === 0) continue;
    const when = new Date(expiresAtMs).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const why = service === 'youtube' && !exact ? ' (Google ends a sign-in after 7 days while the project is in Testing)' : '';
    let message = expiresAtMs <= nowMs
      ? `Your ${NAME[service]} sign-in has run out. Sign in to ${NAME[service]} again in Settings → Connectors.`
      : `Your ${NAME[service]} sign-in runs out ${exact ? 'on' : 'about'} ${when}${why}. Sign in again before then.`;
    if (postsAfter.length) message += ` ${postsAfter.length} post${postsAfter.length === 1 ? ' is' : 's are'} due after that.`;
    warnings.push({ service, message, expiresAtMs, postsAfter });
  }
  return warnings;
}

/** A platform's "the sign-in has run out" error, said plainly; `null` for any other error. */
export function plainSignInReason(platform: string, error: string): string | null {
  const text = String(error || '');
  if (platform === 'youtube' && /invalid_grant|expired or revoked|Token has been expired/i.test(text)) {
    return 'Sign in to YouTube again in Settings → Connectors: the sign-in has run out.';
  }
  if (platform !== 'youtube' && /Error validating access token|Session has expired|#190\b|code 190\b|OAuthException.*expired/i.test(text)) {
    return 'Sign in to Meta again in Settings → Connectors: the sign-in has run out.';
  }
  return null;
}
