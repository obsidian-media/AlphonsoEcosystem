import { describe, it, expect, beforeEach } from 'vitest';
import { chosenScenes, resolveClipEngine, NO_CLIP_ENGINE } from '../../../services/contentFactory/clipEngine';
import {
  createProject, emptyBrief, getProject, getVideoSettings, isStepStale, saveStepVersion, setMainMoment, setVideoSettings,
} from '../../../services/contentFactory/contentProjectService';
import { parseStepAnswer } from '../../../services/contentFactory/contentStepPrompts';

beforeEach(() => localStorage.clear());

const scenes = [
  { id: 's1', mainMoment: true }, { id: 's2', mainMoment: false }, { id: 's3' }, { id: 's4', mainMoment: true },
];

// Miya content factory phase 2b: AI clip settings and the main moments.
describe('video settings', () => {
  it('start as main moments, automatic engine, Gen-4 Turbo', () => {
    const p = createProject('b', 'P', emptyBrief());
    expect(getVideoSettings(p)).toEqual({ aiClips: 'main', clipEngine: null, runwayModel: 'gen4_turbo' });
  });

  it('are saved beside the brief, so nothing goes out of date', () => {
    const p = createProject('b', 'P', { ...emptyBrief(), idea: 'x' });
    saveStepVersion(p.id, 'script', { output: { miya: {} }, summary: '', joseCommandId: null });
    setVideoSettings(p.id, { aiClips: 'every', clipEngine: 'runway' });
    const saved = getProject(p.id)!;
    expect(getVideoSettings(saved)).toEqual({ aiClips: 'every', clipEngine: 'runway', runwayModel: 'gen4_turbo' });
    expect(saved.briefRevision).toBe(p.briefRevision);
    expect(isStepStale(saved, 'script')).toBe(false);
  });
});

describe('setMainMoment', () => {
  it("changes the chosen scene plan's mark without making later steps out of date", () => {
    const p = createProject('b', 'P', { ...emptyBrief(), idea: 'x' });
    saveStepVersion(p.id, 'scenes', { output: { miya: { style: 's', scenes: [{ id: 's1', mainMoment: false }, { id: 's2' }] } }, summary: '', joseCommandId: null });
    saveStepVersion(p.id, 'thumbnail', { output: { miya: {} }, summary: '', joseCommandId: null });
    setMainMoment(p.id, 's2', true);
    const saved = getProject(p.id)!;
    const plan = (saved.steps.scenes.versions[0].output as any).miya.scenes;
    expect(plan.map((s: any) => s.mainMoment)).toEqual([false, true]);
    expect(isStepStale(saved, 'thumbnail')).toBe(false);
    expect(() => setMainMoment(p.id, 'nope', true)).toThrow(/No scene nope/);
  });
});

describe('chosenScenes', () => {
  it('main moments, every scene, or none', () => {
    expect(chosenScenes(scenes, 'main').map((s) => s.id)).toEqual(['s1', 's4']);
    expect(chosenScenes(scenes, 'every').map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4']);
    expect(chosenScenes(scenes, 'none')).toEqual([]);
  });
});

describe('resolveClipEngine', () => {
  const settings = { aiClips: 'main' as const, clipEngine: null, runwayModel: 'gen4_turbo' };

  it('automatic: local when a video model is installed, then Runway, else none with what to set up', () => {
    expect(resolveClipEngine(settings, { localModelInstalled: true, runway: { ok: true } })).toEqual({ engine: 'local' });
    expect(resolveClipEngine(settings, { localModelInstalled: false, runway: { ok: true } })).toEqual({ engine: 'runway' });
    expect(resolveClipEngine(settings, { localModelInstalled: false, runway: { ok: false, reason: 'Add a Runway key in Connectors.' } }))
      .toEqual({ engine: null, reason: NO_CLIP_ENGINE });
    expect(NO_CLIP_ENGINE).toBe('Install a video model in Runtime Hub (ComfyUI), or add a Runway key in Connectors.');
  });

  it('a chosen engine that is not available says why', () => {
    expect(resolveClipEngine({ ...settings, clipEngine: 'local' }, { localModelInstalled: false, runway: { ok: true } }))
      .toEqual({ engine: null, reason: 'No video model is installed. Install one in Runtime Hub (ComfyUI).' });
    expect(resolveClipEngine({ ...settings, clipEngine: 'runway' }, { localModelInstalled: true, runway: { ok: false, reason: 'Zero-Cost Mode is on.' } }))
      .toEqual({ engine: null, reason: 'Zero-Cost Mode is on.' });
  });
});

describe("Miya's scene plan", () => {
  it('keeps mainMoment, false when missing', () => {
    const raw = JSON.stringify({ style: 'warm', scenes: [
      { id: 'a', description: 'hook', imagePrompt: 'x', mainMoment: true },
      { id: 'b', description: 'middle', imagePrompt: 'y' },
      { id: 'c', description: 'cta', imagePrompt: 'z', mainMoment: 'yes' },
    ] });
    const parsed = parseStepAnswer('creative_scenes', raw) as any;
    expect(parsed.scenes.map((s: any) => s.mainMoment)).toEqual([true, false, false]);
  });
});
