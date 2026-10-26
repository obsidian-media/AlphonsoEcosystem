// Agent phase 7: decisions made outside a request — Miya Studio's rejections and kept lessons,
// and a step you rejected — reach Echo's store.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../services/memoryGraphService', () => ({ addNode: vi.fn(async () => null), addEdge: vi.fn(async () => null) }));
const brandRef = { id: 'b1' };
vi.mock('../../../services/contentFactory/contentProjectService', async (orig) => ({
  ...(await orig() as object),
  getProject: vi.fn(() => ({ id: 'p1', name: 'Launch video', brandId: brandRef.id, brief: {}, steps: {} })),
  sendBackStep: vi.fn((id: string) => ({ id })),
}));

import { listDecisions } from '../../../services/echo/decisions';
import { rejectPiece } from '../../../services/contentFactory/contentQualityGate';
import { saveBrand, keepLesson, addProposedLessons, getBrand } from '../../../services/contentFactory/contentBrandService';

beforeEach(() => localStorage.clear());

describe('decisions from Miya Studio', () => {
  it('a rejected piece with its reason is a rejection decided in Miya Studio', () => {
    brandRef.id = saveBrand({ name: 'Shop' }).id;
    rejectPiece('p1', 'script', 'piece-1', 'Too long for a Short');
    const [d] = listDecisions();
    expect(d).toMatchObject({ kind: 'rejection', source: { surface: 'miya', by: 'you' } });
    expect(d.text).toContain('Too long for a Short');
  });

  it('a lesson you keep is a decision', () => {
    const b1 = saveBrand({ name: 'Shop' }).id;
    addProposedLessons(b1, [{ text: 'Hooks with a number get more views.', kind: 'worked' }], { projectId: 'p1', postId: 'post-1' });
    const lesson = getBrand(b1)!.lessons[0];
    keepLesson(b1, lesson.id);
    expect(listDecisions().map((d) => [d.kind, d.text, d.source.surface])).toEqual([['decision', 'Hooks with a number get more views.', 'miya']]);
  });
});
