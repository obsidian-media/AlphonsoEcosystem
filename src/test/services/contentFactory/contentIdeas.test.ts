// Phase 4a: follow-up ideas from good posts, and better post times from real results.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../services/jose/submitToJose', () => ({ submitStepsToJose: vi.fn(async () => ({ ok: true })) }));
vi.mock('../../../services/contentFactory/shortMaker', () => ({ makeShorts: vi.fn(async () => []), redoShort: vi.fn(), shortsSummary: () => 'done' }));

import { submitStepsToJose } from '../../../services/jose/submitToJose';
import { proposeIdeas, listIdeas, startProjectFromIdea, dismissIdea } from '../../../services/contentFactory/contentIdeas';
import { suggestPostTimes, acceptSuggestedSlot } from '../../../services/contentFactory/postTimeSuggestions';
import { recordContentStepResult } from '../../../services/contentFactory/contentStepRecorder';
import { parseStepAnswer } from '../../../services/contentFactory/contentStepPrompts';
import { getBrand, saveBrand } from '../../../services/contentFactory/contentBrandService';
import { createProject, emptyBrief, getProject, listProjects } from '../../../services/contentFactory/contentProjectService';
import { savePosts } from '../../../services/contentFactory/contentPosts';
import type { ProjectPost } from '../../../services/contentFactory/contentTypes';

const DAY = 24 * 3600e3;
// Thursday 22 October 2026, 18:00 local time.
const thursdayAt = (hour: number, weeksAgo = 0) => new Date(2026, 9, 22 - 7 * weeksAgo, hour).getTime();
const post = (id: string, views: number | null, sentAtMs = thursdayAt(18)): ProjectPost => ({
  id, platform: 'instagram', piece: 'reel', file: 'f', title: `Reel ${id}`, caption: '', hashtags: [], scheduledAtMs: sentAtMs, status: 'posted',
  platformId: id, sentAtMs, ...(views === null ? {} : { metrics: { readings: { '7d': { readAtMs: sentAtMs + 7 * DAY, values: { views }, unavailable: [] } } } }),
});

function brandWith(posts: ProjectPost[]) {
  const brand = saveBrand({ name: 'Acme' });
  const p = createProject(brand.id, 'Launch', { ...emptyBrief(), idea: 'Why coffee waits' });
  savePosts(p.id, posts);
  return { brandId: brand.id, projectId: p.id };
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(submitStepsToJose).mockClear();
});

describe('ideas', () => {
  it('come only from good posts', async () => {
    const { projectId } = brandWith([post('a', 100), post('b', 200), post('c', 300), post('mid', 210), post('hit', 900)]);
    expect((await proposeIdeas(projectId, 'mid')).ok).toBe(false);
    expect(submitStepsToJose).not.toHaveBeenCalled();
    expect((await proposeIdeas(projectId, 'hit')).ok).toBe(true);
    const sent = vi.mocked(submitStepsToJose).mock.calls[0][0] as any;
    expect(sent.steps).toHaveLength(1);
    expect(sent.steps[0]).toMatchObject({ agent: 'nova', actionType: 'analysis_ideas', contentStep: { purpose: 'ideas', postRef: { projectId, postId: 'hit' } } });
  });

  it("Nova's answer is saved as up to 3 new ideas for the brand", async () => {
    const { brandId, projectId } = brandWith([post('hit', 900)]);
    await recordContentStepResult({ projectId, step: 'publish', agent: 'nova', commandId: 'c', purpose: 'ideas', postRef: { projectId, postId: 'hit' },
      data: { ideas: ['Part two: the cold brew test', 'The same hook for tea', 'A Short of the pour', 'One too many'] } });
    const ideas = listIdeas(brandId);
    expect(ideas.map((i) => i.text)).toEqual(['Part two: the cold brew test', 'The same hook for tea', 'A Short of the pour']);
    expect(ideas.every((i) => i.status === 'new' && i.fromPost.postId === 'hit')).toBe(true);
  });

  it('Start project makes a project from the idea, with the brand; Dismiss hides it', async () => {
    const { brandId, projectId } = brandWith([post('hit', 900)]);
    await recordContentStepResult({ projectId, step: 'publish', agent: 'nova', commandId: 'c', purpose: 'ideas', postRef: { projectId, postId: 'hit' },
      data: { ideas: ['Part two: the cold brew test', 'The same hook for tea'] } });
    const [first, second] = listIdeas(brandId);
    const project = startProjectFromIdea(first.id)!;
    expect(project).toMatchObject({ brandId, name: 'Part two: the cold brew test', brief: { idea: 'Part two: the cold brew test' } });
    expect(getProject(project.id)).toBeTruthy();
    dismissIdea(second.id);
    expect(listIdeas(brandId)).toEqual([]);
    expect(listProjects(brandId)).toHaveLength(2);
  });

  it('the ideas answer is a short list', () => {
    expect(parseStepAnswer('analysis_ideas', JSON.stringify({ ideas: [' A ', '', 'B', 'C', 'D'] }))).toEqual({ ideas: ['A', 'B', 'C'] });
    expect(parseStepAnswer('analysis_ideas', JSON.stringify({ ideas: [] }))).toBeNull();
  });
});

describe('better post times', () => {
  it('need at least 5 posts with 7-day numbers on the platform', () => {
    const { brandId } = brandWith([post('a', 100), post('b', 900), post('c', 900), post('d', 900)]);
    expect(suggestPostTimes(brandId, 'instagram')).toEqual([]);
  });

  it("come from when the brand's good posts went out, with the reason", () => {
    const { brandId } = brandWith([
      post('a', 100, thursdayAt(9, 1)), post('b', 110, thursdayAt(9, 2)), post('c', 120, thursdayAt(9, 3)),
      post('g1', 900, thursdayAt(18, 1)), post('g2', 950, thursdayAt(18, 2)), post('g3', 1000, thursdayAt(18, 3)),
    ]);
    const [first] = suggestPostTimes(brandId, 'instagram');
    expect(first.slot).toEqual({ platform: 'instagram', day: 4, time: '18:00' });
    expect(first.reason).toBe('3 of your 3 good Reels on Instagram went out on Thursday at 18:00.');
  });

  it('a suggested slot is added only when accepted, without duplicates', () => {
    const { brandId } = brandWith([]);
    expect(getBrand(brandId)!.postingSlots || []).toEqual([]);
    acceptSuggestedSlot(brandId, { platform: 'instagram', day: 4, time: '18:00' });
    acceptSuggestedSlot(brandId, { platform: 'instagram', day: 4, time: '18:00' });
    expect(getBrand(brandId)!.postingSlots).toEqual([{ platform: 'instagram', day: 4, time: '18:00' }]);
  });
});
