import { describe, it, expect, vi, beforeEach } from 'vitest';

const projects: any[] = [];
vi.mock('../../../services/contentFactory/contentProjectService', () => ({
  listProjects: () => projects.slice(),
  getProject: (id: string) => projects.find((p) => p.id === id) || null,
}));
vi.mock('../../../services/contentFactory/contentBrandService', () => ({
  listBrands: () => [{ id: 'b1', name: 'Shop', folderName: 'shop', palette: [] }],
}));
vi.mock('../../../services/contentFactory/calendarItems', () => ({ listCalendarItems: () => [] }));
vi.mock('../../../services/jose/joseStepOutputs', () => ({ listStepOutputs: () => [] }));
vi.mock('../../../services/jose/joseRequestStore', () => ({ listJoseRequests: () => [], onRequestStatusChange: () => () => {} }));

import { contentMirrorData, mediaOffered, CONTENT_PROJECTS } from '../../../services/phone/contentMirror';
import { mirrorSnapshots } from '../../../services/phone/phoneMirror';

function project(id: string, updatedAtMs: number, outputs: Record<string, unknown> = {}) {
  const steps: Record<string, unknown> = {};
  for (const [step, output] of Object.entries(outputs)) {
    steps[step] = { status: 'done', versions: [{ version: 1, createdAtMs: 1, output, summary: '', joseCommandId: null, stale: false, basedOn: {} }], chosenVersion: 1, error: null, startedAtMs: null, progress: [] };
  }
  return { id, brandId: 'b1', name: id, folderName: id, brief: {}, briefRevision: 1, steps, posts: [], createdAtMs: 1, updatedAtMs };
}

beforeEach(() => { projects.length = 0; });

describe('the content store', () => {
  it('holds the 20 most recent projects, newest first', () => {
    for (let i = 0; i < 22; i += 1) projects.push(project(`p${i}`, i));
    const data = contentMirrorData(100);
    expect(CONTENT_PROJECTS).toBe(20);
    expect(data.projects).toHaveLength(20);
    expect(data.projects[0].id).toBe('p21');
    expect(data.projects[19].id).toBe('p2');
  });

  it('lists the media each project\'s versions name, as references', () => {
    projects.push(project('p1', 5, {
      scenes: { scenes: [{ id: 's1', picture: { status: 'done', relativePath: 'shop/p1/scenes/v1-s1.png' } }] },
      assemble: { outputs: { '16x9': 'shop/p1/output/v1-16x9.mp4' }, note: 'made.mp4 is a word, not a path' },
    }));
    const media = contentMirrorData(100).projects[0].media;
    expect(media).toContainEqual({ projectId: 'p1', path: 'shop/p1/scenes/v1-s1.png', kind: 'picture' });
    expect(media).toContainEqual({ projectId: 'p1', path: 'shop/p1/output/v1-16x9.mp4', kind: 'video' });
    expect(media).toHaveLength(2);
  });

  it('mediaOffered refuses a path the project does not list', () => {
    projects.push(project('p1', 5, { scenes: { picture: 'shop/p1/scenes/v1-s1.png' } }), project('p2', 4, { scenes: { picture: 'shop/p2/x.png' } }));
    expect(mediaOffered({ projectId: 'p1', path: 'shop/p1/scenes/v1-s1.png', kind: 'picture' })).toBe(true);
    expect(mediaOffered({ projectId: 'p1', path: '../secrets.txt', kind: 'picture' })).toBe(false);
    expect(mediaOffered({ projectId: 'p1', path: 'shop/p2/x.png', kind: 'picture' })).toBe(false);
    expect(mediaOffered({ projectId: 'p1', path: 'shop/p1/scenes/v1-s1.png', kind: 'video' })).toBe(false);
    expect(mediaOffered({ projectId: 'nope', path: 'shop/p1/scenes/v1-s1.png', kind: 'picture' })).toBe(false);
  });

  it('never offers an absolute or climbing path', () => {
    projects.push(project('p1', 5, { a: { p: 'C:/Users/me/x.png', q: '/etc/x.png', r: 'shop/../../x.png' } }));
    expect(contentMirrorData(100).projects[0].media).toEqual([]);
  });

  it('is part of the snapshot', () => {
    expect(Object.keys(mirrorSnapshots())).toContain('content');
  });
});
