// Brands for Miya's content factory: one brand kit per channel or client.
import { durableGet, durableSet } from '../../lib/durableStore.js';
import { listMiyaMemory } from '../miyaMemoryService';
import { slugForFolder } from './contentProjectFiles';
import { secureId, type BrandLesson, type ContentBrand } from './contentTypes';

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
    id: secureId('brand'),
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
    postingSlots: [],
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

/** Lessons proposed from real numbers and not yet kept or dropped (phase 4a). */
export function proposedLessons(brandId: string): BrandLesson[] {
  return (getBrand(brandId)?.lessons || []).filter((l) => l.status === 'proposed');
}

/** Adds proposed lessons, skipping near-duplicates of the brand's lessons for the same post. */
export function addProposedLessons(brandId: string, items: { text: string; kind: 'worked' | 'didnt' }[], postRef: { projectId: string; postId: string }, perKind = 3): number {
  const brand = getBrand(brandId);
  if (!brand) return 0;
  const lessons = [...brand.lessons];
  let added = 0;
  for (const item of items) {
    const forPost = lessons.filter((l) => l.postRef?.postId === postRef.postId && l.postRef?.projectId === postRef.projectId);
    if (forPost.filter((l) => l.kind === item.kind).length >= perKind) continue;
    if (forPost.some((l) => nearlySame(l.text, item.text))) continue;
    lessons.push({ id: secureId('lesson'), atMs: Date.now(), text: item.text, source: 'performance', status: 'proposed', kind: item.kind, postRef });
    added += 1;
  }
  if (added) saveBrand({ ...brand, lessons });
  return added;
}

const wordsOf = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean));
/** Two lessons are the same when 80% of the shorter one's words are in the other. */
function nearlySame(a: string, b: string): boolean {
  const [x, y] = [wordsOf(a), wordsOf(b)];
  const small = x.size <= y.size ? x : y;
  const big = small === x ? y : x;
  if (!small.size) return false;
  let shared = 0;
  for (const w of small) if (big.has(w)) shared += 1;
  return shared / small.size >= 0.8;
}

function decideLesson(brandId: string, lessonId: string, change: (l: BrandLesson) => BrandLesson | null): { ok: boolean; already?: boolean } {
  const brand = getBrand(brandId);
  const lesson = brand?.lessons.find((l) => l.id === lessonId);
  if (!brand || !lesson) return { ok: false, already: true };
  if (lesson.status !== 'proposed') return { ok: false, already: true };
  const next = change(lesson);
  saveBrand({ ...brand, lessons: brand.lessons.flatMap((l) => (l.id === lessonId ? (next ? [next] : []) : [l])) });
  return { ok: true };
}
export const keepLesson = (brandId: string, lessonId: string) => decideLesson(brandId, lessonId, (l) => ({ ...l, status: 'kept' }));
export const editLesson = (brandId: string, lessonId: string, text: string) => decideLesson(brandId, lessonId, (l) => ({ ...l, text: text.trim() || l.text, status: 'kept' }));
export const dropLesson = (brandId: string, lessonId: string) => decideLesson(brandId, lessonId, () => null);

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
