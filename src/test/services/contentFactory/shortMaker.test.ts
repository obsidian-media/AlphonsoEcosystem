// Phase 3d: making each Short — a mini-script, a highlight with its hook, or a cut.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const invoke = vi.fn();
const generateComfyUiImage = vi.fn();
const makeComfyClip = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock('../../../services/connectors/connectorImageGenerators', () => ({
  generateComfyUiImage: (...a: unknown[]) => generateComfyUiImage(...a),
  getComfyUiEndpoint: () => 'http://127.0.0.1:8188',
}));
vi.mock('../../../services/contentFactory/comfyVideoClip', () => ({ makeComfyClip: (...a: unknown[]) => makeComfyClip(...a) }));
vi.mock('../../../services/videoModelService', () => ({
  listVideoModels: vi.fn(async () => ({ vramGb: 12, smallCard: false, suggested: 'ltx_video_2b', comfyuiDir: 'C', models: [{ id: 'ltx_video_2b', maxSeconds: 5, installed: true }] })),
  effectiveVideoModel: (info: { models: unknown[] }) => info.models[0],
  clipSizeFor: () => ({ lowRes: false, maxSeconds: Infinity }),
}));
vi.mock('../../../services/contentFactory/contentProjectFiles', async () => {
  const actual = await vi.importActual<typeof import('../../../services/contentFactory/contentProjectFiles')>('../../../services/contentFactory/contentProjectFiles');
  return { ...actual, saveProjectImage: vi.fn(async (_r, _b, _p, sub, file) => `D:/Content/${sub}/${file}`), writeProjectFile: vi.fn(async () => undefined) };
});

import { makeShorts, redoShort, MAKING_ANOTHER, NEEDS_FINISHED_VIDEO } from '../../../services/contentFactory/shortMaker';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { createProject, emptyBrief, getProject, saveStepVersion, setShortsSettings } from '../../../services/contentFactory/contentProjectService';

const settings = { outputFolder: 'D:/Content' };
const mini = { id: 'sh1', kind: 'mini', title: 'T', hook: 'Hook', seconds: 30, platforms: ['youtube'], copy: [], parts: [
  { spoken: 'One.', imagePrompt: 'a', seconds: 10 }, { spoken: 'Two.', imagePrompt: 'b', seconds: 10 },
] };
const highlight = { id: 'sh2', kind: 'highlight', title: 'H', hook: 'Wait for it', seconds: 40, platforms: ['instagram'], copy: [], moment: { startSec: 10, endSec: 50 } };
const cut = { id: 'sh3', kind: 'cut', title: 'C', hook: '', seconds: 30, platforms: ['facebook'], copy: [], moment: { startSec: 60, endSec: 90 } };

function setup(shorts: unknown[], { video = true } = {}) {
  const brand = saveBrand({ name: 'Acme', palette: ['#112233', '#eeeeee'] });
  const p = createProject(brand.id, 'Launch', { ...emptyBrief(), idea: 'x' });
  if (video) saveStepVersion(p.id, 'assemble', { output: { miya: { outputs: [{ aspect: '9x16', path: 'acme/launch/output/v1-9x16.mp4', durationSec: 120 }] } }, summary: '', joseCommandId: null });
  saveStepVersion(p.id, 'shorts', { output: { miya: { shorts } }, summary: '', joseCommandId: null });
  return getProject(p.id)!;
}
const made = (id: string) => (getProject(id)!.steps.shorts.versions[0].output as { made?: Record<string, Record<string, unknown>> }).made || {};
const calls = (cmd: string) => invoke.mock.calls.filter((c) => c[0] === cmd).map((c) => c[1]);

beforeEach(() => {
  localStorage.clear();
  [invoke, generateComfyUiImage, makeComfyClip].forEach((f) => f.mockReset());
  generateComfyUiImage.mockResolvedValue({ ok: true, previewBase64: 'PIC' });
  invoke.mockImplementation(async (cmd: string, args: { request?: { lines?: { id: string }[] }; spec?: { outPath?: string; outDir?: string; outputStem?: string } }) => {
    if (cmd === 'content_tts_kokoro') {
      const lines = args.request?.lines || [];
      return { ok: true, full: { durationSec: lines.length * 4 }, files: lines.map((l, i) => ({ id: l.id, path: 'x', durationSec: 4, startSec: i * 4 })) };
    }
    if (cmd === 'media_tools_status') return { whisper: false };
    if (cmd === 'content_assemble_video') return { ok: true, outputs: [{ aspect: '9x16', path: `${args.spec?.outputStem}.mp4`, durationSec: 8, frames: ['f.jpg'] }] };
    if (cmd === 'content_cut_short') return { ok: true, path: args.spec?.outPath, durationSec: 40, frames: ['g.jpg'] };
    return { ok: true };
  });
});

describe('makeShorts', () => {
  it('a mini Short makes its pictures, voice and a 9:16 file in its own folder', async () => {
    const p = setup([mini]);
    const [out] = await makeShorts(p.id, settings);
    expect(generateComfyUiImage).toHaveBeenCalledTimes(2);
    expect(calls('content_tts_kokoro')[0]).toMatchObject({ request: { outDir: 'acme/launch/shorts/sh1/voice-v1', lines: [{ id: 'p1', text: 'One.' }, { id: 'p2', text: 'Two.' }] } });
    expect(calls('content_assemble_video')[0]).toMatchObject({ spec: { outDir: 'acme/launch/shorts/sh1', aspects: ['9x16'], outputStem: 'v1', voiceSeconds: 8,
      scenes: [{ picture: 'acme/launch/shorts/sh1/v1-p1.png', seconds: 4 }, { picture: 'acme/launch/shorts/sh1/v1-p2.png', seconds: 4 }] } });
    expect(out).toMatchObject({ shortId: 'sh1', status: 'done', path: 'acme/launch/shorts/sh1/v1.mp4', seconds: 8 });
    expect(made(p.id).sh1).toMatchObject({ status: 'done', fileVersion: 1 });
    expect(makeComfyClip).not.toHaveBeenCalled(); // the Shorts' AI clips start off
  });

  it("a mini Short's AI clips follow the Shorts' own setting", async () => {
    const p = setup([mini]);
    setShortsSettings(p.id, { aiClips: 'every', clipEngine: 'local' });
    makeComfyClip.mockResolvedValue({ status: 'done', path: 'clip.mp4' });
    await makeShorts(p.id, settings);
    expect(makeComfyClip).toHaveBeenCalledTimes(2);
    expect(calls('content_assemble_video')[0].spec.scenes[0]).toMatchObject({ aiClip: 'clip.mp4' });
  });

  it('a highlight speaks the hook and cuts the moment', async () => {
    const p = setup([highlight]);
    const [out] = await makeShorts(p.id, settings);
    expect(calls('content_tts_kokoro')[0]).toMatchObject({ request: { lines: [{ id: 'hook', text: 'Wait for it' }] } });
    expect(calls('content_cut_short')[0]).toMatchObject({ spec: {
      source: 'acme/launch/output/v1-9x16.mp4', sourceSeconds: 120, startSec: 10, endSec: 50, outPath: 'acme/launch/shorts/sh2/v1.mp4',
      hookVoice: 'acme/launch/shorts/sh2/hook-v1/full.wav', hookSeconds: 4, hookSrt: 'acme/launch/shorts/sh2/hook-v1.srt',
    } });
    expect(calls('write_workspace_text_file')[0]).toMatchObject({ relativePath: 'acme/launch/shorts/sh2/hook-v1.srt', content: expect.stringContaining('Wait for it') });
    expect(out).toMatchObject({ status: 'done', seconds: 40 });
  });

  it('a cut only cuts', async () => {
    const p = setup([cut]);
    await makeShorts(p.id, settings);
    expect(calls('content_tts_kokoro')).toHaveLength(0);
    expect(calls('content_cut_short')[0].spec).not.toHaveProperty('hookVoice');
  });

  it('one Short failing does not stop the others', async () => {
    const p = setup([highlight, cut]);
    invoke.mockImplementationOnce(async () => { throw new Error('Kokoro is not installed'); });
    const outs = await makeShorts(p.id, settings);
    expect(outs.map((o) => o.status)).toEqual(['failed', 'done']);
    expect(outs[0].reason).toContain('Kokoro');
  });

  it('no finished video: highlights and cuts say to make it first; mini Shorts still work', async () => {
    const p = setup([mini, highlight], { video: false });
    const outs = await makeShorts(p.id, settings);
    expect(outs.map((o) => o.status)).toEqual(['done', 'failed']);
    expect(outs[1].reason).toBe(NEEDS_FINISHED_VIDEO);
  });
});

describe('redoShort', () => {
  it('makes that Short again as a new version file', async () => {
    const p = setup([cut]);
    await makeShorts(p.id, settings);
    const again = await redoShort(p.id, 'sh3', settings);
    expect(again).toMatchObject({ status: 'done', path: 'acme/launch/shorts/sh3/v2.mp4' });
    expect(made(p.id).sh3).toMatchObject({ fileVersion: 2 });
  });

  it('Redo while another Short is being made is refused', async () => {
    const p = setup([cut, highlight]);
    let release: (v: unknown) => void = () => undefined;
    invoke.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const first = makeShorts(p.id, settings);
    expect(await redoShort(p.id, 'sh2', settings)).toEqual({ ok: false, reason: MAKING_ANOTHER });
    release({ ok: true, path: 'acme/launch/shorts/sh3/v1.mp4', durationSec: 30, frames: [] });
    await first;
  });
});
