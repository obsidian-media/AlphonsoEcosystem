import { TRUST_STATES, timestampMs } from './trustModel';
import { persistScopeRows } from './runtimeLedgerService';

const MIYA_MEMORY_KEY = 'alphonso_miya_memory_v1';
export const MIYA_MEMORY_SCOPE = 'miya_memory_v1';

export const MIYA_MEMORY_CATEGORIES = [
  'creative_memory',
  'brand_memory',
  'aesthetic_memory',
  'campaign_memory',
  'story_memory'
];

function readRows() {
  try {
    const raw = localStorage.getItem(MIYA_MEMORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRows(rows) {
  const nextRows = rows.slice(-700);
  localStorage.setItem(MIYA_MEMORY_KEY, JSON.stringify(nextRows));
  persistScopeRows(MIYA_MEMORY_SCOPE, nextRows, (row) => ({
    id: row.id,
    data: row,
    status: row.category || 'creative_memory',
    confidence: row.confidence || TRUST_STATES.TEMPORARY,
    verificationState: row.verificationState || TRUST_STATES.UNVERIFIED,
    timestampMs: Number(row.timestampMs || timestampMs())
  }));
}

export function listMiyaMemory() {
  return readRows();
}

export function pushMiyaMemory({
  category = 'creative_memory',
  title,
  content,
  source = 'miya-studio',
  confidence = TRUST_STATES.TEMPORARY,
  verificationState = TRUST_STATES.UNVERIFIED,
  expiresAt = null
}) {
  const rows = readRows();
  const item = {
    id: `miya-mem-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestampMs: timestampMs(),
    category,
    title: title || 'Untitled memory',
    content: content || '',
    source,
    confidence,
    verificationState,
    expiresAt
  };
  rows.push(item);
  writeRows(rows);
  return item;
}

export function upsertBrandKit(brandKit) {
  const rows = readRows();
  const next = {
    id: 'miya-brand-kit',
    timestampMs: timestampMs(),
    category: 'brand_memory',
    title: 'Miya Brand Kit',
    content: brandKit,
    source: 'miya-brand-kit',
    confidence: TRUST_STATES.TEMPORARY,
    verificationState: TRUST_STATES.UNVERIFIED,
    expiresAt: null
  };
  const merged = [...rows.filter((row) => row.id !== 'miya-brand-kit'), next];
  writeRows(merged);
  return next;
}
