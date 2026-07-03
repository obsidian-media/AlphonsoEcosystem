import { TRUST_STATES, timestampMs } from './trustModel';

const MARKET_KEY = 'alphonso_local_marketplace_registry_v1';
const CATALOGUE_URL_KEY = 'alphonso_marketplace_catalogue_url_v1';

export const DEFAULT_CATALOGUE_URL =
  'https://raw.githubusercontent.com/obsidian-media/AlphonsoEcosystem/main/gateway/marketplace/catalogue.json';

interface MarketplaceItem {
  id: string;
  name: string;
  type: string;
  status: string;
  trust?: string;
  updatedAtMs?: number;
  [key: string]: unknown;
}

const DEFAULT_ITEMS: MarketplaceItem[] = [
  { id: 'item.agent.jose', name: 'Jose Orchestrator Agent', type: 'agent', status: 'installed' },
  { id: 'item.agent.miya', name: 'Miya Creative Agent', type: 'agent', status: 'installed' },
  { id: 'item.agent.alphonso', name: 'Alphonso Operator Agent', type: 'agent', status: 'installed' },
  { id: 'item.agent.hector', name: 'Hector Research Agent', type: 'agent', status: 'installed' },
  { id: 'item.connector.telegram', name: 'Telegram Bridge', type: 'connector', status: 'available' },
  { id: 'item.connector.whatsapp', name: 'WhatsApp Bridge', type: 'connector', status: 'available' },
  { id: 'item.skillpack.youtube', name: 'YouTube Skill Pack', type: 'skill_pack', status: 'available' },
  { id: 'item.workflow.creator_to_operator', name: 'Creator->Operator Workflow', type: 'workflow', status: 'available' },
  { id: 'item.theme.cinematic_dark', name: 'Cinematic Dark Theme', type: 'theme', status: 'available' }
];

function readItems(): MarketplaceItem[] {
  try {
    const raw = localStorage.getItem(MARKET_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeItems(items: MarketplaceItem[]) {
  localStorage.setItem(MARKET_KEY, JSON.stringify(items.slice(-300)));
}

export function listMarketplaceItems(): MarketplaceItem[] {
  const items = readItems();
  if (items.length === 0) {
    const seeded = DEFAULT_ITEMS.map((item) => ({
      ...item,
      trust: TRUST_STATES.TEMPORARY,
      updatedAtMs: timestampMs()
    }));
    writeItems(seeded);
    return seeded;
  }
  const missingDefaults = DEFAULT_ITEMS
    .filter((item) => !items.some((existing) => existing.id === item.id))
    .map((item) => ({
      ...item,
      trust: TRUST_STATES.TEMPORARY,
      updatedAtMs: timestampMs()
    }));
  if (missingDefaults.length > 0) {
    const merged = [...items, ...missingDefaults];
    writeItems(merged);
    return merged;
  }
  return items;
}

export function setMarketplaceItemStatus(itemId: string, status: string): MarketplaceItem[] {
  const items = listMarketplaceItems().map((item) => (
    item.id === itemId
      ? { ...item, status, updatedAtMs: timestampMs(), trust: TRUST_STATES.TEMPORARY }
      : item
  ));
  writeItems(items);
  return items;
}

export function getRemoteCatalogueUrl(): string {
  try {
    return localStorage.getItem(CATALOGUE_URL_KEY) || DEFAULT_CATALOGUE_URL;
  } catch {
    return DEFAULT_CATALOGUE_URL;
  }
}

export function setRemoteCatalogueUrl(url: string) {
  if (!url || typeof url !== 'string') throw new Error('Invalid catalogue URL');
  localStorage.setItem(CATALOGUE_URL_KEY, url);
}

export async function fetchRemoteCatalogue(url?: string): Promise<MarketplaceItem[]> {
  const endpoint = url || getRemoteCatalogueUrl();
  const res = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Catalogue fetch failed: ${res.status}`);
  const json = await res.json();
  if (!json || !Array.isArray(json.items)) throw new Error('Invalid catalogue format: missing items array');
  return json.items;
}
