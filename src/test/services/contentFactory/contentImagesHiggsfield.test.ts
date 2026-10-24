// Phase 4b: Higgsfield pictures as an extra option — asked once with Higgsfield's estimate.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const backend: Record<string, (args: any) => unknown> = {};
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    if (cmd === 'kv_set' || cmd === 'kv_get' || cmd === 'save_image_to_folder' || cmd === 'write_workspace_text_file') return null;
    if (!backend[cmd]) throw new Error(`unexpected command ${cmd}`);
    return backend[cmd](args);
  }),
}));
const creds: Record<string, string> = {};
vi.mock('../../../services/connectors/connectorAuth', () => ({ getConnectorCredential: (_c: string, k: string) => creds[k] || '' }));
vi.mock('../../../services/connectors/connectorImageGenerators', () => ({
  generateComfyUiImage: vi.fn(async () => ({ ok: true, previewBase64: 'COMFY' })),
  checkComfyUiImage: vi.fn(),
  getComfyUiEndpoint: vi.fn(() => 'http://127.0.0.1:8188'),
}));
vi.mock('../../../services/contentFactory/contentProjectFiles', async () => {
  const actual = await vi.importActual<typeof import('../../../services/contentFactory/contentProjectFiles')>('../../../services/contentFactory/contentProjectFiles');
  return {
    ...actual,
    saveProjectImage: vi.fn(async (_r, _b, _p, sub, file) => `D:\\Content\\${sub}\\${file}`),
    writeProjectFile: vi.fn(async () => undefined),
    loadProjectImage: vi.fn(async () => 'data:image/png;base64,HFRAW'),
  };
});
vi.mock('../../../services/contentFactory/thumbnailRenderer', async () => {
  const actual = await vi.importActual<typeof import('../../../services/contentFactory/thumbnailRenderer')>('../../../services/contentFactory/thumbnailRenderer');
  return { ...actual, drawHeadline: vi.fn(async () => 'DRAWN'), drawSlide: vi.fn(async () => 'SLIDE') };
});
vi.mock('../../../services/miyaMemoryService', () => ({ listMiyaMemory: vi.fn(() => []) }));

import { invoke } from '@tauri-apps/api/core';
import { generateComfyUiImage } from '../../../services/connectors/connectorImageGenerators';
import { drawHeadline } from '../../../services/contentFactory/thumbnailRenderer';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { createProject, emptyBrief, getProject, saveStepVersion, chosenVersionOf } from '../../../services/contentFactory/contentProjectService';
import { renderScenePictures, renderThumbnails, checkPendingPictures } from '../../../services/contentFactory/contentImages';
import { contentProjectPlanSteps, REVIEW_WAIT, PICTURES_WAIT_PAID } from '../../../services/contentFactory/contentProjectPlan';
import { refreshHiggsfieldEstimate } from '../../../services/connectors/higgsfieldConnector';
import { resolvePictures } from '../../../services/contentFactory/engineChoice';
import { checkPlan } from '../../../services/jose/stepGraph';
import { monthSpendUsd } from '../../../services/jose/joseSpend';

const settings = { outputFolder: 'D:\\Content' };
const SCENES = { miya: { style: 'warm film', scenes: [
  { id: 's1', imagePrompt: 'a clock', negativePrompt: '', description: 'd' },
  { id: 's2', imagePrompt: 'a desk', negativePrompt: '', description: 'd' },
] } };
const THUMBS = { miya: { concepts: [{ id: 't1', headline: 'Why we wait', imagePrompt: 'a queue', layout: 'left' }] } };

function projectWith(step: 'scenes' | 'thumbnail', output: unknown, engines: Record<string, unknown> = { pictures: 'higgsfield' }) {
  const brand = saveBrand({ name: 'B', visualStyle: 'cinematic', characterRefs: 'two llamas', engines } as any);
  const p = createProject(brand.id, 'P', { ...emptyBrief(), idea: 'x', lengthSec: 30 } as any);
  saveStepVersion(p.id, step, { output, summary: '', joseCommandId: null });
  return { brand, project: getProject(p.id)!, dir: `${brand.folderName}/${p.folderName}` };
}

beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem('alphonso_settings', JSON.stringify({ outputFolder: 'D:\\Content', zeroCostMode: false }));
  for (const k of Object.keys(backend)) delete backend[k];
  for (const k of Object.keys(creds)) delete creds[k];
  Object.assign(creds, { HIGGSFIELD_KEY_ID: 'id', HIGGSFIELD_KEY_SECRET: 'secret', HIGGSFIELD_PICTURE_MODEL: 'm/pic', HIGGSFIELD_PICTURE_EXTRA: '{"quality":"high"}' });
  vi.clearAllMocks();
  backend.higgsfield_estimate = () => ({ ok: true, usd: 0.05 });
  await refreshHiggsfieldEstimate('picture');
});

describe('Higgsfield pictures', () => {
  it("approved, scene pictures come from Higgsfield with the brand's look, and each is paid for", async () => {
    const { project, dir } = projectWith('scenes', SCENES);
    backend.higgsfield_run = (a) => ({ ok: true, status: 'done', path: a.outPath, requestId: 'r' });
    const results = await renderScenePictures(project.id, settings, undefined, { paidApproved: true });
    expect(generateComfyUiImage).not.toHaveBeenCalled();
    const runs = vi.mocked(invoke).mock.calls.filter((c) => c[0] === 'higgsfield_run').map((c) => c[1] as any);
    expect(runs.map((r) => r.outPath)).toEqual([`${dir}/scenes/v1-s1.png`, `${dir}/scenes/v1-s2.png`]);
    expect(runs[0].job).toMatchObject({ model: 'm/pic', aspect: '16:9', extra: { quality: 'high' } });
    expect(runs[0].job.prompt).toContain('a clock');
    expect(runs[0].job.prompt).toContain('cinematic');
    expect(runs[0].keys).toEqual({ keyId: 'id', keySecret: 'secret' });
    expect(results.map((r) => [r.status, r.relativePath])).toEqual([['done', `${dir}/scenes/v1-s1.png`], ['done', `${dir}/scenes/v1-s2.png`]]);
    expect(monthSpendUsd()).toBeCloseTo(0.1, 6);
  });

  // Phase 4c (4b leftover): a picture Higgsfield couldn't make is remade with ComfyUI.
  it('a Higgsfield picture that fails is remade with ComfyUI and the note says why', async () => {
    const { project } = projectWith('scenes', { miya: { style: '', scenes: [SCENES.miya.scenes[0]] } });
    backend.higgsfield_run = () => ({ ok: false, status: 'failed', reason: 'Higgsfield refused it as not safe for work (not charged).' });
    const results = await renderScenePictures(project.id, settings, undefined, { paidApproved: true });
    expect(generateComfyUiImage).toHaveBeenCalledTimes(1);
    expect(results[0].status).toBe('done');
    expect((chosenVersionOf(getProject(project.id)!, 'scenes')!.output as any).pictureNote)
      .toContain("Higgsfield couldn't make picture 1 (Higgsfield refused it as not safe for work (not charged).); made with ComfyUI.");
    expect(monthSpendUsd()).toBe(0);
  });

  it('the headline is still drawn by Alphonso on the Higgsfield picture', async () => {
    const { project, dir } = projectWith('thumbnail', THUMBS);
    backend.higgsfield_run = (a) => ({ ok: true, status: 'done', path: a.outPath });
    const results = await renderThumbnails(project.id, settings, undefined, { paidApproved: true });
    const run = vi.mocked(invoke).mock.calls.find((c) => c[0] === 'higgsfield_run')![1] as any;
    expect(run.outPath).toBe(`${dir}/thumbnail/v1-t1-hf.png`);
    expect(run.job.prompt).toContain('no text');
    expect(drawHeadline).toHaveBeenCalledWith('HFRAW', 'Why we wait', expect.anything(), 'left');
    expect(results[0]).toMatchObject({ status: 'done', relativePath: `${dir}/thumbnail/v1-t1.png` });
  });

  it('not approved → ComfyUI with the note', async () => {
    const { project } = projectWith('scenes', SCENES);
    await renderScenePictures(project.id, settings);
    expect(generateComfyUiImage).toHaveBeenCalledTimes(2);
    expect((chosenVersionOf(getProject(project.id)!, 'scenes')!.output as any).pictureNote).toBe("Higgsfield wasn't approved for this run; made with ComfyUI.");
  });

  it('with Zero-Cost Mode on, ComfyUI makes them with the reason', async () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ outputFolder: 'D:\\Content', zeroCostMode: true }));
    const { project } = projectWith('scenes', SCENES);
    await renderScenePictures(project.id, settings, undefined, { paidApproved: true });
    expect(generateComfyUiImage).toHaveBeenCalledTimes(2);
    expect((chosenVersionOf(getProject(project.id)!, 'scenes')!.output as any).pictureNote).toBe('Higgsfield is off while Zero-Cost Mode is on; made with ComfyUI.');
  });

  it('a pending picture keeps its request id and Check again fetches it without a new run', async () => {
    const { project, dir } = projectWith('scenes', { miya: { style: '', scenes: [SCENES.miya.scenes[0]] } });
    backend.higgsfield_run = () => ({ ok: true, status: 'pending', requestId: 'req-7' });
    const first = await renderScenePictures(project.id, settings, undefined, { paidApproved: true });
    expect(first[0]).toMatchObject({ status: 'pending', requestId: 'req-7' });
    expect(monthSpendUsd()).toBe(0);
    backend.higgsfield_check = (a) => ({ ok: true, status: 'done', path: a.outPath, requestId: a.requestId });
    const later = await checkPendingPictures(project.id, 'scenes', settings);
    const check = vi.mocked(invoke).mock.calls.find((c) => c[0] === 'higgsfield_check')![1] as any;
    expect(check).toMatchObject({ requestId: 'req-7', outPath: `${dir}/scenes/v1-s1.png` });
    expect(vi.mocked(invoke).mock.calls.filter((c) => c[0] === 'higgsfield_run')).toHaveLength(1);
    expect(later[0]).toMatchObject({ status: 'done', relativePath: `${dir}/scenes/v1-s1.png` });
    expect(monthSpendUsd()).toBeCloseTo(0.05, 6);
  });

  it('the Scenes step asks once with the estimate for its pictures', () => {
    const { brand, project } = projectWith('scenes', SCENES);
    const steps = contentProjectPlanSteps(project, brand);
    const scenes = steps.find((s) => s.contentStep?.step === 'scenes')!;
    expect(scenes.effects).toContain('spend');
    expect(scenes.waitFor).toBe(`${REVIEW_WAIT} ${PICTURES_WAIT_PAID(6, 0.3)}`);
    expect(PICTURES_WAIT_PAID(6, 0.3)).toBe('Make up to 6 pictures with Higgsfield, about $0.30 at most.');
    expect(steps.find((s) => s.contentStep?.step === 'thumbnail')!.costEstimateUsd).toBeCloseTo(0.15, 6);
    expect(checkPlan(steps, { taskTypes: true }).problems).toEqual([]);
  });

  it('a failed estimate means no spending and ComfyUI, with Higgsfield\u2019s own error', async () => {
    backend.higgsfield_estimate = () => ({ ok: false, reason: "Higgsfield doesn't know that model id; check it in Settings → Connectors → Higgsfield." });
    await refreshHiggsfieldEstimate('picture');
    const { brand, project } = projectWith('scenes', SCENES);
    expect(resolvePictures(project, brand)).toEqual({ engine: 'comfyui', note: "Higgsfield doesn't know that model id; check it in Settings → Connectors → Higgsfield. Made with ComfyUI." });
    expect(contentProjectPlanSteps(project, brand).find((s) => s.contentStep?.step === 'scenes')!.effects).not.toContain('spend');
  });
});
