// Which way Alphonso posts to Instagram (content factory phase 3c, owner): through the
// user's Facebook Page (Meta's Page keys), or through Instagram Login (an Instagram
// professional account with no Page). The user chooses in Settings → Connectors → Meta;
// until then it is whichever is set up, the Page first (it can upload Reels from this
// computer without storage).
import { getConnectorCredential } from '../connectors/connectorAuth';

export type InstagramRoute = 'page' | 'instagram_login';
const KEY = 'alphonso_instagram_route_v1';

const has = (key: string) => Boolean(String(getConnectorCredential('meta', key) || '').trim());

export function pageRouteSetUp(): boolean {
  return has('META_ACCESS_TOKEN') && has('INSTAGRAM_BUSINESS_ACCOUNT_ID');
}

export function instagramLoginSetUp(): boolean {
  return has('INSTAGRAM_LOGIN_TOKEN') && has('INSTAGRAM_LOGIN_USER_ID');
}

/** The route chosen in Settings, or null when none was chosen. */
export function savedInstagramRoute(): InstagramRoute | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'page' || value === 'instagram_login' ? value : null;
  } catch {
    return null;
  }
}

export function setInstagramRoute(route: InstagramRoute | null): void {
  try {
    if (route) localStorage.setItem(KEY, route);
    else localStorage.removeItem(KEY);
  } catch {
    // The choice falls back to whichever route is set up.
  }
}

/** The saved choice, else whichever is set up (the Page first), else null. */
export async function getInstagramRoute(): Promise<InstagramRoute | null> {
  const saved = savedInstagramRoute();
  if (saved) return saved;
  if (pageRouteSetUp()) return 'page';
  if (instagramLoginSetUp()) return 'instagram_login';
  return null;
}
