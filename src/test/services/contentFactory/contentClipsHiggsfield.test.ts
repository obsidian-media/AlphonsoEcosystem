// Phase 4b: Higgsfield AI clips for the scenes and the Shorts — asked once per run with Higgsfield's estimate.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const backend: Record<string, (args: any) => unknown> = {};
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    if (cmd === 'kv_set' || cmd === 'kv_get' || cmd === 'write_workspace_text_file') return null;
    if (!backend[cmd]) throw new Error(`unexpected command ${cmd}`);
    return backend[cmd](args);
  }),
}));
const creds: Record<string, string> = {};
vi.mock('../../../services/connectors/connectorAuth', () => ({ getConnectorCredential: (_c: string, k: string) => creds[k] || '' }));
vi.mock('../../../services/videoModelService', async (orig) => ({
  ...(await orig<typeof import('../../../services/videoModelService')>()),
  listVideoModels: vi.fn(async () => ({ models: [], selected: null, suggested: null })),
}));

import { invoke } from '@tauri-apps/api/core';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { createProject, emptyBrief, getProject, saveStepVersion, setVideoSettings, setShortsSettings, chosenVersionOf } from '../../../services/contentFactory/contentProjectService';
import { executeMediaStep, checkPendingClips, resolveProjectClipEngine, HIGGSFIELD_NOT_APPROVED } from '../../../services/contentFactory/contentMediaExecutor';
import { contentProjectPlanSteps, clipsWaitPaid, SHORTS_WAIT_PAID } from '../../../services/contentFactory/contentProjectPlan';
import { refreshHiggsfieldEstimate } from '../../../services/connectors/higgsfieldConnector';
import { monthSpendUsd } from '../../../services/jose/joseSpend';

const SCENES = { miya: { style: 'warm', scenes: [
  { id: 's1', startSec: 0, endSec: 4, description: 'A pour', imagePrompt: 'x', mainMoment: true },
  { id: 's2', startSec: 4, endSec: 8, description: 'A smile', imagePrompt: 'y' },
] } };
function setup(brandEngines: Record<string, unknown> = { clips: 'higgsfield' }) {
  const brand = saveBrand({ name: 'B', engines: brandEngines } as any);
  const p = createProject(brand.id, 'L', { ...emptyBrief(), idea: 'x', outputs: ['long video', '2 Shorts'] } as any);
  saveStepVersion(p.id, 'scenes', { output: { ...SCENES, pictures: [
    { sceneId: 's1', status: 'done', relativePath: 'b/p/scenes/v1-s1.png' }, { sceneId: 's2', status: 'done', relativePath: 'b/p/scenes/v1-s2.png' },
  ] }, summary: '', joseCommandId: null });
  return { brand, project: getProject(p.id)!, dir: `${brand.folderName}/${p.folderName}` };
}
const clipsAssignment = (project: any, brand: any, effects = ['write_own_work', 'spend']) =>
  ({ agent: 'miya', actionType: 'creative_video_clips', effects, contentStep: { projectId: project.id, step: 'clips', brief: project.brief, brand, prior: {}, task: '' } }) as any;

beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem('alphonso_settings', JSON.stringify({ outputFolder: 'D:\\Content', zeroCostMode: false }));
  for (const k of Object.keys(backend)) delete backend[k];
  for (const k of Object.keys(creds)) delete creds[k];
  Object.assign(creds, { HIGGSFIELD_KEY_ID: 'id', HIGGSFIELD_KEY_SECRET: 'secret', HIGGSFIELD_CLIP_MODEL: 'kling/i2v', HIGGSFIELD_CLIP_EXTRA: '' });
  vi.clearAllMocks();
  backend.higgsfield_estimate = () => ({ ok: true, usd: 0.4 });
  await refreshHiggsfieldEstimate('clip', { seconds: 5 });
});

describe('Higgsfield AI clips', () => {
  it("the brand's choice of Higgsfield is used for the project", async () => {
    const { project } = setup();
    expect((await resolveProjectClipEngine(project)).engine).toBe('higgsfield');
  });

  it("Higgsfield makes the chosen scenes' clips when approved, each from the scene's picture", async () => {
    const { brand, project, dir } = setup();
    backend.higgsfield_run = (a) => ({ ok: true, status: 'done', path: a.outPath });
    const result = await executeMediaStep(clipsAssignment(project, brand));
    const runs = vi.mocked(invoke).mock.calls.filter((c) => c[0] === 'higgsfield_run').map((c) => c[1] as any);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ outPath: `${dir}/clips/v1-s1.mp4`, job: { model: 'kling/i2v', imagePath: 'b/p/scenes/v1-s1.png', seconds: 4, aspect: '16:9' } });
    expect((result.artifacts[0].data as any)).toMatchObject({ engine: 'higgsfield', model: 'kling/i2v', clips: [{ sceneId: 's1', status: 'done', costUsd: 0.4 }] });
    expect(monthSpendUsd()).toBeCloseTo(0.4, 6);
  });

  it('not approved, nothing is sent', async () => {
    const { brand, project } = setup();
    expect((await executeMediaStep(clipsAssignment(project, brand, ['write_own_work']))).artifacts[0].data).toEqual({ skipped: HIGGSFIELD_NOT_APPROVED });
    expect(vi.mocked(invoke).mock.calls.some((c) => c[0] === 'higgsfield_run')).toBe(false);
  });

  it('the wait text names the engine and its estimate', () => {
    const { brand, project } = setup();
    const clips = contentProjectPlanSteps(project, brand, 'research', { clipEngine: 'higgsfield' }).find((s) => s.contentStep?.step === 'clips')!;
    expect(clips.effects).toContain('spend');
    expect(clips.waitFor).toBe(clipsWaitPaid('Higgsfield'));
    expect(clipsWaitPaid('Higgsfield')).toBe('Check the main moments and the Higgsfield cost in Miya Studio first.');
    expect(clips.costEstimateUsd).toBeCloseTo(0.4, 6);
  });

  it('a clip still running on Higgsfield is fetched by Check again', async () => {
    const { brand, project, dir } = setup();
    backend.higgsfield_run = () => ({ ok: true, status: 'pending', requestId: 'req-3' });
    const result = await executeMediaStep(clipsAssignment(project, brand));
    expect((result.artifacts[0].data as any).clips[0]).toMatchObject({ status: 'pending', requestId: 'req-3', target: `${dir}/clips/v1-s1.mp4` });
    saveStepVersion(project.id, 'clips', { output: { miya: result.artifacts[0].data }, summary: '', joseCommandId: null });
    backend.higgsfield_check = (a) => ({ ok: true, status: 'done', path: a.outPath, requestId: a.requestId });
    const clips = await checkPendingClips(project.id);
    expect(clips[0]).toMatchObject({ sceneId: 's1', status: 'done', path: `${dir}/clips/v1-s1.mp4` });
    expect(vi.mocked(invoke).mock.calls.filter((c) => c[0] === 'higgsfield_run')).toHaveLength(1);
    expect(monthSpendUsd()).toBeCloseTo(0.4, 6);
    expect(((chosenVersionOf(getProject(project.id)!, 'clips')!.output as any).miya.clips[0]).status).toBe('done');
  });

  it('Shorts can use Higgsfield clips, asked once per run with the estimate', () => {
    const { brand, project } = setup({});
    setVideoSettings(project.id, { aiClips: 'none' });
    setShortsSettings(project.id, { aiClips: 'main', clipEngine: 'higgsfield' });
    const shorts = contentProjectPlanSteps(getProject(project.id)!, brand).find((s) => s.contentStep?.step === 'shorts')!;
    expect(shorts.effects).toContain('spend');
    // 2 Shorts × 2 clips (hook and ending) × $0.40.
    expect(shorts.waitFor).toBe(SHORTS_WAIT_PAID(4, 2, 1.6, 'Higgsfield'));
    expect(SHORTS_WAIT_PAID(4, 2, 1.6, 'Higgsfield')).toBe('Make 4 Higgsfield clips for 2 Shorts, about $1.60.');
  });
});
