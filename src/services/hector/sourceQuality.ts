// What counts as a source, and which sources come first (agent phase 1,
// owner 2026-10-25). Rules on the address's shape and the page's words only:
// no list of sites. Replaces the "official = docs/developer/github" rule.

export type SourceKind = 'primary' | 'news' | 'general';

/** Texts a site shows instead of the page when it refuses a visitor. */
const WALL_TEXTS = ['enable javascript', 'just a moment', 'security check', 'unusual activity', 'verify you are human', 'access denied', 'are you a robot', 'checking your browser', 'temporarily unavailable'];
const SEARCH_PATH = /\/(search|results|find)(\/|$|\?)|[?&](q|query|search)=/i;
const SIGN_IN_PATH = /\/(login|log-in|signin|sign-in|signup|sign-up|register|account|auth)(\/|$|\?)/i;

/** A result that isn't a page about anything: a home page, a search or sign-in page, or a wall. */
export function isJunkResult(url: string, title = '', snippet = ''): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return true;
  const path = parsed.pathname.replace(/\/+$/, '');
  if (!path && !parsed.search) return true;
  if (SEARCH_PATH.test(parsed.pathname + parsed.search)) return true;
  if (SIGN_IN_PATH.test(parsed.pathname)) return true;
  const text = `${title} ${snippet}`.toLowerCase();
  return WALL_TEXTS.some((wall) => text.includes(wall));
}

const PRIMARY_SUFFIXES = [/\.gov$/, /\.gov\.[a-z]{2}$/, /\.mil$/, /\.int$/, /\.edu$/, /\.edu\.[a-z]{2}$/, /\.ac\.[a-z]{2}$/, /(^|\.)europa\.eu$/];
const PAPER_PATH = /\/(doi|article|articles\/pii|publication|paper|papers)\/|\.pdf($|\?)/i;
const DATED_PATH = /\/(19|20)\d{2}[/-](0[1-9]|1[0-2])([/-]|$)/;

export function sourceKind(url: string): SourceKind {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'general';
  }
  const host = parsed.hostname.toLowerCase();
  if (PRIMARY_SUFFIXES.some((rule) => rule.test(host))) return 'primary';
  if (PAPER_PATH.test(parsed.pathname)) return 'primary';
  if (DATED_PATH.test(parsed.pathname)) return 'news';
  return 'general';
}

const ORDER: Record<SourceKind, number> = { primary: 0, news: 1, general: 2 };

/** Primary first, then news, then general; the search engine's order within each. */
export function rankSources<T extends { url: string }>(list: T[]): T[] {
  return list
    .map((item, index) => ({ item, index, kind: sourceKind(item.url) }))
    .sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.index - b.index)
    .map((row) => row.item);
}
