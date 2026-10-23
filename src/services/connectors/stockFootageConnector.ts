// Stock footage for the Miya content factory's B-roll step (phase 2a, owner):
// Pexels, Pixabay and Coverr, each searched when its free key is set in
// Settings → Connectors. The app window cannot reach these sites, so searches
// go through the backend's `content_stock_search` (fixed endpoints) and
// downloads through `content_download_media` (those hosts only).
import { invoke } from '@tauri-apps/api/core';
import { getConnectorCredential } from './connectorAuth';
import { evaluatePolicyGate } from '../policyEnforcementService';

export type StockSource = 'pexels' | 'pixabay' | 'coverr';

export interface StockClip {
  source: StockSource;
  id: string;
  url: string;
  durationSec: number;
  width: number;
  height: number;
  author: string;
  pageUrl: string;
  license: string;
}

const SOURCES: { id: StockSource; key: string; license: string }[] = [
  { id: 'pexels', key: 'PEXELS_API_KEY', license: 'Pexels License (free to use, no attribution required)' },
  { id: 'pixabay', key: 'PIXABAY_API_KEY', license: 'Pixabay Content License (free to use)' },
  { id: 'coverr', key: 'COVERR_API_KEY', license: 'Coverr License (free to use, no attribution required)' },
];

export function configuredStockSources(): StockSource[] {
  return SOURCES.filter((s) => Boolean(getConnectorCredential(s.id, s.key))).map((s) => s.id);
}

function licenseOf(source: StockSource): string {
  return SOURCES.find((s) => s.id === source)!.license;
}

/** The file closest to full HD for the shape asked for. */
function bestFile(files: { link: string; width: number; height: number }[], orientation: 'landscape' | 'portrait') {
  const target = orientation === 'landscape' ? 1920 : 1080;
  return [...files].filter((f) => f?.link).sort((a, b) => Math.abs(a.width - target) - Math.abs(b.width - target))[0];
}

function mapResults(source: StockSource, body: any, orientation: 'landscape' | 'portrait'): StockClip[] {
  if (source === 'pexels') {
    return (body?.videos || []).flatMap((v: any) => {
      const file = bestFile((v.video_files || []).filter((f: any) => f.file_type === 'video/mp4'), orientation);
      return file ? [{
        source, id: String(v.id), url: file.link, durationSec: Number(v.duration) || 0, width: file.width, height: file.height,
        author: String(v.user?.name || ''), pageUrl: String(v.url || ''), license: licenseOf(source),
      }] : [];
    });
  }
  if (source === 'pixabay') {
    return (body?.hits || []).flatMap((v: any) => {
      const file = v.videos?.large?.url ? v.videos.large : v.videos?.medium;
      return file?.url ? [{
        source, id: String(v.id), url: String(file.url), durationSec: Number(v.duration) || 0, width: Number(file.width) || 0, height: Number(file.height) || 0,
        author: String(v.user || ''), pageUrl: String(v.pageURL || ''), license: licenseOf(source),
      }] : [];
    });
  }
  return (body?.hits || body?.videos || []).flatMap((v: any) => (v.urls?.mp4_download ? [{
    source, id: String(v.id), url: String(v.urls.mp4_download), durationSec: Number(v.duration) || 0,
    width: Number(v.max_width) || 0, height: Number(v.max_height) || 0,
    author: 'Coverr', pageUrl: `https://coverr.co/videos/${v.slug || v.id}`, license: licenseOf(source),
  }] : []));
}

function fitsShape(clip: StockClip, orientation: 'landscape' | 'portrait'): boolean {
  if (!clip.width || !clip.height) return true;
  return orientation === 'portrait' ? clip.height > clip.width : clip.width >= clip.height;
}

export async function searchStockClips(
  query: string,
  options: { orientation: 'landscape' | 'portrait'; minSeconds: number },
): Promise<StockClip[]> {
  const found: StockClip[] = [];
  for (const source of configuredStockSources()) {
    const gate = evaluatePolicyGate({
      connectorId: source,
      actionType: 'search',
      commandPreview: JSON.stringify({ query }),
      approved: false,
      auth: { enabled: false, isAuthorized: false },
    } as any);
    if (!gate.ok) continue;
    try {
      const apiKey = getConnectorCredential(source, SOURCES.find((s) => s.id === source)!.key);
      const body = await invoke('content_stock_search', { request: { source, query, orientation: options.orientation, apiKey } });
      found.push(...mapResults(source, body, options.orientation));
    } catch {
      // One source failing (a bad key, a timeout) does not stop the others.
    }
  }
  return found.filter((c) => c.durationSec >= options.minSeconds && fitsShape(c, options.orientation));
}
