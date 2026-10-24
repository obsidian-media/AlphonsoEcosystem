import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../services/contentFactory/contentProjectFiles', async () => {
  const actual = await vi.importActual<typeof import('../../../services/contentFactory/contentProjectFiles')>('../../../services/contentFactory/contentProjectFiles');
  return { ...actual, writeProjectFile: vi.fn(async () => undefined), writeStepText: vi.fn(async () => 'x/v1.md') };
});
vi.mock('../../../services/contentFactory/shortMaker', async () => ({
  ...(await vi.importActual<typeof import('../../../services/contentFactory/shortMaker')>('../../../services/contentFactory/shortMaker')),
  makeShorts: vi.fn(async () => []),
  redoShort: vi.fn(async () => ({ shortId: 'x', status: 'done' })),
}));
vi.mock('../../../services/contentFactory/contentImages', () => ({
  renderScenePictures: vi.fn(async () => []),
  renderThumbnails: vi.fn(async () => []),
}));

import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { createProject, emptyBrief, getProject, markStepStatus } from '../../../services/contentFactory/contentProjectService';
import { writeStepText } from '../../../services/contentFactory/contentProjectFiles';
import { renderScenePictures } from '../../../services/contentFactory/contentImages';
import { recordContentStepResult, beginContentStep } from '../../../services/contentFactory/contentStepRecorder';

function newProject() {
  const brand = saveBrand({ name: 'My brand' });
  return createProject(brand.id, 'Launch', { ...emptyBrief(), idea: 'Why we wait' });
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('alphonso_settings', JSON.stringify({ outputFolder: 'D:\\Content' }));
  vi.clearAllMocks();
});

// Phase 6b: a project runs as one Jose request, so each step is saved as it finishes.
describe('recordContentStepResult', () => {
  it('saves a step once all its agents have answered', async () => {
    const p = newProject();
    expect(await recordContentStepResult({ projectId: p.id, step: 'research', agent: 'hector', data: { hooks: ['a'] }, commandId: 'c1' })).toBe('partial');
    expect(getProject(p.id)!.steps.research.versions).toHaveLength(0);
    expect(await recordContentStepResult({ projectId: p.id, step: 'research', agent: 'nova', data: { audience: 'b' }, commandId: 'c1' })).toBe('saved');
    const research = getProject(p.id)!.steps.research;
    expect(research.versions).toHaveLength(1);
    expect(research.versions[0]).toMatchObject({ version: 1, output: { hector: { hooks: ['a'] }, nova: { audience: 'b' } }, joseCommandId: 'c1' });
    expect(research.pendingAgents).toBeUndefined();
    expect(writeStepText).toHaveBeenCalled();
  });

  it('a single-agent step saves at once', async () => {
    const p = newProject();
    expect(await recordContentStepResult({ projectId: p.id, step: 'script', agent: 'miya', data: { hooks: [] }, commandId: 'c1' })).toBe('saved');
    expect(getProject(p.id)!.steps.script.chosenVersion).toBe(1);
  });

  it('a revision saves as a new version', async () => {
    const p = newProject();
    await recordContentStepResult({ projectId: p.id, step: 'script', agent: 'miya', data: { v: 1 }, commandId: 'c1' });
    await recordContentStepResult({ projectId: p.id, step: 'script', agent: 'miya', data: { v: 2 }, commandId: 'c1' });
    expect(getProject(p.id)!.steps.script.versions.map((v) => v.version)).toEqual([1, 2]);
  });

  it('an unknown project, or an agent the step does not have, is ignored', async () => {
    const p = newProject();
    expect(await recordContentStepResult({ projectId: 'nope', step: 'script', agent: 'miya', data: {}, commandId: null })).toBe('ignored');
    expect(await recordContentStepResult({ projectId: p.id, step: 'script', agent: 'nova', data: {}, commandId: null })).toBe('ignored');
  });

  it('scenes make their pictures after saving, then the step is done', async () => {
    const p = newProject();
    await recordContentStepResult({ projectId: p.id, step: 'scenes', agent: 'miya', data: { scenes: [] }, commandId: 'c1' });
    expect(renderScenePictures).toHaveBeenCalledWith(p.id, { outputFolder: 'D:\\Content' }, expect.any(Function));
    expect(getProject(p.id)!.steps.scenes.status).toBe('done');
  });

  it('running scenes marks a review still waiting as approved', async () => {
    const p = newProject();
    markStepStatus(p.id, 'review', 'needs_approval', null);
    beginContentStep(p.id, 'scenes');
    expect(getProject(p.id)!.steps.review.status).toBe('approved');
  });

  it('beginning a step shows it running once, keeping an agent that already answered', async () => {
    const p = newProject();
    beginContentStep(p.id, 'research');
    await recordContentStepResult({ projectId: p.id, step: 'research', agent: 'hector', data: { hooks: [] }, commandId: 'c1' });
    beginContentStep(p.id, 'research');
    expect(getProject(p.id)!.steps.research.status).toBe('running');
    expect(await recordContentStepResult({ projectId: p.id, step: 'research', agent: 'nova', data: {}, commandId: 'c1' })).toBe('saved');
  });
});

// Phase 3d: once the scenes exist, the waiting AI clips step shows Runway's cost on full runs.
it("Scenes saving fills in the clips step's Runway estimate on the request", async () => {
  const { createJoseRequest, getJoseRequest } = await import('../../../services/jose/joseRequestStore');
  const { setProjectRequest, saveStepVersion, setVideoSettings } = await import('../../../services/contentFactory/contentProjectService');
  localStorage.setItem('alphonso_settings', JSON.stringify({ outputFolder: 'D:\\Content', paidModels: { runwayPricePerSecondUsd: 0.05 } }));
  const p = newProject();
  setVideoSettings(p.id, { aiClips: 'every', clipEngine: 'runway' });
  const request = createJoseRequest({ commandId: 'c9', source: 'user', text: 'x', kind: 'project', steps: [
    { stepId: 'scenes', agent: 'miya', actionType: 'creative_scenes', effects: ['write_own_work'], needs: [] },
    { stepId: 'clips', agent: 'miya', actionType: 'creative_video_clips', effects: ['write_own_work', 'spend'], needs: ['scenes'] },
  ] });
  setProjectRequest(p.id, request.id);
  saveStepVersion(p.id, 'script', { output: {}, summary: '', joseCommandId: null });
  await recordContentStepResult({ projectId: p.id, step: 'scenes', agent: 'miya', data: { style: 's', scenes: [
    { id: 's1', startSec: 0, endSec: 4, imagePrompt: 'a', description: 'd' },
    { id: 's2', startSec: 4, endSec: 12, imagePrompt: 'b', description: 'd' },
  ] }, commandId: 'c9' });
  expect(getJoseRequest(request.id)!.steps.find((s) => s.stepId === 'clips')!.costEstimateUsd).toBeGreaterThan(0);
});

// Phase 3d: once the Shorts are planned, each one is made.
it('the Shorts step makes each Short after it saves its plan', async () => {
  const { makeShorts } = await import('../../../services/contentFactory/shortMaker');
  const p = newProject();
  await recordContentStepResult({ projectId: p.id, step: 'shorts', agent: 'miya', data: { shorts: [{ id: 'sh1', kind: 'cut' }] }, commandId: 'c1' });
  expect(makeShorts).toHaveBeenCalledWith(p.id, expect.objectContaining({ outputFolder: expect.stringContaining('Content') }), expect.any(Function));
  expect(getProject(p.id)!.steps.shorts.status).toBe('done');
});

it('the Shorts step ends saying how many Shorts failed', async () => {
  const { makeShorts } = await import('../../../services/contentFactory/shortMaker');
  vi.mocked(makeShorts).mockResolvedValueOnce([{ shortId: 'sh1', status: 'done' }, { shortId: 'sh2', status: 'failed', reason: 'x' }, { shortId: 'sh3', status: 'done' }] as any);
  const p = newProject();
  await recordContentStepResult({ projectId: p.id, step: 'shorts', agent: 'miya', data: { shorts: [] }, commandId: 'c1' });
  expect(getProject(p.id)!.steps.shorts.progress.map((x: { message: string }) => x.message)).toContain('done, 1 of 3 failed');
});

it("an added mini-script Short is appended to the chosen Shorts and made, without a new version", async () => {
  const { redoShort } = await import('../../../services/contentFactory/shortMaker');
  const { saveStepVersion } = await import('../../../services/contentFactory/contentProjectService');
  const p = newProject();
  saveStepVersion(p.id, 'shorts', { output: { miya: { shorts: [{ id: 'sh1', kind: 'cut', moment: { startSec: 0, endSec: 30 } }] } }, summary: '', joseCommandId: null });
  const res = await recordContentStepResult({ projectId: p.id, step: 'shorts', agent: 'miya', appendShort: true, commandId: 'c2',
    data: { shorts: [{ id: 'sh1', kind: 'mini', title: 'New', hook: 'h', seconds: 40, platforms: [], copy: [], parts: [{ spoken: 'a', imagePrompt: 'b', seconds: 5 }] }] } });
  expect(res).toBe('saved');
  const versions = getProject(p.id)!.steps.shorts.versions;
  expect(versions).toHaveLength(1);
  const shorts = (versions[0].output as { miya: { shorts: Record<string, unknown>[] } }).miya.shorts;
  expect(shorts.map((x) => x.id)).toEqual(['sh1', 'sh2']);
  expect(shorts[1]).toMatchObject({ kind: 'mini', title: 'New' });
  expect(redoShort).toHaveBeenCalledWith(p.id, 'sh2', expect.anything());
});

it('an approved Runway Shorts run is made with Runway', async () => {
  const { makeShorts } = await import('../../../services/contentFactory/shortMaker');
  const p = newProject();
  await recordContentStepResult({ projectId: p.id, step: 'shorts', agent: 'miya', data: { shorts: [] }, commandId: 'c1', runwayApproved: true });
  expect(makeShorts).toHaveBeenLastCalledWith(p.id, expect.anything(), expect.any(Function), { runwayApproved: true });
});

