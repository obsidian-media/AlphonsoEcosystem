import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../services/unifiedMemoryService', () => ({ pushMemory: vi.fn() }));
vi.mock('../../../services/miyaMemoryService', () => ({ listMiyaMemory: vi.fn(() => []) }));
vi.mock('../../../services/contentFactory/contentStepRunner', () => ({ runContentStep: vi.fn(async () => ({})) }));

import { pushMemory } from '../../../services/unifiedMemoryService';
import { runContentStep } from '../../../services/contentFactory/contentStepRunner';
import { getBrand, saveBrand } from '../../../services/contentFactory/contentBrandService';
import { createProject, emptyBrief, getProject, saveStepVersion, updateBrief } from '../../../services/contentFactory/contentProjectService';
import { visiblePieces, rejectPiece, retryWithReason } from '../../../services/contentFactory/contentQualityGate';

const pieces = [
  { pieceId: 'thumbnail-t1', score: 6, comparedTo: 'ref A', weakPoints: ['busy'] },
  { pieceId: 'thumbnail-t2', score: 7, comparedTo: 'ref B', weakPoints: [] },
];

function setup() {
  const brand = saveBrand({ name: 'B' });
  const p = createProject(brand.id, 'P', emptyBrief());
  saveStepVersion(p.id, 'quality', { output: { maria: { pieces, honestyIssues: [] } }, summary: '', joseCommandId: null });
  return { brand, project: getProject(p.id)! };
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(pushMemory).mockClear();
  vi.mocked(runContentStep).mockClear();
});

describe('contentQualityGate', () => {
  it('hides pieces below the brand threshold and always keeps their scores', () => {
    const { brand, project } = setup();
    const rows = visiblePieces(project, brand);
    expect(rows.map((r) => [r.pieceId, r.score, r.visible])).toEqual([['thumbnail-t1', 6, false], ['thumbnail-t2', 7, true]]);
    expect(rows[0].weakPoints).toEqual(['busy']);
  });

  it('shows everything when the brief asks for it', () => {
    const { brand, project } = setup();
    const all = updateBrief(project.id, { ...project.brief, showEverything: true });
    expect(visiblePieces(all, brand).every((r) => r.visible)).toBe(true);
  });

  it('a raised threshold hides more', () => {
    const { brand, project } = setup();
    const strict = saveBrand({ ...brand, qualityThreshold: 8 });
    expect(visiblePieces(project, strict).filter((r) => r.visible)).toHaveLength(0);
  });

  it('a rejection becomes a brand lesson and an Echo memory', () => {
    const { brand, project } = setup();
    saveStepVersion(project.id, 'thumbnail', { output: {}, summary: '', joseCommandId: null });
    const after = rejectPiece(project.id, 'thumbnail', 't1', 'too much text');
    expect(after.steps.thumbnail.status).toBe('sent_back');
    expect(getBrand(brand.id)!.lessons[0].text).toBe('thumbnail: too much text');
    expect(pushMemory).toHaveBeenCalledTimes(1);
    expect(vi.mocked(pushMemory).mock.calls[0][0]).toMatchObject({ category: 'preference_memory', sourceAgent: 'echo' });
  });

  it('retrying passes the reason to the agents', async () => {
    const { project } = setup();
    await retryWithReason(project.id, 'thumbnail', 'make the headline shorter', { outputFolder: 'D:\\C' });
    expect(runContentStep).toHaveBeenCalledWith(project.id, 'thumbnail', expect.objectContaining({ extraTask: expect.stringContaining('make the headline shorter') }));
  });
});
