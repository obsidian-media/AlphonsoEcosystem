// Phase 4a: lessons from a post's real numbers, proposed by Nova and Miya, kept by you.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../services/jose/submitToJose', () => ({ submitStepsToJose: vi.fn(async () => ({ ok: true, requestId: 'r1' })) }));
vi.mock('../../../services/contentFactory/shortMaker', () => ({ makeShorts: vi.fn(async () => []), redoShort: vi.fn(), shortsSummary: () => 'done' }));

import { submitStepsToJose } from '../../../services/jose/submitToJose';
import { proposeLessons, LESSONS_TASK_MARK } from '../../../services/contentFactory/performanceLessons';
import { recordContentStepResult } from '../../../services/contentFactory/contentStepRecorder';
import { buildStepPrompt, parseStepAnswer } from '../../../services/contentFactory/contentStepPrompts';
import { getBrand, saveBrand, keepLesson, editLesson, dropLesson, proposedLessons } from '../../../services/contentFactory/contentBrandService';
import { createProject, emptyBrief } from '../../../services/contentFactory/contentProjectService';
import { savePosts } from '../../../services/contentFactory/contentPosts';
import type { ContentStepPayload, ProjectPost } from '../../../services/contentFactory/contentTypes';

const NOW = Date.UTC(2026, 9, 24, 18);
const reading = (views: number) => ({ readAtMs: NOW, values: { views, reach: views / 2 }, unavailable: [] });
const post = (id: string, views: number | null): ProjectPost => ({
  id, platform: 'instagram', piece: 'reel', file: 'f', title: `Reel ${id}`, caption: '', hashtags: [], scheduledAtMs: NOW, status: 'posted',
  platformId: id, sentAtMs: NOW - 8 * 24 * 3600e3, ...(views === null ? {} : { metrics: { readings: { '7d': reading(views) } } }),
});

function setup() {
  const brand = saveBrand({ name: 'Acme' });
  const p = createProject(brand.id, 'Launch', { ...emptyBrief(), idea: 'Why coffee waits' });
  savePosts(p.id, [post('a', 100), post('b', 200), post('c', 300), post('hit', 900), post('none', null)]);
  return { brandId: brand.id, projectId: p.id };
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(submitStepsToJose).mockClear();
});

describe('proposeLessons', () => {
  it("asks Nova and Miya through Jose with the post's numbers against the brand", async () => {
    const { projectId } = setup();
    expect(await proposeLessons(projectId, 'hit')).toEqual({ ok: true });
    const sent = vi.mocked(submitStepsToJose).mock.calls[0][0] as any;
    expect(sent.steps.map((s: any) => [s.agent, s.actionType])).toEqual([['nova', 'analysis_performance'], ['miya', 'creative_lessons']]);
    for (const step of sent.steps) {
      expect(step.contentStep).toMatchObject({ projectId, purpose: 'lessons', postRef: { projectId, postId: 'hit' } });
      expect(step.contentStep.task).toContain(LESSONS_TASK_MARK);
      expect(step.contentStep.task).toContain('900 views');
      expect(step.contentStep.task).toContain('usual for this brand on Instagram: 200 views');
    }
  });

  it('a post without its 7-day numbers gets no lessons', async () => {
    const { projectId } = setup();
    expect((await proposeLessons(projectId, 'none')).ok).toBe(false);
    expect(submitStepsToJose).not.toHaveBeenCalled();
  });
});

describe('saving the proposed lessons', () => {
  it('merges both answers, drops near-duplicates, keeps 3 per kind, all proposed', async () => {
    const { brandId, projectId } = setup();
    const postRef = { projectId, postId: 'hit' };
    await recordContentStepResult({ projectId, step: 'publish', agent: 'nova', commandId: 'c', purpose: 'lessons', postRef,
      data: { worked: ['The question hook in the first second kept people watching.', 'Posting at 18:00 on Thursday worked.'], didnt: ['The ending ran long.'] } });
    await recordContentStepResult({ projectId, step: 'publish', agent: 'miya', commandId: 'c', purpose: 'lessons', postRef,
      data: { worked: ['The question hook in the first second kept people watching!', 'Bright colours.', 'Fast cuts.', 'Big text.'], didnt: [] } });
    const lessons = proposedLessons(brandId);
    expect(lessons.filter((l) => l.kind === 'worked')).toHaveLength(3);
    expect(lessons.filter((l) => l.kind === 'didnt')).toHaveLength(1);
    expect(lessons.every((l) => l.status === 'proposed' && l.source === 'performance' && l.postRef?.postId === 'hit')).toBe(true);
    expect(lessons.filter((l) => /question hook/.test(l.text))).toHaveLength(1);
  });
});

describe('keeping lessons', () => {
  it('only kept lessons reach prompts', () => {
    const brand = saveBrand({ name: 'Acme', lessons: [
      { id: 'l1', atMs: 1, text: 'PROPOSED-ONE', source: 'performance', status: 'proposed', kind: 'worked' },
      { id: 'l2', atMs: 2, text: 'KEPT-ONE', source: 'performance', status: 'kept', kind: 'worked' },
      { atMs: 3, text: 'OLD-REJECTION', source: 'rejection' },
    ] } as any);
    const payload = { projectId: 'p', step: 'script', brief: emptyBrief(), brand: getBrand(brand.id)!, prior: {}, task: 't' } as ContentStepPayload;
    const { system, prompt } = buildStepPrompt(payload, 'miya', 'creative_script');
    const all = `${system}\n${prompt}`;
    expect(all).toContain('KEPT-ONE');
    expect(all).toContain('OLD-REJECTION');
    expect(all).not.toContain('PROPOSED-ONE');
  });

  it('a lesson is kept, edited or dropped once', () => {
    const brand = saveBrand({ name: 'Acme', lessons: [
      { id: 'l1', atMs: 1, text: 'One', source: 'performance', status: 'proposed', kind: 'worked' },
      { id: 'l2', atMs: 2, text: 'Two', source: 'performance', status: 'proposed', kind: 'didnt' },
      { id: 'l3', atMs: 3, text: 'Three', source: 'performance', status: 'proposed', kind: 'didnt' },
    ] } as any);
    expect(keepLesson(brand.id, 'l1')).toEqual({ ok: true });
    expect(editLesson(brand.id, 'l2', 'Two, shorter')).toEqual({ ok: true });
    expect(dropLesson(brand.id, 'l3')).toEqual({ ok: true });
    expect(dropLesson(brand.id, 'l1')).toEqual({ ok: false, already: true });
    const lessons = getBrand(brand.id)!.lessons;
    expect(lessons.map((l) => [l.text, l.status])).toEqual([['One', 'kept'], ['Two, shorter', 'kept']]);
  });
});

describe('the lessons answer', () => {
  it('is read as short lists of sentences', () => {
    expect(parseStepAnswer('creative_lessons', JSON.stringify({ worked: [' A. ', '', 'B.'], didnt: ['C.'] }))).toEqual({ worked: ['A.', 'B.'], didnt: ['C.'] });
    expect(parseStepAnswer('analysis_performance', JSON.stringify({ worked: [], didnt: [] }))).toBeNull();
    expect(parseStepAnswer('analysis_performance', JSON.stringify({ worked: ['x'.repeat(400)] }))).toEqual({ worked: ['x'.repeat(240)], didnt: [] });
  });
});
