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
