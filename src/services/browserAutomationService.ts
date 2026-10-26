import { invoke } from '@tauri-apps/api/core';

interface ScrapeResult {
  url: string;
  title: string;
  content: string;
  status: number;
  wordCount: number;
  charCount: number;
}

export async function openUrl(url: string) {
  return invoke('open_url', { url });
}

// Tauri's webview does not support bare `<a target="_blank">` or `window.open()` —
// they fail silently with no visible error. Every UI that opens a citation/source
// link should call this instead of window.open() directly. Falls back to
// window.open() when not running inside Tauri (e.g. plain browser/web build).
export async function openExternalUrl(url: string) {
  if (!url) return;
  try {
    await invoke('open_url', { url });
  } catch {
    try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { /* no-op */ }
  }
}

// A source link you click (agent phase 4, owner 2026-10-25: "warn on disguised links only").
// LinkWarningHost (mounted once in App) registers the window that asks.
type LinkConfirm = (reason: string, url: string) => Promise<boolean>;
let linkConfirm: LinkConfirm | null = null;

export function setLinkConfirmHandler(next: LinkConfirm | null): void {
  linkConfirm = next;
}

/** Opens a source link: at once when normal; a disguised or listed one asks first. */
export async function openSourceLink(url: string): Promise<boolean> {
  if (!url) return false;
  const { checkLink } = await import('./sentinel/exactChecks');
  const disguised = checkLink(url);
  let reason = disguised ? `This link looks disguised: ${disguised.detail}.` : '';
  if (!reason) {
    const { checkLinksWithWebRisk } = await import('./sentinel/webRisk');
    const threat = (await checkLinksWithWebRisk([url])).get(url);
    if (threat) reason = `Google Web Risk lists this link as ${threat}.`;
  }
  if (reason) {
    // No window to ask in: a suspicious link doesn't open.
    if (!linkConfirm || !(await linkConfirm(reason, url))) return false;
  }
  await openExternalUrl(url);
  return true;
}

export async function fetchUrlContent(url: string) {
  return invoke('fetch_url_content', { url });
}

export async function readClipboard() {
  return invoke('read_clipboard');
}

export async function writeClipboard(content: string) {
  return invoke('write_clipboard', { content });
}

export async function scrapeWebPage(url: string): Promise<ScrapeResult> {
  const result = await fetchUrlContent(url) as { title: string; content: string; status: number };
  return {
    url,
    title: result.title,
    content: result.content,
    status: result.status,
    wordCount: result.content.split(/\s+/).length,
    charCount: result.content.length
  };
}

export async function openAndScrape(url: string): Promise<ScrapeResult> {
  await openUrl(url);
  return scrapeWebPage(url);
}
