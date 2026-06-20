import { TRUST_STATES, timestampMs } from './trustModel';

const MARKET_KEY = 'alphonso_local_marketplace_registry_v1';

const DEFAULT_ITEMS = [
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

function readItems() {
  try {
    const raw = localStorage.getItem(MARKET_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeItems(items) {
  localStorage.setItem(MARKET_KEY, JSON.stringify(items.slice(-300)));
}

export function listMarketplaceItems() {
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

export function setMarketplaceItemStatus(itemId, status) {
  const items = listMarketplaceItems().map((item) => (
    item.id === itemId
      ? { ...item, status, updatedAtMs: timestampMs(), trust: TRUST_STATES.TEMPORARY }
      : item
  ));
  writeItems(items);
  return items;
}
