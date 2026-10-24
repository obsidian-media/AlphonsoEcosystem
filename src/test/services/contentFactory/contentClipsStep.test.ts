import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => ({})) }));
vi.mock('../../../lib/ollama', () => ({ generateAgentLlmResponse: vi.fn(), freeOllamaGpuMemory: vi.fn(async () => ({})) }));
vi.mock('../../../services/videoModelService', () => ({
  listVideoModels: vi.fn(async () => (globalThis as any).__videoModels),
  effectiveVideoModel: (info: any) => info.models.find((m: any) => m.id === info.suggested) || null,
  // A card with 8 GB or more (phase 3d): clips at full size and length.
  clipSizeFor: () => ({ lowRes: false, maxSeconds: Infinity }),
}));
vi.mock('../../../services/contentFactory/comfyVideoClip', () => ({ makeComfyClip: vi.fn(), checkComfyClip: vi.fn() }));
vi.mock('../../../services/contentFactory/runwayClip', async () => {
  const actual = await vi.importActual<any>('../../../services/contentFactory/runwayClip');
  return { ...actual, runwayClipAvailable: vi.fn(() => (globalThis as any).__runway), makeRunwayClip: vi.fn() };
});

import { checkComfyClip, makeComfyClip } from '../../../services/contentFactory/comfyVideoClip';
import { makeRunwayClip } from '../../../services/contentFactory/runwayClip';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import {
  createProject, emptyBrief, getProject, saveStepVersion, setMainMoment, setVersionOutputField, setVideoSettings,
} from '../../../services/contentFactory/contentProjectService';
import { checkPendingClips, executeMediaStep, MEDIA_ACTIONS, resolveProjectClipEngine } from '../../../services/contentFactory/contentMediaExecutor';
import { CLIPS_WAIT, CLIPS_WAIT_PAID, contentProjectPlanSteps } from '../../../services/contentFactory/contentProjectPlan';
import { getTemplate } from '../../../services/jose/joseTemplates';
import { checkPlan } from '../../../services/jose/stepGraph';
import { STEP_ORDER } from '../../../services/contentFactory/contentTypes';

const installed = { vramGb: 6, suggested: 'ltx_video_2b', comfyuiDir: 'D:\\ComfyUI', models: [{ id: 'ltx_video_2b', maxSeconds: 5, installed: true }] };
const notInstalled = { ...installed, models: [{ id: 'ltx_video_2b', maxSeconds: 5, installed: false }] };

function setup() {
  const brand = saveBrand({ name: 'My brand' });
  const project = createProject(brand.id, 'Launch', { ...emptyBrief(), idea: 'Why we wait' });
  const dir = `${brand.folderName}/${project.folderName}`;
  saveStepVersion(project.id, 'scenes', { output: { miya: { style: 'warm light', scenes: [
    { id: 's1', startSec: 0, endSec: 3, description: 'A barista pours coffee', movement: 'slow push in', mainMoment: true },
    { id: 's2', startSec: 3, endSec: 9, description: 'People smile', mainMoment: false },
    { id: 's3', startSec: 9, endSec: 23, description: 'Logo on a cup', mainMoment: true },
  ] } }, summary: '', joseCommandId: null });
  setVersionOutputField(project.id, 'scenes', 1, 'pictures', [
    { sceneId: 's1', status: 'done', relativePath: `${dir}/scenes/v1-s1.png` },
    { sceneId: 's2', status: 'done', relativePath: `${dir}/scenes/v1-s2.png` },
    { sceneId: 's3', status: 'done', relativePath: `${dir}/scenes/v1-s3.png` },
  ]);
  return { brand, project: getProject(project.id)!, dir };
}

const clipsAssignment = (project: any, brand: any, effects = ['write_own_work']) =>
  ({ agent: 'miya', actionType: 'creative_video_clips', effects, contentStep: { projectId: project.id, step: 'clips', brief: project.brief, brand, prior: {}, task: '' } }) as any;
const data = (r: any) => r.artifacts[0].data;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('alphonso_settings', JSON.stringify({ outputFolder: 'D:\\Content' }));
  (globalThis as any).__videoModels = installed;
  (globalThis as any).__runway = { ok: false, reason: 'Add a Runway key in Connectors.' };
  vi.mocked(makeComfyClip).mockReset().mockImplementation(async (i: any) => ({ status: 'done', path: i.outRel }));
  vi.mocked(makeRunwayClip).mockReset();
});

// Miya content factory phase 2b: the AI clips step.
describe('the clips step in the plan', () => {
  it('sits after Stock clips, before the finished video; 19 template steps (Publish 3a, Carousel 3c, Shorts 3d)', () => {
    expect(STEP_ORDER.slice(STEP_ORDER.indexOf('broll'), STEP_ORDER.indexOf('assemble') + 1)).toEqual(['broll', 'clips', 'assemble']);
    const steps = getTemplate('content_video')!.steps;
    expect(steps).toHaveLength(19);
    const byId = Object.fromEntries(steps.map((s) => [s.stepId, s]));
    expect(byId.clips).toMatchObject({ agent: 'miya', actionType: 'creative_video_clips', needs: ['scenes', 'broll'] });
    expect(byId.assemble.needs).toEqual(['voice', 'music', 'broll', 'clips']);
    expect(MEDIA_ACTIONS.has('creative_video_clips')).toBe(true);
  });

  // Phase 3b: the Runway estimate travels with the step, so Telegram and the board show "(about $X.XX)".
  it('a Runway run carries its estimate when the scenes are known; none without a price', () => {
    const { brand, project } = setup();
    localStorage.setItem('alphonso_settings', JSON.stringify({ paidModels: { runwayPricePerSecondUsd: 0.05 } }));
    const paid = contentProjectPlanSteps(project, brand, 'research', { clipEngine: 'runway' });
    expect(paid.find((s) => s.stepId === 'clips')!.costEstimateUsd).toBeCloseTo(0.75);
    localStorage.setItem('alphonso_settings', JSON.stringify({ paidModels: {} }));
    expect(contentProjectPlanSteps(project, brand, 'research', { clipEngine: 'runway' }).find((s) => s.stepId === 'clips')!.costEstimateUsd).toBeUndefined();
    expect(contentProjectPlanSteps(project, brand, 'research', { clipEngine: 'local' }).find((s) => s.stepId === 'clips')!.costEstimateUsd).toBeUndefined();
  });

  it('waits for the main moments when AI clips are on; a Runway run also has the spend effect', () => {
    const { brand, project } = setup();
    const local = contentProjectPlanSteps(project, brand, 'research', { clipEngine: 'local' });
    expect(local.find((s) => s.stepId === 'clips')).toMatchObject({ waitFor: CLIPS_WAIT, effects: ['write_own_work'] });
    expect(CLIPS_WAIT).toBe('Check the main moments in Miya Studio first.');
    const paid = contentProjectPlanSteps(project, brand, 'research', { clipEngine: 'runway' });
    expect(paid.find((s) => s.stepId === 'clips')).toMatchObject({ waitFor: CLIPS_WAIT_PAID, effects: ['write_own_work', 'spend'] });
    expect(CLIPS_WAIT_PAID).toBe('Check the main moments and the Runway cost in Miya Studio first.');
    expect(checkPlan(paid, { taskTypes: true }).problems).toEqual([]);
    setVideoSettings(project.id, { aiClips: 'none' });
    const off = contentProjectPlanSteps(getProject(project.id)!, brand, 'research', { clipEngine: 'local' });
    expect(off.find((s) => s.stepId === 'clips')!.waitFor).toBeUndefined();
    expect(off.filter((s) => s.waitFor).map((s) => s.stepId)).toEqual(['scenes', 'publish']);
  });

  it('no stop when nothing can make clips on this computer (no video model, no Runway)', () => {
    const { brand, project } = setup();
    const steps = contentProjectPlanSteps(project, brand, 'research', { clipEngine: null });
    expect(steps.find((s) => s.stepId === 'clips')!.waitFor).toBeUndefined();
    expect(steps.filter((s) => s.waitFor).map((s) => s.stepId)).toEqual(['scenes', 'publish']);
  });

  it('older projects gain the clips step, not started', () => {
    const { project } = setup();
    const saved = JSON.parse(localStorage.getItem('alphonso_content_projects_v1')!);
    delete saved[0].steps.clips;
    localStorage.setItem('alphonso_content_projects_v1', JSON.stringify(saved));
    expect(getProject(project.id)!.steps.clips).toMatchObject({ status: 'not_started' });
  });
});

describe('resolveProjectClipEngine', () => {
  it('uses what this computer has', async () => {
    const { project } = setup();
    expect(await resolveProjectClipEngine(project)).toEqual({ engine: 'local', modelId: 'ltx_video_2b', maxSeconds: 5 });
    (globalThis as any).__videoModels = notInstalled;
    (globalThis as any).__runway = { ok: true };
    expect((await resolveProjectClipEngine(project)).engine).toBe('runway');
  });
});

describe('executeMediaStep: AI clips', () => {
  it('makes a local clip for each main moment as marked when the step runs, at most the model\'s length', async () => {
    const { brand, project, dir } = setup();
    setMainMoment(project.id, 's2', true); // changed after the plan was made (Review Focus 1)
    setMainMoment(project.id, 's3', false);
    const result = await executeMediaStep(clipsAssignment(project, brand));
    expect(result.resultState).toBe('completed');
    expect(vi.mocked(makeComfyClip).mock.calls.map((c) => (c[0] as any).imageRel)).toEqual([`${dir}/scenes/v1-s1.png`, `${dir}/scenes/v1-s2.png`]);
    expect(makeComfyClip).toHaveBeenCalledWith(expect.objectContaining({
      root: 'D:\\Content', outRel: `${dir}/clips/v1-s2.mp4`, seconds: 5, vertical: false, modelId: 'ltx_video_2b',
      prompt: expect.stringContaining('People smile'),
    }));
    expect(data(result)).toMatchObject({ engine: 'local', model: 'ltx_video_2b', clips: [
      { sceneId: 's1', status: 'done', path: `${dir}/clips/v1-s1.mp4`, seconds: 3 },
      { sceneId: 's2', status: 'done', path: `${dir}/clips/v1-s2.mp4`, seconds: 5 },
    ] });
  });

  it('a main moment with no picture is skipped and the others are still made (Review Focus 2)', async () => {
    const { brand, project } = setup();
    setVersionOutputField(project.id, 'scenes', 1, 'pictures', [{ sceneId: 's3', status: 'done', relativePath: 'x/v1-s3.png' }]);
    const result = await executeMediaStep(clipsAssignment(project, brand));
    expect(data(result).clips).toEqual([
      { sceneId: 's1', status: 'skipped', reason: 'This scene has no picture to start from.' },
      expect.objectContaining({ sceneId: 's3', status: 'done' }),
    ]);
  });

  it('ComfyUI down: every scene says why, the step is done with a note (Review Focus 4)', async () => {
    const { brand, project } = setup();
    vi.mocked(makeComfyClip).mockResolvedValue({ status: 'failed', error: 'ComfyUI is not reachable at http://127.0.0.1:8188' });
    const result = await executeMediaStep(clipsAssignment(project, brand));
    expect(result.resultState).toBe('completed');
    expect(data(result).clips.every((c: any) => c.status === 'failed' && /not reachable/.test(c.reason))).toBe(true);
    expect(data(result).note).toBe('No AI clip was made; those scenes use their stock clip or picture.');
  });

  it('Runway: made only when this run approved spending; the monthly limit stops the rest (Review Focus 3)', async () => {
    const { brand, project, dir } = setup();
    (globalThis as any).__videoModels = notInstalled;
    (globalThis as any).__runway = { ok: true };
    const unapproved = await executeMediaStep(clipsAssignment(project, brand));
    expect(data(unapproved).skipped).toBe('Runway clips were not approved for this run. Run AI clips again to approve the cost.');
    expect(makeRunwayClip).not.toHaveBeenCalled();

    vi.mocked(makeRunwayClip)
      .mockResolvedValueOnce({ status: 'done', path: `${dir}/clips/runway-1.mp4`, costUsd: 0.25 })
      .mockResolvedValueOnce({ status: 'failed', error: 'That would pass your monthly cap of $1.00 ($0.90 spent this month).' });
    setVideoSettings(project.id, { aiClips: 'every' });
    const result = await executeMediaStep(clipsAssignment(getProject(project.id)!, brand, ['write_own_work', 'spend']));
    expect(makeRunwayClip).toHaveBeenCalledTimes(2);
    expect(makeRunwayClip).toHaveBeenCalledWith(expect.objectContaining({ outDirRel: `${dir}/clips`, model: 'gen4_turbo', seconds: 3 }));
    expect(data(result).clips).toEqual([
      { sceneId: 's1', status: 'done', path: `${dir}/clips/runway-1.mp4`, seconds: 3, costUsd: 0.25 },
      { sceneId: 's2', status: 'failed', reason: 'That would pass your monthly cap of $1.00 ($0.90 spent this month).' },
      { sceneId: 's3', status: 'skipped', reason: 'That would pass your monthly cap of $1.00 ($0.90 spent this month).' },
    ]);
    expect(data(result).totalUsd).toBeCloseTo(0.25);
  });

  it('a Runway scene longer than 10 s gets a 10 s clip (Review Focus 5)', async () => {
    const { brand, project } = setup();
    (globalThis as any).__videoModels = notInstalled;
    (globalThis as any).__runway = { ok: true };
    vi.mocked(makeRunwayClip).mockImplementation(async () => ({ status: 'done', path: 'p.mp4', costUsd: 0.5 }));
    const result = await executeMediaStep(clipsAssignment(project, brand, ['write_own_work', 'spend']));
    expect(data(result).clips.find((c: any) => c.sceneId === 's3').seconds).toBe(10);
  });

  it('off, or nothing to make clips with: skipped with the reason', async () => {
    const { brand, project } = setup();
    setVideoSettings(project.id, { aiClips: 'none' });
    expect(data(await executeMediaStep(clipsAssignment(getProject(project.id)!, brand))).skipped).toBe('AI clips are off for this project.');
    setVideoSettings(project.id, { aiClips: 'main' });
    (globalThis as any).__videoModels = notInstalled;
    expect(data(await executeMediaStep(clipsAssignment(getProject(project.id)!, brand))).skipped)
      .toBe('Install a video model in Runtime Hub (ComfyUI), or add a Runway key in Connectors.');
  });
});

describe('checkPendingClips', () => {
  it('a clip ComfyUI finished later is saved into the step; one still running stays pending', async () => {
    const { brand, project, dir } = setup();
    vi.mocked(makeComfyClip).mockResolvedValue({ status: 'pending', jobId: 'job-1' });
    const result = await executeMediaStep(clipsAssignment(project, brand));
    expect(data(result).clips[0]).toMatchObject({ sceneId: 's1', status: 'pending', jobId: 'job-1', target: `${dir}/clips/v1-s1.mp4` });
    saveStepVersion(project.id, 'clips', { output: { miya: data(result) }, summary: '', joseCommandId: null });
    vi.mocked(checkComfyClip).mockResolvedValueOnce({ status: 'done', path: `${dir}/clips/v1-s1.mp4` }).mockResolvedValueOnce({ status: 'pending', jobId: 'job-1' });
    const clips = await checkPendingClips(project.id);
    expect(checkComfyClip).toHaveBeenCalledWith('job-1', `${dir}/clips/v1-s1.mp4`, 'D:\\Content');
    expect(clips[0]).toMatchObject({ sceneId: 's1', status: 'done', path: `${dir}/clips/v1-s1.mp4`, seconds: 3 });
    expect(clips[1]).toMatchObject({ status: 'pending' });
    const saved = (getProject(project.id)!.steps.clips.versions[0].output as any).miya.clips;
    expect(saved[0].status).toBe('done');
  });
});
