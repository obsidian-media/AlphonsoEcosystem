// Phase 4c: motion transfer with Higgsfield — inside the one approval of the clips step.
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
vi.mock('../../../services/connectors/connectorImageGenerators', () => ({
  generateComfyUiImage: vi.fn(async () => ({ ok: true, previewBase64: 'PIC' })),
  getComfyUiEndpoint: vi.fn(() => 'http://127.0.0.1:8188'),
}));
vi.mock('../../../services/videoModelService', async (orig) => ({
  ...(await orig<typeof import('../../../services/videoModelService')>()),
  listVideoModels: vi.fn(async () => ({ models: [], selected: null, suggested: null })),
}));

import { invoke } from '@tauri-apps/api/core';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { createProject, emptyBrief, getProject, saveStepVersion, setSceneMotion, setVideoSettings } from '../../../services/contentFactory/contentProjectService';
import { executeMediaStep } from '../../../services/contentFactory/contentMediaExecutor';
import { makeShorts } from '../../../services/contentFactory/shortMaker';
import { setShortPartMotion } from '../../../services/contentFactory/contentProjectService';
import { contentProjectPlanSteps, clipsWaitPaid, motionIncluded, SHORTS_MOTION_WAIT } from '../../../services/contentFactory/contentProjectPlan';
import { refreshHiggsfieldEstimate, listHiggsfieldPresets } from '../../../services/connectors/higgsfieldConnector';
import { monthSpendUsd } from '../../../services/jose/joseSpend';

function setup(engines: Record<string, unknown> = { clips: 'higgsfield' }) {
  const brand = saveBrand({ name: 'B', engines } as any);
  const p = createProject(brand.id, 'L', { ...emptyBrief(), idea: 'x' } as any);
  saveStepVersion(p.id, 'scenes', { output: { miya: { style: 'warm', scenes: [
    { id: 's1', startSec: 0, endSec: 4, description: 'A wave', imagePrompt: 'x' },
    { id: 's2', startSec: 4, endSec: 8, description: 'Desk', imagePrompt: 'y', mainMoment: true },
  ] }, pictures: [
    { sceneId: 's1', status: 'done', relativePath: 'b/p/scenes/v1-s1.png' }, { sceneId: 's2', status: 'done', relativePath: 'b/p/scenes/v1-s2.png' },
  ] }, summary: '', joseCommandId: null });
  setSceneMotion(p.id, 's1', { source: 'recorded', path: 'b/p/motion/s1-v1.mp4' });
  return { brand, project: getProject(p.id)!, dir: `${brand.folderName}/${p.folderName}` };
}
const clips = (project: any, brand: any, effects = ['write_own_work', 'spend']) =>
  ({ agent: 'miya', actionType: 'creative_video_clips', effects, contentStep: { projectId: project.id, step: 'clips', brief: project.brief, brand, prior: {}, task: '' } }) as any;
const runs = () => vi.mocked(invoke).mock.calls.filter((c) => c[0] === 'higgsfield_run').map((c) => c[1] as any);

beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem('alphonso_settings', JSON.stringify({ outputFolder: 'D:\\Content', zeroCostMode: false }));
  for (const k of Object.keys(backend)) delete backend[k];
  for (const k of Object.keys(creds)) delete creds[k];
  Object.assign(creds, { HIGGSFIELD_KEY_ID: 'id', HIGGSFIELD_KEY_SECRET: 'secret', HIGGSFIELD_CLIP_MODEL: 'kling/i2v', HIGGSFIELD_MOTION_MODEL: 'm/motion' });
  backend.higgsfield_estimate = (a) => ({ ok: true, usd: a.job.model === 'm/motion' ? 0.6 : 0.4 });
  await refreshHiggsfieldEstimate('clip', { seconds: 5 });
  await refreshHiggsfieldEstimate('motion', { seconds: 5 });
  vi.clearAllMocks();
});

describe('motion clips with Higgsfield', () => {
  it('an approved run makes the motion scene from its picture and the recorded clip, paid once', async () => {
    const { brand, project, dir } = setup();
    backend.higgsfield_run = (a) => ({ ok: true, status: 'done', path: a.outPath });
    const result = await executeMediaStep(clips(project, brand));
    const motion = runs().find((r) => r.job.model === 'm/motion')!;
    expect(motion).toMatchObject({ outPath: `${dir}/clips/v1-s1.mp4`, job: { imagePath: 'b/p/scenes/v1-s1.png', motionPath: 'b/p/motion/s1-v1.mp4' } });
    expect((result.artifacts[0].data as any).clips.find((c: any) => c.sceneId === 's1')).toMatchObject({ status: 'done', motion: true, costUsd: 0.6 });
    expect(monthSpendUsd()).toBeCloseTo(1.0, 6);
  });

  it('a preset goes by its id', async () => {
    const { brand, project } = setup();
    setSceneMotion(project.id, 's1', { source: 'preset', presetId: 'wave-01' });
    backend.higgsfield_run = (a) => ({ ok: true, status: 'done', path: a.outPath });
    await executeMediaStep(clips(getProject(project.id)!, brand));
    expect(runs().find((r) => r.job.model === 'm/motion')!.job).toMatchObject({ presetId: 'wave-01' });
  });

  it('when Higgsfield refuses the motion, the scene gets its normal clip, with the reason', async () => {
    const { brand, project } = setup();
    setVideoSettings(project.id, { aiClips: 'every' });
    backend.higgsfield_run = (a) => (a.job.model === 'm/motion' ? { ok: false, status: 'failed', reason: 'Higgsfield refused it as not safe for work (not charged).' } : { ok: true, status: 'done', path: a.outPath });
    const result = await executeMediaStep(clips(getProject(project.id)!, brand));
    const s1 = (result.artifacts[0].data as any).clips.find((c: any) => c.sceneId === 's1');
    expect(s1).toMatchObject({ status: 'done', motion: false });
    expect(s1.reason).toContain("The motion couldn't be made (Higgsfield refused it as not safe for work (not charged).); a normal clip was made.");
  });

  it('without the approval no motion is sent', async () => {
    const { brand, project } = setup({ clips: 'local' });
    const result = await executeMediaStep(clips(project, brand, ['write_own_work']));
    expect(runs()).toHaveLength(0);
    expect(JSON.stringify(result.artifacts[0].data)).toContain("Motion clips weren't approved for this run");
  });

  it('the clips step asks once, with the motion clips in its cost and its wait', () => {
    const { brand, project } = setup({ clips: 'local' });
    const step = contentProjectPlanSteps(project, brand, 'research', { clipEngine: 'local' }).find((s) => s.contentStep?.step === 'clips')!;
    expect(step.effects).toContain('spend');
    expect(step.costEstimateUsd).toBeCloseTo(0.6, 6);
    expect(step.waitFor).toBe(`${clipsWaitPaid('Higgsfield')}${motionIncluded(1)}`);
    expect(motionIncluded(1)).toBe(' Includes 1 motion clip.');
  });

  it('the preset list comes from Higgsfield when it offers one', async () => {
    backend.higgsfield_presets = () => ({ ok: true, presets: [{ id: 'm1', name: 'Wave' }] });
    expect(await listHiggsfieldPresets()).toEqual({ ok: true, presets: [{ id: 'm1', name: 'Wave' }] });
  });

  it("a mini Short's part with a motion is made the same way, and the Shorts step asks with its cost", async () => {
    const { brand, project, dir } = setup({});
    saveStepVersion(project.id, 'shorts', { output: { miya: { shorts: [{ id: 'sh1', kind: 'mini', title: 'T', hook: 'h', seconds: 30, platforms: [], copy: [], parts: [{ spoken: 'Hi', imagePrompt: 'x' }, { spoken: 'Bye', imagePrompt: 'y' }] }] } }, summary: '', joseCommandId: null });
    setShortPartMotion(project.id, 'sh1', 0, { source: 'preset', presetId: 'nod' });
    const plan = contentProjectPlanSteps({ ...getProject(project.id)!, brief: { ...getProject(project.id)!.brief, outputs: ['1 Short'] } }, brand).find((s) => s.contentStep?.step === 'shorts')!;
    expect(plan.effects).toContain('spend');
    expect(plan.costEstimateUsd).toBeCloseTo(0.6, 6);
    expect(plan.waitFor).toBe(SHORTS_MOTION_WAIT(1, 0.6));
    expect(SHORTS_MOTION_WAIT(1, 0.6)).toBe('Make 1 Higgsfield motion clip for the Shorts, about $0.60.');
    backend.save_image_to_folder = () => ({ path: 'x' });
    backend.content_tts_kokoro = (a) => ({ ok: true, full: { durationSec: 6 }, files: a.request.lines.map((l: any, i: number) => ({ id: l.id, path: 'x', durationSec: 3, startSec: i * 3 })) });
    backend.media_tools_status = () => ({ whisper: false });
    backend.content_assemble_video = (a) => ({ ok: true, outputs: [{ aspect: '9x16', path: `${a.spec.outputStem}.mp4`, durationSec: 6, frames: [] }] });
    backend.higgsfield_run = (a) => ({ ok: true, status: 'done', path: a.outPath });
    await makeShorts(project.id, { outputFolder: 'D:\\Content' }, undefined, { runwayApproved: true });
    const motion = runs().find((r) => r.job.model === 'm/motion')!;
    expect(motion).toMatchObject({ outPath: `${dir}/shorts/sh1/clips/v1-p1.mp4`, job: { presetId: 'nod', imagePath: `${dir}/shorts/sh1/v1-p1.png` } });
    expect(runs()).toHaveLength(1);
  });
});
