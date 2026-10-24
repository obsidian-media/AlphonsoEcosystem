// Phase 3d: Miya plans the Shorts (mini-script, highlight or cut, per Short).
import { describe, it, expect, beforeEach } from 'vitest';
import { parseStepAnswer } from '../../../services/contentFactory/contentStepPrompts';
import { briefWantsShorts, contentProjectPlanSteps, shortsCount } from '../../../services/contentFactory/contentProjectPlan';
import {
  createProject, emptyBrief, getProject, saveStepVersion, isStepStale, getShortsSettings, setShortsSettings, setShortPlatforms, setShortKind,
} from '../../../services/contentFactory/contentProjectService';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { getTemplate } from '../../../services/jose/joseTemplates';
import { checkPlan } from '../../../services/jose/stepGraph';
import { STEP_ORDER } from '../../../services/contentFactory/contentTypes';

beforeEach(() => localStorage.clear());

const mini = (patch: Record<string, unknown> = {}) => ({
  kind: 'mini', title: 'Why coffee waits', hook: 'Your coffee is lying to you', seconds: 45,
  copy: [{ platform: 'instagram', caption: 'Slow down', hashtags: ['#coffee'] }],
  parts: [{ spoken: 'Good coffee takes time.', imagePrompt: 'a pour-over', seconds: 15 }], ...patch,
});
const answer = (shorts: unknown[]) => JSON.stringify({ shorts });
const parse = (shorts: unknown[]) => parseStepAnswer('creative_shorts', answer(shorts), { defaultPlatforms: ['youtube', 'instagram'] }) as { shorts: Record<string, unknown>[] } | null;

describe('shortsCount and briefWantsShorts', () => {
  it('shortsCount reads "3 Shorts", "three shorts", "Shorts x2", "a short", else 1', () => {
    const count = (outputs: string[]) => shortsCount({ ...emptyBrief(), outputs });
    expect(count(['Long video', '3 Shorts'])).toBe(3);
    expect(count(['three shorts'])).toBe(3);
    expect(count(['Shorts x2'])).toBe(2);
    expect(count(['a short'])).toBe(1);
    expect(count(['Long video'])).toBe(1);
    expect(count(['5 reels'])).toBe(5);
  });

  it('briefWantsShorts reads outputs and format', () => {
    expect(briefWantsShorts({ ...emptyBrief(), outputs: ['Long video', '2 Shorts'] })).toBe(true);
    expect(briefWantsShorts({ ...emptyBrief(), outputs: ['Reels'] })).toBe(true);
    expect(briefWantsShorts({ ...emptyBrief(), outputs: ['Long video'], format: 'shorts' as never })).toBe(true);
    expect(briefWantsShorts({ ...emptyBrief(), outputs: ['Long video', 'carousel'] })).toBe(false);
  });
});

describe('the Shorts answer', () => {
  it('keeps 30–60 s Shorts, cuts hooks to 12 words, numbers them sh1…, defaults the kind to mini and the platforms', () => {
    const long = Array.from({ length: 20 }, (_, i) => `w${i}`).join(' ');
    const parsed = parse([mini({ seconds: 12, hook: long, kind: 'something', platforms: undefined }), mini({ seconds: 120 })])!;
    expect(parsed.shorts.map((s) => s.id)).toEqual(['sh1', 'sh2']);
    expect(parsed.shorts.map((s) => s.seconds)).toEqual([30, 60]);
    expect(String(parsed.shorts[0].hook).split(' ')).toHaveLength(12);
    expect(parsed.shorts[0].kind).toBe('mini');
    expect(parsed.shorts[0].platforms).toEqual(['youtube', 'instagram']);
  });

  it('a mini Short needs parts with spoken words and picture prompts; a highlight or cut needs a moment', () => {
    const parsed = parse([
      mini({ parts: [] }),
      { ...mini(), kind: 'highlight', parts: undefined, moment: { startSec: 10, endSec: 50 } },
      { ...mini(), kind: 'cut', parts: undefined, moment: { startSec: 40, endSec: 20 } },
      { ...mini(), kind: 'cut', parts: undefined },
      mini(),
    ])!;
    expect(parsed.shorts.map((s) => s.kind)).toEqual(['highlight', 'mini']);
    expect(parse([mini({ parts: [] })])).toBeNull();
  });

  it('platforms are kept to youtube, instagram and facebook', () => {
    const parsed = parse([mini({ platforms: ['YouTube', 'tiktok', 'Facebook'] })])!;
    expect(parsed.shorts[0].platforms).toEqual(['youtube', 'facebook']);
  });
});

describe('the plan', () => {
  const brand = () => saveBrand({ name: 'Acme' });
  it('Run project includes the Shorts step only when the brief asks for Shorts or Reels', () => {
    const b = brand();
    const plain = createProject(b.id, 'A', { ...emptyBrief(), idea: 'x', outputs: ['Long video'] });
    expect(contentProjectPlanSteps(plain, b).map((s) => s.stepId)).not.toContain('shorts');
    const wanted = createProject(b.id, 'B', { ...emptyBrief(), idea: 'x', outputs: ['Long video', '3 Shorts'] });
    const steps = contentProjectPlanSteps(wanted, b);
    expect(steps.find((s) => s.stepId === 'shorts')).toMatchObject({ agent: 'miya', actionType: 'creative_shorts', needs: ['assemble'] });
    expect(checkPlan(steps).ok).toBe(true);
  });

  it('the template has the shorts step after assemble', () => {
    const t = getTemplate('content_video')!;
    expect(t.steps).toHaveLength(19);
    expect(t.steps.find((s) => s.stepId === 'shorts')!.needs).toEqual(['assemble']);
  });
});

it('making Shorts does not put the finished video or the carousel out of date (and the other way round)', () => {
  const b = saveBrand({ name: 'Acme' });
  const p = createProject(b.id, 'A', { ...emptyBrief(), idea: 'x' });
  saveStepVersion(p.id, 'assemble', { output: {}, summary: 'a', joseCommandId: null });
  saveStepVersion(p.id, 'carousel', { output: {}, summary: 'c', joseCommandId: null });
  saveStepVersion(p.id, 'shorts', { output: {}, summary: 's', joseCommandId: null });
  saveStepVersion(p.id, 'carousel', { output: {}, summary: 'c2', joseCommandId: null });
  const project = getProject(p.id)!;
  expect(isStepStale(project, 'assemble')).toBe(false);
  expect(isStepStale(project, 'carousel')).toBe(false);
  expect(isStepStale(project, 'shorts')).toBe(false);
  expect(STEP_ORDER.indexOf('shorts')).toBe(STEP_ORDER.indexOf('assemble') + 1);
});

describe('Shorts settings and edits', () => {
  it('the Shorts clip setting starts off and is saved on the project', () => {
    const p = createProject('b', 'A', emptyBrief());
    expect(getShortsSettings(p)).toEqual({ aiClips: 'none', clipEngine: null });
    setShortsSettings(p.id, { aiClips: 'main', clipEngine: 'local' });
    expect(getShortsSettings(getProject(p.id)!)).toEqual({ aiClips: 'main', clipEngine: 'local' });
  });

  it("a Short's kind and platforms are changed in the chosen version", () => {
    const p = createProject('b', 'A', emptyBrief());
    saveStepVersion(p.id, 'shorts', { output: { miya: { shorts: [{ id: 'sh1', kind: 'mini', platforms: ['youtube'] }] } }, summary: '', joseCommandId: null });
    setShortPlatforms(p.id, 'sh1', ['instagram', 'facebook']);
    setShortKind(p.id, 'sh1', 'cut');
    const short = (getProject(p.id)!.steps.shorts.versions[0].output as { miya: { shorts: Record<string, unknown>[] } }).miya.shorts[0];
    expect(short).toMatchObject({ platforms: ['instagram', 'facebook'], kind: 'cut' });
  });
});
