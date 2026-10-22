// Brands for Miya's content factory: one brand kit per channel or client.
import { durableGet, durableSet } from '../../lib/durableStore.js';
import { listMiyaMemory } from '../miyaMemoryService';
import { slugForFolder } from './contentProjectFiles';
import type { ContentBrand } from './contentTypes';

const BRANDS_KEY = 'alphonso_content_brands_v1';
export const DEFAULT_QUALITY_THRESHOLD = 7;
const DEFAULT_VOICE: ContentBrand['voice'] = { engine: 'kokoro', voiceId: 'af_heart' };

function readBrands(): ContentBrand[] {
  try {
    const parsed = JSON.parse(durableGet(BRANDS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeBrands(brands: ContentBrand[]): void {
  durableSet(BRANDS_KEY, JSON.stringify(brands));
}

export function listBrands(): ContentBrand[] {
  return readBrands();
}

export function getBrand(id: string): ContentBrand | null {
  return readBrands().find((brand) => brand.id === id) || null;
}

export function saveBrand(input: Partial<ContentBrand> & { name: string }): ContentBrand {
  const brands = readBrands();
  const now = Date.now();
  const existing = input.id ? brands.find((brand) => brand.id === input.id) : undefined;
  const base: ContentBrand = existing || {
    id: `brand-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: input.name,
    folderName: slugForFolder(input.name),
    palette: [],
    fonts: '',
    logo: '',
    tone: '',
    audience: '',
    visualStyle: '',
    characterRefs: '',
    voice: { ...DEFAULT_VOICE },
    platforms: [],
    schedule: '',
    honestyRules: '',
    references: [],
    lessons: [],
    pastScripts: '',
    qualityThreshold: DEFAULT_QUALITY_THRESHOLD,
    createdAtMs: now,
    updatedAtMs: now,
  };
  const brand: ContentBrand = {
    ...base,
    ...input,
    id: base.id,
    // The folder keeps its first name so renaming a brand never loses files.
    folderName: base.folderName,
    createdAtMs: base.createdAtMs,
    updatedAtMs: now,
  };
  writeBrands(existing ? brands.map((b) => (b.id === brand.id ? brand : b)) : [...brands, brand]);
  return brand;
}

export function addBrandLesson(id: string, text: string, source: 'rejection' | 'user'): ContentBrand | null {
  const brand = getBrand(id);
  if (!brand) return null;
  return saveBrand({ ...brand, lessons: [...brand.lessons, { atMs: Date.now(), text, source }] });
}

/** The first brand: made from the old single Miya brand kit, if there was one. */
export function ensureFirstBrand(): ContentBrand {
  const brands = readBrands();
  if (brands.length > 0) return brands[0];
  let kit: Record<string, string> = {};
  try {
    const rows = (listMiyaMemory as unknown as () => Array<{ id?: string; content?: unknown }>)() || [];
    const saved = rows.find((row) => row?.id === 'miya-brand-kit')?.content;
    if (saved && typeof saved === 'object') kit = saved as Record<string, string>;
  } catch { /* memory unavailable: start empty */ }
  const text = (key: string) => (typeof kit[key] === 'string' ? kit[key] : '');
  return saveBrand({
    name: 'My brand',
    palette: text('colors').split(',').map((c) => c.trim()).filter(Boolean),
    fonts: text('fonts'),
    logo: text('logos'),
    characterRefs: text('mascots'),
    tone: text('tone'),
    audience: text('targetAudience'),
    visualStyle: text('visualStyle'),
    honestyRules: text('channelRules'),
  });
}
