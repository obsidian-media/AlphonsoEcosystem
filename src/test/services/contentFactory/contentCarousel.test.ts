// Phase 3c: Miya writes carousels (5–10 slides), made when the brief asks for one.
import { describe, it, expect, beforeEach } from 'vitest';
import { parseStepAnswer } from '../../../services/contentFactory/contentStepPrompts';
import { briefWantsCarousel, contentProjectPlanSteps } from '../../../services/contentFactory/contentProjectPlan';
import { createProject, emptyBrief, getProject, saveStepVersion, isStepStale } from '../../../services/contentFactory/contentProjectService';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { buildPosts } from '../../../services/contentFactory/contentPosts';
import { layoutSlideText, slideSize } from '../../../services/contentFactory/thumbnailRenderer';
import { getTemplate } from '../../../services/jose/joseTemplates';
import { checkPlan } from '../../../services/jose/stepGraph';
import { STEP_ORDER } from '../../../services/contentFactory/contentTypes';

const slide = (i: number, patch: Record<string, unknown> = {}) => ({ headline: `Point ${i}`, body: `Why point ${i} matters.`, imagePrompt: `a picture for ${i}`, ...patch });
const answer = (n: number, patch: (i: number) => Record<string, unknown> = () => ({})) => JSON.stringify({ slides: Array.from({ length: n }, (_, i) => slide(i + 1, patch(i))) });

beforeEach(() => localStorage.clear());

describe('the carousel answer', () => {
  it('parseStepAnswer refuses a carousel with fewer than 5 or more than 10 slides', () => {
    expect(parseStepAnswer('creative_carousel', answer(3))).toBeNull();
    expect(parseStepAnswer('creative_carousel', answer(14))).toBeNull();
    expect(parseStepAnswer('creative_carousel', answer(5))).not.toBeNull();
    expect(parseStepAnswer('creative_carousel', answer(10))).not.toBeNull();
  });

  it('long headlines and bodies are cut to 8 and 25 words', () => {
    const long = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
    const parsed = parseStepAnswer('creative_carousel', answer(5, () => ({ headline: long(12), body: long(40) }))) as { slides: { headline: string; body: string }[] };
    expect(parsed.slides[0].headline.split(' ')).toHaveLength(8);
    expect(parsed.slides[0].body.split(' ')).toHaveLength(25);
  });

  it('slide 1 is the cover', () => {
    const parsed = parseStepAnswer('creative_carousel', answer(6)) as { slides: { id: string; cover: boolean }[] };
    expect(parsed.slides.map((s) => s.id)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
    expect(parsed.slides.map((s) => s.cover)).toEqual([true, false, false, false, false, false]);
  });

  it('a slide with no picture prompt is refused', () => {
    expect(parseStepAnswer('creative_carousel', answer(5, (i) => (i === 2 ? { imagePrompt: '' } : {})))).toBeNull();
  });
});

it('briefWantsCarousel reads outputs and format', () => {
  expect(briefWantsCarousel({ ...emptyBrief(), outputs: ['Long video', 'Carousel'] })).toBe(true);
  expect(briefWantsCarousel({ ...emptyBrief(), outputs: ['Long video'], format: 'carousel' as never })).toBe(true);
  expect(briefWantsCarousel({ ...emptyBrief(), outputs: ['Long video', '3 Shorts'] })).toBe(false);
});

describe('the plan', () => {
  const brand = () => saveBrand({ name: 'Acme' });
  it('Run project includes the carousel step only when the brief asks for one', () => {
    const b = brand();
    const plain = createProject(b.id, 'A', { ...emptyBrief(), idea: 'x', outputs: ['Long video'] });
    expect(contentProjectPlanSteps(plain, b).map((s) => s.stepId)).not.toContain('carousel');
    const wanted = createProject(b.id, 'B', { ...emptyBrief(), idea: 'x', outputs: ['Long video', 'carousel'] });
    const steps = contentProjectPlanSteps(wanted, b);
    expect(steps.find((s) => s.stepId === 'carousel')).toMatchObject({ agent: 'miya', actionType: 'creative_carousel', needs: ['thumbnail'] });
    expect(steps.find((s) => s.stepId === 'campaign')!.needs).toContain('carousel');
    expect(checkPlan(steps).ok).toBe(true);
  });

  it('run on its own it always runs', () => {
    const b = brand();
    const plain = createProject(b.id, 'A', { ...emptyBrief(), idea: 'x', outputs: ['Long video'] });
    expect(contentProjectPlanSteps(plain, b, 'carousel', { only: true }).map((s) => s.stepId)).toEqual(['carousel']);
  });

  it('the Content video template has the carousel step after thumbnails', () => {
    const t = getTemplate('content_video')!;
    expect(t.steps).toHaveLength(18);
    const ids = t.steps.map((s) => s.stepId);
    expect(ids.indexOf('carousel')).toBeGreaterThan(ids.indexOf('thumbnail'));
    expect(t.steps.find((s) => s.stepId === 'carousel')!.needs).toEqual(['thumbnail']);
  });
});

it('making a carousel does not put the voice-over or the finished video out of date', () => {
  const b = saveBrand({ name: 'Acme' });
  const p = createProject(b.id, 'A', { ...emptyBrief(), idea: 'x' });
  saveStepVersion(p.id, 'voice', { output: {}, summary: 'v', joseCommandId: null });
  saveStepVersion(p.id, 'assemble', { output: {}, summary: 'a', joseCommandId: null });
  saveStepVersion(p.id, 'carousel', { output: {}, summary: 'c', joseCommandId: null });
  const project = getProject(p.id)!;
  expect(isStepStale(project, 'voice')).toBe(false);
  expect(isStepStale(project, 'assemble')).toBe(false);
  expect(STEP_ORDER.indexOf('carousel')).toBe(STEP_ORDER.indexOf('campaign') - 1);
});

describe('slides', () => {
  it("are made at the brand's shape (4:5 → 1080×1350, 1:1 → 1080×1080)", () => {
    expect(slideSize('4:5')).toEqual({ width: 1080, height: 1350 });
    expect(slideSize('1:1')).toEqual({ width: 1080, height: 1080 });
    expect(slideSize(undefined)).toEqual({ width: 1080, height: 1350 });
  });

  it('drawSlide fits the headline and body inside the picture', () => {
    const measure = (t: string, size: number) => t.length * size * 0.55;
    for (const size of [slideSize('4:5'), slideSize('1:1')]) {
      const placed = layoutSlideText('EIGHT WORDS ARE THE MOST A HEADLINE GETS', 'Twenty five words is the most a slide body gets, so it stays readable on a phone screen at a glance for everyone who swipes through.', { ...size, cover: false, measure });
      for (const line of placed.headline.lines) expect(measure(line, placed.headline.fontSize)).toBeLessThanOrEqual(size.width * 0.9);
      for (const line of placed.bodyLines) expect(measure(line, placed.bodySize)).toBeLessThanOrEqual(size.width * 0.9);
      expect(placed.bodyY + placed.bodyLines.length * placed.bodySize * 1.25).toBeLessThanOrEqual(size.height);
      expect(placed.headline.y - placed.headline.fontSize).toBeGreaterThanOrEqual(0);
    }
  });
});

it('buildPosts adds an Instagram and a Facebook carousel post with the carousel\'s own caption', () => {
  const b = saveBrand({ name: 'Acme', platforms: ['Instagram', 'Facebook'] });
  const p = createProject(b.id, 'Launch', { ...emptyBrief(), idea: 'x', outputs: ['carousel'] });
  saveStepVersion(p.id, 'assemble', { output: { miya: { outputs: [{ aspect: '9x16', path: 'acme/launch/output/v1.mp4' }] } }, summary: 'v', joseCommandId: null });
  saveStepVersion(p.id, 'carousel', {
    output: {
      miya: { slides: [slide(1), slide(2)] },
      pictures: [{ sceneId: 'c1', status: 'done', relativePath: 'acme/launch/carousel/v1-c1.png' }, { sceneId: 'c2', status: 'done', relativePath: 'acme/launch/carousel/v1-c2.png' }],
    },
    summary: 'c', joseCommandId: null,
  });
  saveStepVersion(p.id, 'campaign', {
    output: { miya: { platforms: [{ platform: 'Instagram', caption: 'Reel caption', hashtags: ['#r'] }], carousel: { caption: 'Swipe through', hashtags: ['#c'] } } },
    summary: 'k', joseCommandId: null,
  });
  const { posts } = buildPosts(getProject(p.id)!, b, new Date(2026, 9, 26, 10).getTime());
  const carousels = posts.filter((x) => x.piece === 'carousel');
  expect(carousels.map((x) => x.platform).sort()).toEqual(['facebook', 'instagram']);
  expect(carousels[0]).toMatchObject({ file: 'acme/launch/carousel/v1-c1.png', files: ['acme/launch/carousel/v1-c1.png', 'acme/launch/carousel/v1-c2.png'], caption: 'Swipe through', hashtags: ['#c'] });
});

it('no carousel post while a slide still has no picture', () => {
  const b = saveBrand({ name: 'Acme', platforms: ['Instagram'] });
  const p = createProject(b.id, 'Launch', { ...emptyBrief(), idea: 'x' });
  saveStepVersion(p.id, 'assemble', { output: { miya: { outputs: [{ aspect: '9x16', path: 'v.mp4' }] } }, summary: 'v', joseCommandId: null });
  saveStepVersion(p.id, 'carousel', {
    output: { miya: { slides: [slide(1), slide(2)] }, pictures: [{ sceneId: 'c1', status: 'done', relativePath: 'a.png' }, { sceneId: 'c2', status: 'pending', jobId: 'j' }] },
    summary: 'c', joseCommandId: null,
  });
  const { posts, notes } = buildPosts(getProject(p.id)!, b, Date.now());
  expect(posts.some((x) => x.piece === 'carousel')).toBe(false);
  expect(notes.join(' ')).toMatch(/carousel/i);
});

it('a carousel can be posted without a finished video', () => {
  const b = saveBrand({ name: 'Acme', platforms: ['Instagram'] });
  const p = createProject(b.id, 'Slides only', { ...emptyBrief(), idea: 'x', outputs: ['carousel'] });
  saveStepVersion(p.id, 'carousel', {
    output: { miya: { slides: [slide(1), slide(2)] }, pictures: [{ sceneId: 'c1', status: 'done', relativePath: 'a/b/carousel/v1-c1.png' }, { sceneId: 'c2', status: 'done', relativePath: 'a/b/carousel/v1-c2.png' }] },
    summary: 'c', joseCommandId: null,
  });
  const { posts, notes } = buildPosts(getProject(p.id)!, b, Date.now());
  expect(posts.map((x) => [x.platform, x.piece])).toEqual([['instagram', 'carousel']]);
  expect(notes.join(' ')).toMatch(/no video to post yet/);
});
