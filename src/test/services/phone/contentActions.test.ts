import { describe, it, expect, vi, beforeEach } from 'vitest';

let project: any;
const approveContentStep = vi.fn(async () => project);
const runContentProject = vi.fn(async () => ({ ok: true, requestId: 'req-1' }));
const retryWithReason = vi.fn(async () => project);
const chooseVersion = vi.fn(() => project);
const createProject = vi.fn((brandId: string, name: string, brief: any) => ({ id: 'new-1', brandId, name, brief }));
const updatePost = vi.fn(() => ({ ok: true }));
const movePost = vi.fn(async () => ({ ok: true }));
const cancelProjectPost = vi.fn(async () => ({ ok: true }));

vi.mock('../../../services/contentFactory/contentProjectService', () => ({
  getProject: () => project,
  chooseVersion: (...a: unknown[]) => chooseVersion(...(a as [])),
  createProject: (...a: unknown[]) => createProject(...(a as [string, string, unknown])),
  emptyBrief: () => ({ idea: '', platforms: [], outputs: [], format: 'voiceover_broll', lengthSec: 60, notes: '', writeInMyVoice: false, showEverything: false }),
}));
vi.mock('../../../services/contentFactory/contentStepRunner', () => ({
  approveContentStep: (...a: unknown[]) => approveContentStep(...(a as [])),
  runContentProject: (...a: unknown[]) => runContentProject(...(a as [])),
}));
vi.mock('../../../services/contentFactory/contentQualityGate', () => ({ retryWithReason: (...a: unknown[]) => retryWithReason(...(a as [])) }));
vi.mock('../../../services/contentFactory/contentPosts', () => ({ updatePost: (...a: unknown[]) => updatePost(...(a as [])) }));
vi.mock('../../../services/contentFactory/contentPostMoves', () => ({
  movePost: (...a: unknown[]) => movePost(...(a as [])),
  cancelProjectPost: (...a: unknown[]) => cancelProjectPost(...(a as [])),
}));
vi.mock('../../../services/contentFactory/contentBrandService', () => ({ getBrand: (id: string) => (id === 'b1' ? { id: 'b1', name: 'Shop' } : null) }));
vi.mock('../../../services/phone/contentMirror', () => ({ mediaOffered: () => true, projectMedia: () => [] }));
vi.mock('../../../services/phone/phoneLink', () => ({ previewFits: () => ({ ok: true }) }));

import { CONTENT_CALLS, CHANGED_ON_COMPUTER, stepStamp, postStamp, postsStamp, resetContentCallsForTests } from '../../../services/phone/contentCalls';

function makeProject() {
  return {
    id: 'p1', brandId: 'b1', updatedAtMs: 5,
    steps: { script: { status: 'needs_approval', versions: [{ version: 1 }], chosenVersion: 1 } },
    posts: [{ id: 'post-1', platform: 'instagram', title: '', caption: 'Hi', hashtags: ['a'], scheduledAtMs: 100, status: 'draft' }],
  };
}

beforeEach(() => {
  project = makeProject();
  resetContentCallsForTests();
  localStorage.setItem('alphonso_settings', JSON.stringify({ outputFolder: 'D:/Out' }));
  for (const f of [approveContentStep, runContentProject, retryWithReason, chooseVersion, createProject, updatePost, movePost, cancelProjectPost]) f.mockClear();
});

describe("the content factory's phone calls", () => {
  it('a stale base is refused with the latest and changes nothing', async () => {
    const base = stepStamp(project, 'script');
    project.steps.script.versions.push({ version: 2 });
    const r: any = await CONTENT_CALLS['content.approveStep']({ projectId: 'p1', step: 'script', base });
    expect(r).toMatchObject({ stale: true, message: CHANGED_ON_COMPUTER });
    expect(r.latest.id).toBe('p1');
    expect(approveContentStep).not.toHaveBeenCalled();
    expect(CHANGED_ON_COMPUTER).toBe("This changed on your computer; here's the latest.");
  });

  it('a progress line elsewhere in the project does not make a post stale', async () => {
    const base = postStamp(project.posts[0]);
    project.updatedAtMs = 99;
    project.steps.script.progress = [{ message: 'working' }];
    const r: any = await CONTENT_CALLS['content.editPost']({ projectId: 'p1', postId: 'post-1', caption: 'Hello', base });
    expect(r.ok).toBe(true);
  });

  it('editing a post that has gone out is refused with the latest', async () => {
    const base = postStamp(project.posts[0]);
    project.posts[0].status = 'posted';
    const r: any = await CONTENT_CALLS['content.editPost']({ projectId: 'p1', postId: 'post-1', caption: 'Hello', base });
    expect(r.stale).toBe(true);
    expect(updatePost).not.toHaveBeenCalled();
  });

  it('editPost changes only title, caption and hashtags', async () => {
    await CONTENT_CALLS['content.editPost']({ projectId: 'p1', postId: 'post-1', caption: 'Hello', hashtags: ['x', 5], status: 'posted', scheduledAtMs: 1, base: postStamp(project.posts[0]) });
    expect(updatePost).toHaveBeenCalledWith('p1', 'post-1', { caption: 'Hello', hashtags: ['x'] });
  });

  it('sendBack starts the step again with the reason', async () => {
    const r: any = await CONTENT_CALLS['content.sendBack']({ projectId: 'p1', step: 'script', reason: '  Too long ', base: stepStamp(project, 'script') });
    expect(r.ok).toBe(true);
    expect(retryWithReason).toHaveBeenCalledWith('p1', 'script', 'Too long', { outputFolder: 'D:/Out' });
    await expect(CONTENT_CALLS['content.sendBack']({ projectId: 'p1', step: 'script', reason: ' ', base: stepStamp(project, 'script') })).rejects.toThrow();
  });

  it('chooseVersion uses the computer\'s own choice', async () => {
    await CONTENT_CALLS['content.chooseVersion']({ projectId: 'p1', step: 'script', version: 1, base: stepStamp(project, 'script') });
    expect(chooseVersion).toHaveBeenCalledWith('p1', 'script', 1);
  });

  it('movePost and cancelPost go through the Calendar\'s own moves', async () => {
    await CONTENT_CALLS['content.movePost']({ projectId: 'p1', postId: 'post-1', atMs: 5000, base: postStamp(project.posts[0]) });
    expect(movePost).toHaveBeenCalledWith('p1', 'post-1', 5000);
    await CONTENT_CALLS['content.cancelPost']({ projectId: 'p1', postId: 'post-1', base: postStamp(project.posts[0]) });
    expect(cancelProjectPost).toHaveBeenCalledWith('p1', 'post-1');
  });

  it('approvePosts approves Publish once', async () => {
    const base = postsStamp(project);
    expect(await CONTENT_CALLS['content.approvePosts']({ projectId: 'p1', base })).toMatchObject({ ok: true });
    expect(approveContentStep).toHaveBeenCalledWith('p1', 'publish', { outputFolder: 'D:/Out' });
    await expect(CONTENT_CALLS['content.approvePosts']({ projectId: 'p1', base })).rejects.toThrow('Already done.');
    expect(approveContentStep).toHaveBeenCalledTimes(1);
  });

  it("startProject makes the brief from the brand's defaults and what to make", async () => {
    const r: any = await CONTENT_CALLS['content.startProject']({ brandId: 'b1', idea: ' a bakery tour ', make: ['video', 'shorts', 'nonsense'] });
    expect(createProject).toHaveBeenCalledWith('b1', 'A bakery tour', expect.objectContaining({ idea: 'A bakery tour', outputs: ['Long video', 'Shorts'] }));
    expect(runContentProject).toHaveBeenCalledWith('new-1', { settings: { outputFolder: 'D:/Out' } });
    expect(r).toEqual({ ok: true, projectId: 'new-1', requestId: 'req-1' });
    await expect(CONTENT_CALLS['content.startProject']({ brandId: 'nope', idea: 'x', make: ['video'] })).rejects.toThrow();
    await expect(CONTENT_CALLS['content.startProject']({ brandId: 'b1', idea: '  ', make: ['video'] })).rejects.toThrow();
  });

  it('a project or post that no longer exists says so', async () => {
    project = null;
    await expect(CONTENT_CALLS['content.approveStep']({ projectId: 'p1', step: 'script', base: 'x' })).rejects.toThrow("That project isn't on your computer any more.");
  });
});
