// Phase 4b: the Voice step with an ElevenLabs voice, and captions from ElevenLabs' timings.
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

import { invoke } from '@tauri-apps/api/core';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { createProject, emptyBrief, getProject, saveStepVersion } from '../../../services/contentFactory/contentProjectService';
import { executeMediaStep } from '../../../services/contentFactory/contentMediaExecutor';
import { contentProjectPlanSteps, VOICE_WAIT_PAID } from '../../../services/contentFactory/contentProjectPlan';
import { monthSpendUsd } from '../../../services/jose/joseSpend';
import { checkPlan } from '../../../services/jose/stepGraph';

const SCRIPT = { hooks: ['a', 'b', 'c'], chosenHook: 0, title: 'T', script: [
  { startSec: 0, endSec: 3, spoken: 'Hello there.' },
  { startSec: 3, endSec: 6, spoken: 'Second part.' },
] };
const SCENES = { style: 'warm', scenes: [
  { id: 's1', startSec: 0, endSec: 3, description: 'x', imagePrompt: 'x' },
  { id: 's2', startSec: 3, endSec: 6, description: 'y', imagePrompt: 'y' },
] };

function setup() {
  const brand = saveBrand({ name: 'My brand', voice: { engine: 'kokoro', voiceId: 'af_heart' }, engines: { voice: { engine: 'elevenlabs', voiceId: 'v2', modelId: 'm1' } } } as any);
  const project = createProject(brand.id, 'Launch', { ...emptyBrief(), idea: 'Why we wait' });
  saveStepVersion(project.id, 'script', { output: { miya: SCRIPT }, summary: '', joseCommandId: null });
  saveStepVersion(project.id, 'scenes', { output: { miya: SCENES }, summary: '', joseCommandId: null });
  return { brand, project: getProject(project.id)!, dir: `${brand.folderName}/${project.folderName}` };
}
const voice = (project: any, brand: any, effects: string[] = ['write_own_work', 'spend']) =>
  ({ agent: 'miya', actionType: 'creative_voice', effects, contentStep: { projectId: project.id, step: 'voice', brief: project.brief, brand, prior: {}, task: '' } }) as any;
const spoken = { ok: true, full: { durationSec: 5 }, files: [{ id: 's1', path: 's1.wav', durationSec: 2.5, startSec: 0 }, { id: 's2', path: 's2.wav', durationSec: 2.5, startSec: 2.5 }],
  words: [{ word: 'Hello', start: 0.1, end: 0.5 }, { word: 'there.', start: 0.5, end: 1 }, { word: 'Second', start: 2.6, end: 3 }, { word: 'part.', start: 3, end: 3.4 }] };
const kokoro = () => ({ ok: true, full: { durationSec: 5 }, files: [{ id: 's1', path: 'p', durationSec: 2.5, startSec: 0 }, { id: 's2', path: 'p', durationSec: 2.5, startSec: 2.5 }] });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('alphonso_settings', JSON.stringify({ outputFolder: 'D:\\Content', zeroCostMode: false, paidModels: { elevenLabsPricePer1kCharsUsd: 0.3 } }));
  for (const k of Object.keys(backend)) delete backend[k];
  for (const k of Object.keys(creds)) delete creds[k];
  creds.ELEVENLABS_API_KEY = 'k';
  vi.clearAllMocks();
});

describe('Voice with ElevenLabs', () => {
  it("reads with the brand's ElevenLabs voice when the run was approved, and records the cost", async () => {
    const { brand, project, dir } = setup();
    backend.elevenlabs_speak = () => spoken;
    const result = await executeMediaStep(voice(project, brand));
    expect(result.resultState).toBe('completed');
    expect(invoke).toHaveBeenCalledWith('elevenlabs_speak', { request: expect.objectContaining({
      workspaceRoot: 'D:\\Content', outDir: `${dir}/audio/voice-v1`, voiceId: 'v2', modelId: 'm1', key: 'k',
      lines: [{ id: 's1', text: 'Hello there.' }, { id: 's2', text: 'Second part.' }],
    }) });
    expect(result.artifacts[0].data).toMatchObject({ engine: 'elevenlabs', words: spoken.words, durationSec: 5 });
    expect(monthSpendUsd()).toBeCloseTo(24 / 1000 * 0.3, 6);
  });

  it('not approved for this run: Kokoro, with the note', async () => {
    const { brand, project } = setup();
    backend.content_tts_kokoro = kokoro;
    const result = await executeMediaStep(voice(project, brand, ['write_own_work']));
    expect(result.artifacts[0].data).toMatchObject({ note: "ElevenLabs wasn't approved for this run; read by Kokoro." });
  });

  it("a voice deleted from the account: Kokoro, with ElevenLabs' reason", async () => {
    const { brand, project } = setup();
    backend.elevenlabs_speak = () => ({ ok: false, reason: 'That ElevenLabs voice is no longer in your account.' });
    backend.content_tts_kokoro = kokoro;
    const result = await executeMediaStep(voice(project, brand));
    expect(result.resultState).toBe('completed');
    expect(result.artifacts[0].data).toMatchObject({ note: 'That ElevenLabs voice is no longer in your account; read by Kokoro.' });
  });

  it('captions use ElevenLabs\' timings, without Whisper', async () => {
    const { brand, project, dir } = setup();
    saveStepVersion(project.id, 'voice', { output: { miya: { full: `${dir}/audio/voice-v1/full.wav`, durationSec: 5, engine: 'elevenlabs', words: spoken.words, lines: [
      { sceneId: 's1', text: 'Hello there.', startSec: 0, endSec: 2.5, path: 'a' }, { sceneId: 's2', text: 'Second part.', startSec: 2.5, endSec: 5, path: 'b' },
    ] } }, summary: '', joseCommandId: null });
    const written: Record<string, string> = {};
    backend.media_tools_status = () => ({ whisper: true });
    backend.write_workspace_text_file = (a) => { written[a.relativePath] = a.content; return { ok: true }; };
    backend.content_assemble_video = () => ({ ok: true, outputs: [] });
    const result = await executeMediaStep({ agent: 'alphonso', actionType: 'creative_assemble_video', contentStep: { projectId: project.id, step: 'assemble', brief: project.brief, brand, prior: {}, task: '' } } as any);
    expect(vi.mocked(invoke).mock.calls.some((c) => c[0] === 'content_whisper_words')).toBe(false);
    expect((result.artifacts[0].data as any).captions).toBe('elevenlabs');
    expect(written[`${dir}/output/v1.srt`]).toContain('00:00:00,100');
  });
});

describe('the Voice step asks once with the cost', () => {
  it('spends, with the estimate, and a full run stops there', () => {
    const { brand, project } = setup();
    const step = contentProjectPlanSteps(project, brand).find((s) => s.contentStep?.step === 'voice')!;
    expect(step.effects).toContain('spend');
    expect(step.costEstimateUsd).toBeCloseTo(24 / 1000 * 0.3, 6);
    expect(step.waitFor).toBe(VOICE_WAIT_PAID(step.costEstimateUsd!));
    expect(VOICE_WAIT_PAID(0.0072)).toBe('Read the voice-over with ElevenLabs, about $0.01.');
    const [only] = contentProjectPlanSteps(project, brand, 'voice', { only: true });
    expect(only.waitFor).toBeUndefined();
    expect(checkPlan([{ stepId: 'miya', agent: 'miya', actionType: 'creative_voice', effects: ['write_own_work', 'spend'], needs: [] }] as any).problems).toEqual([]);
  });

  it('with Kokoro the step neither spends nor stops', () => {
    const { brand, project } = setup();
    creds.ELEVENLABS_API_KEY = '';
    const step = contentProjectPlanSteps(project, brand).find((s) => s.contentStep?.step === 'voice')!;
    expect(step.effects).not.toContain('spend');
    expect(step.waitFor).toBeUndefined();
  });
});
