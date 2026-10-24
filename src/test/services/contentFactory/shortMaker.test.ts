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
const makeRunwayClip = vi.fn();
vi.mock('../../../services/contentFactory/runwayClip', () => ({ makeRunwayClip: (...a: unknown[]) => makeRunwayClip(...a) }));
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

import { makeShorts, redoShort, shortsSummary, NEEDS_FINISHED_VIDEO } from '../../../services/contentFactory/shortMaker';
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
  [invoke, generateComfyUiImage, makeComfyClip, makeRunwayClip].forEach((f) => f.mockReset());
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

  // Phase 4c: a mini Short's pictures show the brand's character.
  it("a mini Short's pictures show the brand's main character", async () => {
    const { addCharacter, updateCharacter } = await import('../../../services/contentFactory/contentCharacters');
    const { listBrands } = await import('../../../services/contentFactory/contentBrandService');
    const p = setup([mini]);
    const brand = listBrands()[0];
    const c = addCharacter(brand.id, { name: 'Ana', kind: 'made_up', description: 'a teacher with red glasses' });
    updateCharacter(brand.id, c.id, { pictures: ['a', 'b', 'c', 'd', 'e'] });
    await makeShorts(p.id, settings);
    expect(generateComfyUiImage.mock.calls[0][0].prompt).toContain('a teacher with red glasses');
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
    const base = invoke.getMockImplementation()!;
    let thrown = false;
    invoke.mockImplementation(async (cmd: string, args: unknown) => {
      if (cmd === 'content_tts_kokoro' && !thrown) { thrown = true; throw new Error('Kokoro is not installed'); }
      return base(cmd, args as never);
    });
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

it('a mini Short with no script says how to give it one', async () => {
  const p = setup([{ ...cut, kind: 'mini', parts: undefined }]);
  const [out] = await makeShorts(p.id, settings);
  expect(out).toMatchObject({ status: 'failed', reason: expect.stringContaining('needs its own script') });
  expect(generateComfyUiImage).not.toHaveBeenCalled();
});

it('a highlight or cut with no part chosen (switched from a mini Short) uses the middle of the finished video', async () => {
  const p = setup([{ ...mini, kind: 'cut', seconds: 40 }]);
  const [out] = await makeShorts(p.id, settings);
  expect(out.status).toBe('done');
  expect(calls('content_cut_short')[0].spec).toMatchObject({ startSec: 40, endSec: 80 });
});

it("a Short's hook text and captions use the brand font", async () => {
  const p = setup([highlight, mini]);
  const { saveBrand: save, getBrand } = await import('../../../services/contentFactory/contentBrandService');
  save({ ...getBrand(p.brandId)!, fonts: 'Montserrat, Inter' });
  const base = invoke.getMockImplementation()!;
  invoke.mockImplementation(async (cmd: string, args: { spec?: { outPath?: string } }) => (cmd === 'content_cut_short'
    ? { ok: true, path: args.spec?.outPath, durationSec: 40, frames: [], fontNote: "The brand font Montserrat isn't installed" }
    : base(cmd, args)));
  const [first] = await makeShorts(p.id, settings);
  expect(first.note).toContain("isn't installed");
  expect(calls('content_cut_short')[0].spec.font).toBe('Montserrat');
  expect(calls('content_assemble_video')[0].spec.font).toBe('Montserrat');
});

it('approved Runway Shorts make Runway clips for the hook and the ending', async () => {
  const p = setup([{ ...mini, parts: [...mini.parts, { spoken: 'Three.', imagePrompt: 'c', seconds: 10 }] }]);
  setShortsSettings(p.id, { aiClips: 'main', clipEngine: 'runway' });
  makeRunwayClip.mockResolvedValue({ status: 'done', path: 'rw.mp4', costUsd: 0.5 });
  await makeShorts(p.id, settings, undefined, { runwayApproved: true });
  expect(makeRunwayClip).toHaveBeenCalledTimes(2);
  expect(makeRunwayClip.mock.calls[0][0]).toMatchObject({ vertical: true, outDirRel: 'acme/launch/shorts/sh1/clips' });
  const scenes = calls('content_assemble_video')[0].spec.scenes;
  expect(scenes[0]).toMatchObject({ aiClip: 'rw.mp4' });
  expect(scenes[1].aiClip).toBeUndefined();
  expect(scenes[2]).toMatchObject({ aiClip: 'rw.mp4' });
});

it('Runway Shorts that were not approved use pictures and say so', async () => {
  const p = setup([mini]);
  setShortsSettings(p.id, { aiClips: 'main', clipEngine: 'runway' });
  const [out] = await makeShorts(p.id, settings);
  expect(makeRunwayClip).not.toHaveBeenCalled();
  expect(out.note).toContain('not approved');
});

describe('redoShort', () => {
  it('makes that Short again as a new version file', async () => {
    const p = setup([cut]);
    await makeShorts(p.id, settings);
    const again = await redoShort(p.id, 'sh3', settings);
    expect(again).toMatchObject({ status: 'done', path: 'acme/launch/shorts/sh3/v2.mp4' });
    expect(made(p.id).sh3).toMatchObject({ fileVersion: 2 });
  });

  it('Redo waits for the Short being made, then runs', async () => {
    const p = setup([cut, highlight]);
    const base = invoke.getMockImplementation()!;
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => { release = r; });
    const order: string[] = [];
    invoke.mockImplementation(async (cmd: string, args: { spec?: { outPath?: string } }) => {
      if (cmd === 'content_cut_short') {
        order.push(`start ${args.spec?.outPath}`);
        if (order.length === 1) await held;
        order.push(`end ${args.spec?.outPath}`);
      }
      return base(cmd, args);
    });
    const first = makeShorts(p.id, settings);
    const again = redoShort(p.id, 'sh3', settings);
    await new Promise((r) => setTimeout(r, 0));
    release();
    const [outs, redo] = await Promise.all([first, again]);
    expect(outs.map((o) => o.status)).toEqual(['done', 'done']);
    expect(redo).toMatchObject({ status: 'done', path: 'acme/launch/shorts/sh3/v2.mp4' });
    // Never two cuts at once.
    for (let i = 0; i < order.length; i += 2) {
      expect(order[i].startsWith('start')).toBe(true);
      expect(order[i + 1].startsWith('end')).toBe(true);
    }
  });
});

describe('shortsSummary', () => {
  it('the Shorts step says how many failed', () => {
    const d = { shortId: 'a', status: 'done' } as const;
    const f = { shortId: 'b', status: 'failed' } as const;
    expect(shortsSummary([d, f, d])).toBe('done, 1 of 3 failed');
    expect(shortsSummary([d, d])).toBe('done');
    expect(shortsSummary([])).toBe('done');
  });
});

