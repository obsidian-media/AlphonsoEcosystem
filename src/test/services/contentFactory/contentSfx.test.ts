// Phase 4b: sound effects from ElevenLabs — Miya picks at most one per scene, one approval per run.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const backend: Record<string, (args: any) => unknown> = {};
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    if (cmd === 'kv_set' || cmd === 'kv_get') return null;
    if (!backend[cmd]) throw new Error(`unexpected command ${cmd}`);
    return backend[cmd](args);
  }),
}));
const creds: Record<string, string> = {};
vi.mock('../../../services/connectors/connectorAuth', () => ({ getConnectorCredential: (_c: string, k: string) => creds[k] || '' }));
vi.mock('../../../lib/ollama', () => ({
  generateAgentLlmResponse: vi.fn(async () => ({ response: JSON.stringify({ effects: [
    { sceneId: 's1', text: 'a coffee pour', seconds: 2 },
    { sceneId: 's1', text: 'a second one for the same scene', seconds: 2 },
    { sceneId: 's2', text: 'a whoosh', seconds: 60 },
  ] }) })),
  freeOllamaGpuMemory: vi.fn(async () => ({ ok: true })),
}));

import { invoke } from '@tauri-apps/api/core';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { createProject, emptyBrief, getProject, saveStepVersion } from '../../../services/contentFactory/contentProjectService';
import { executeMediaStep, MEDIA_ACTIONS } from '../../../services/contentFactory/contentMediaExecutor';
import { contentProjectPlanSteps, SFX_WAIT_PAID } from '../../../services/contentFactory/contentProjectPlan';
import { parseStepAnswer } from '../../../services/contentFactory/contentStepPrompts';
import { STEP_ORDER } from '../../../services/contentFactory/contentTypes';
import { getTemplate } from '../../../services/jose/joseTemplates';
import { monthSpendUsd } from '../../../services/jose/joseSpend';

const SCENES = { style: 'warm', scenes: [
  { id: 's1', startSec: 0, endSec: 3, description: 'A pour', imagePrompt: 'x' },
  { id: 's2', startSec: 3, endSec: 6, description: 'A smile', imagePrompt: 'y' },
] };
function setup(soundEffects = true) {
  const brand = saveBrand({ name: 'B', engines: { soundEffects } } as any);
  const p = createProject(brand.id, 'L', { ...emptyBrief(), idea: 'x' });
  saveStepVersion(p.id, 'scenes', { output: { miya: SCENES }, summary: '', joseCommandId: null });
  saveStepVersion(p.id, 'voice', { output: { miya: { full: 'f.wav', durationSec: 6, lines: [
    { sceneId: 's1', text: 'a', startSec: 0, endSec: 3, path: 'a' }, { sceneId: 's2', text: 'b', startSec: 3.2, endSec: 6, path: 'b' },
  ] } }, summary: '', joseCommandId: null });
  return { brand, project: getProject(p.id)!, dir: `${brand.folderName}/${p.folderName}` };
}
const sfx = (project: any, brand: any, effects = ['write_own_work', 'spend']) =>
  ({ agent: 'miya', actionType: 'creative_sfx', effects, contentStep: { projectId: project.id, step: 'sfx', brief: project.brief, brand, prior: {}, task: '' } }) as any;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('alphonso_settings', JSON.stringify({ outputFolder: 'D:\\Content', zeroCostMode: false, paidModels: { elevenLabsPricePer1kCharsUsd: 0.3, elevenLabsPricePerEffectUsd: 0.02 } }));
  for (const k of Object.keys(backend)) delete backend[k];
  for (const k of Object.keys(creds)) delete creds[k];
  creds.ELEVENLABS_API_KEY = 'k';
  vi.clearAllMocks();
});

describe('the Sound effects step', () => {
  it('sits after Music; the template has 20 steps and Assemble needs it', () => {
    expect(STEP_ORDER.indexOf('sfx')).toBe(STEP_ORDER.indexOf('music') + 1);
    const t = getTemplate('content_video')!;
    expect(t.steps).toHaveLength(20);
    expect(t.steps.find((s) => s.stepId === 'assemble')!.needs).toContain('sfx');
    expect(MEDIA_ACTIONS.has('creative_sfx')).toBe(true);
  });

  it("Miya's effects are kept to one per scene and 0.5–30 s", () => {
    const parsed = parseStepAnswer('creative_sfx', JSON.stringify({ effects: [
      { sceneId: 's1', text: 'a', seconds: 2 }, { sceneId: 's1', text: 'b', seconds: 2 }, { sceneId: 's2', text: 'c', seconds: 60 }, { sceneId: 's3', text: '', seconds: 1 },
    ] }));
    expect(parsed).toEqual({ effects: [{ sceneId: 's1', text: 'a', seconds: 2 }, { sceneId: 's2', text: 'c', seconds: 30 }] });
  });

  it('approved, each effect is made at its scene and the cost recorded per effect', async () => {
    const { brand, project, dir } = setup();
    backend.elevenlabs_sound = (a) => ({ ok: true, path: a.request.outPath });
    const result = await executeMediaStep(sfx(project, brand));
    expect(result.resultState).toBe('completed');
    const sounds = vi.mocked(invoke).mock.calls.filter((c) => c[0] === 'elevenlabs_sound').map((c) => (c[1] as any).request);
    expect(sounds.map((r) => [r.outPath, r.seconds])).toEqual([[`${dir}/audio/sfx-v1-s1.wav`, 2], [`${dir}/audio/sfx-v1-s2.wav`, 30]]);
    expect((result.artifacts[0].data as any).effects).toMatchObject([
      { sceneId: 's1', status: 'done', path: `${dir}/audio/sfx-v1-s1.wav`, atSec: 0 },
      { sceneId: 's2', status: 'done', path: `${dir}/audio/sfx-v1-s2.wav`, atSec: 3.2 },
    ]);
    expect(monthSpendUsd()).toBeCloseTo(0.04, 6);
  });

  it('off for the brand, not approved, or without ElevenLabs: skipped with the reason', async () => {
    const off = setup(false);
    expect((await executeMediaStep(sfx(off.project, off.brand))).artifacts[0].data).toEqual({ skipped: 'Sound effects are off for this brand (Brands tab).' });
    const on = setup(true);
    expect((await executeMediaStep(sfx(on.project, on.brand, ['write_own_work']))).artifacts[0].data).toEqual({ skipped: "Sound effects weren't approved for this run." });
    creds.ELEVENLABS_API_KEY = '';
    expect((await executeMediaStep(sfx(on.project, on.brand))).artifacts[0].data).toEqual({ skipped: "ElevenLabs isn't set up; no sound effects." });
  });

  it('the step asks once with the most it could cost', () => {
    const { brand, project } = setup();
    const step = contentProjectPlanSteps(project, brand).find((s) => s.contentStep?.step === 'sfx')!;
    expect(step.effects).toContain('spend');
    expect(step.waitFor).toBe(SFX_WAIT_PAID(2, 0.04));
    expect(SFX_WAIT_PAID(2, 0.04)).toBe('Make up to 2 sound effects, about $0.04 at most.');
    const off = setup(false);
    expect(contentProjectPlanSteps(off.project, off.brand).find((s) => s.contentStep?.step === 'sfx')!.effects).not.toContain('spend');
  });

  it('Assemble mixes the effects that were made', async () => {
    const { brand, project, dir } = setup();
    saveStepVersion(project.id, 'sfx', { output: { miya: { effects: [
      { sceneId: 's1', status: 'done', path: `${dir}/audio/sfx-v1-s1.wav`, atSec: 0 }, { sceneId: 's2', status: 'failed', reason: 'x' },
    ] } }, summary: '', joseCommandId: null });
    backend.media_tools_status = () => ({ whisper: false });
    backend.write_workspace_text_file = () => ({ ok: true });
    backend.content_assemble_video = () => ({ ok: true, outputs: [] });
    await executeMediaStep({ agent: 'alphonso', actionType: 'runtime_assemble_video', contentStep: { projectId: project.id, step: 'assemble', brief: project.brief, brand, prior: {}, task: '' } } as any);
    const spec = (vi.mocked(invoke).mock.calls.find((c) => c[0] === 'content_assemble_video')![1] as any).spec;
    expect(spec.sfx).toEqual([{ path: `${dir}/audio/sfx-v1-s1.wav`, atSec: 0 }]);
  });
});
