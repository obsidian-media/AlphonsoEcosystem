import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../services/miyaMemoryService', () => ({
  listMiyaMemory: vi.fn(() => []),
}));

import { listMiyaMemory } from '../../../services/miyaMemoryService';
import {
  listBrands,
  getBrand,
  saveBrand,
  addBrandLesson,
  ensureFirstBrand,
} from '../../../services/contentFactory/contentBrandService';
import { slugForFolder } from '../../../services/contentFactory/contentProjectFiles';

beforeEach(() => {
  localStorage.clear();
  vi.mocked(listMiyaMemory).mockReturnValue([]);
});

describe('contentBrandService', () => {
  it('new brands get a quality threshold of 7 and the Kokoro voice', () => {
    const brand = saveBrand({ name: 'Learn With Alphonso' });
    expect(brand.qualityThreshold).toBe(7);
    expect(brand.voice).toEqual({ engine: 'kokoro', voiceId: 'af_heart' });
    expect(brand.folderName).toBe('learn-with-alphonso');
    expect(listBrands()).toHaveLength(1);
  });

  it('saving with the same id updates it and keeps createdAtMs', () => {
    const first = saveBrand({ name: 'A' });
    const updated = saveBrand({ id: first.id, name: 'A', tone: 'warm' });
    expect(updated.createdAtMs).toBe(first.createdAtMs);
    expect(getBrand(first.id)?.tone).toBe('warm');
    expect(listBrands()).toHaveLength(1);
  });

  it('adds a lesson', () => {
    const brand = saveBrand({ name: 'A' });
    addBrandLesson(brand.id, 'thumbnail: too much text', 'rejection');
    const lessons = getBrand(brand.id)?.lessons || [];
    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({ text: 'thumbnail: too much text', source: 'rejection' });
  });

  it('creates the first brand from the old Miya brand kit', () => {
    vi.mocked(listMiyaMemory).mockReturnValue([
      { id: 'miya-brand-kit', content: { colors: '#0C6944, #E4573F', tone: 'warm', targetAudience: 'learners', mascots: 'llamas' } },
    ] as never);
    const brand = ensureFirstBrand();
    expect(brand.palette).toEqual(['#0C6944', '#E4573F']);
    expect(brand.tone).toBe('warm');
    expect(brand.audience).toBe('learners');
    expect(brand.characterRefs).toBe('llamas');
    expect(brand.name).toBe('My brand');
  });

  it('returns the existing brand when there is one', () => {
    const existing = saveBrand({ name: 'Existing' });
    expect(ensureFirstBrand().id).toBe(existing.id);
    expect(listBrands()).toHaveLength(1);
  });
});

describe('slugForFolder', () => {
  it('makes names safe for a folder', () => {
    expect(slugForFolder('My Brand!')).toBe('my-brand');
    expect(slugForFolder('CON')).toBe('con-folder');
    expect(slugForFolder('a/b')).toBe('a-b');
    expect(slugForFolder('🎉')).toBe('untitled');
    expect(slugForFolder('end.')).toBe('end');
    expect(slugForFolder('x'.repeat(80))).toHaveLength(60);
  });
});
