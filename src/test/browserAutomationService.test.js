import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import {
  openUrl,
  openExternalUrl,
  fetchUrlContent,
  readClipboard,
  writeClipboard,
  scrapeWebPage,
  openAndScrape
} from '../services/browserAutomationService';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args) => mockInvoke(...args) }));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── openUrl ───────────────────────────────────────────────────────────────────

describe('openUrl', () => {
  it('calls invoke with open_url and the url', async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    await openUrl('https://example.com');
    expect(mockInvoke).toHaveBeenCalledWith('open_url', { url: 'https://example.com' });
  });

  it('propagates errors from invoke', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Failed to open'));
    await expect(openUrl('bad-url')).rejects.toThrow('Failed to open');
  });

  it('works with localhost URLs', async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    await openUrl('http://localhost:3000');
    expect(mockInvoke).toHaveBeenCalledWith('open_url', { url: 'http://localhost:3000' });
  });
});

// ── openExternalUrl ──────────────────────────────────────────────────────────
// Tauri's webview silently no-ops on window.open()/<a target="_blank">, so every
// citation/source link click must route through invoke('open_url', ...) instead.

describe('openExternalUrl', () => {
  const originalOpen = window.open;

  beforeEach(() => {
    window.open = vi.fn();
  });

  afterAll(() => {
    window.open = originalOpen;
  });

  it('calls invoke with open_url and the url, without falling back to window.open', async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    await openExternalUrl('https://example.com');
    expect(mockInvoke).toHaveBeenCalledWith('open_url', { url: 'https://example.com' });
    expect(window.open).not.toHaveBeenCalled();
  });

  it('falls back to window.open when invoke rejects (e.g. running outside Tauri)', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('invoke unavailable'));
    await openExternalUrl('https://example.com');
    expect(window.open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
  });

  it('does nothing when called with no url', async () => {
    await openExternalUrl('');
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });
});

// ── fetchUrlContent ───────────────────────────────────────────────────────────

describe('fetchUrlContent', () => {
  it('calls invoke with fetch_url_content and returns result', async () => {
    const mockResult = { title: 'Page Title', content: 'Page body text', status: 200 };
    mockInvoke.mockResolvedValueOnce(mockResult);
    const result = await fetchUrlContent('https://example.com');
    expect(mockInvoke).toHaveBeenCalledWith('fetch_url_content', { url: 'https://example.com' });
    expect(result).toEqual(mockResult);
  });

  it('propagates fetch errors', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Network timeout'));
    await expect(fetchUrlContent('https://slow.example.com')).rejects.toThrow('Network timeout');
  });
});

// ── readClipboard ─────────────────────────────────────────────────────────────

describe('readClipboard', () => {
  it('calls invoke with read_clipboard (no args)', async () => {
    mockInvoke.mockResolvedValueOnce('clipboard content');
    const result = await readClipboard();
    expect(mockInvoke).toHaveBeenCalledWith('read_clipboard');
    expect(result).toBe('clipboard content');
  });

  it('returns empty string when clipboard is empty', async () => {
    mockInvoke.mockResolvedValueOnce('');
    const result = await readClipboard();
    expect(result).toBe('');
  });

  it('propagates clipboard read errors', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Clipboard unavailable'));
    await expect(readClipboard()).rejects.toThrow('Clipboard unavailable');
  });
});

// ── writeClipboard ────────────────────────────────────────────────────────────

describe('writeClipboard', () => {
  it('calls invoke with write_clipboard and content', async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    await writeClipboard('some text to copy');
    expect(mockInvoke).toHaveBeenCalledWith('write_clipboard', { content: 'some text to copy' });
  });

  it('works with empty string', async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    await writeClipboard('');
    expect(mockInvoke).toHaveBeenCalledWith('write_clipboard', { content: '' });
  });

  it('propagates clipboard write errors', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Clipboard write denied'));
    await expect(writeClipboard('text')).rejects.toThrow('Clipboard write denied');
  });
});

// ── scrapeWebPage ─────────────────────────────────────────────────────────────

describe('scrapeWebPage', () => {
  it('returns page with wordCount and charCount derived from content', async () => {
    mockInvoke.mockResolvedValueOnce({
      title: 'Test Page',
      content: 'Hello world this is test content',
      status: 200
    });
    const result = await scrapeWebPage('https://test.com');
    expect(result.url).toBe('https://test.com');
    expect(result.title).toBe('Test Page');
    expect(result.wordCount).toBe(6);
    expect(result.charCount).toBe('Hello world this is test content'.length);
    expect(result.status).toBe(200);
  });

  it('propagates errors from fetchUrlContent', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Connection refused'));
    await expect(scrapeWebPage('https://offline.com')).rejects.toThrow('Connection refused');
  });

  it('includes the url in the result object', async () => {
    mockInvoke.mockResolvedValueOnce({ title: 'X', content: 'y', status: 200 });
    const result = await scrapeWebPage('https://custom.example.com/path');
    expect(result.url).toBe('https://custom.example.com/path');
  });

  it('computes correct word count for multi-word content', async () => {
    const content = 'one two three four five six seven eight nine ten';
    mockInvoke.mockResolvedValueOnce({ title: 'Words', content, status: 200 });
    const result = await scrapeWebPage('https://words.com');
    expect(result.wordCount).toBe(10);
  });
});

// ── openAndScrape ─────────────────────────────────────────────────────────────

describe('openAndScrape', () => {
  it('opens the URL and then returns scraped content', async () => {
    // First call: openUrl, Second call: fetchUrlContent (inside scrapeWebPage)
    mockInvoke
      .mockResolvedValueOnce(undefined) // open_url
      .mockResolvedValueOnce({ title: 'Opened Page', content: 'page content here', status: 200 }); // fetch_url_content

    const result = await openAndScrape('https://example.com');
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'open_url', { url: 'https://example.com' });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'fetch_url_content', { url: 'https://example.com' });
    expect(result.title).toBe('Opened Page');
  });

  it('propagates openUrl errors', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Cannot open URL'));
    await expect(openAndScrape('https://bad.com')).rejects.toThrow('Cannot open URL');
  });
});
