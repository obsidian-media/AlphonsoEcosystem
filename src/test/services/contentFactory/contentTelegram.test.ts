// Phase 4a: the daily 7-day summary and new ideas on Telegram, with buttons.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  collectContentNotifications, contentButtonToken, readContentButtonToken, handleContentButton,
} from '../../../services/contentFactory/contentTelegram';
import { getBrand, saveBrand } from '../../../services/contentFactory/contentBrandService';
import { createProject, emptyBrief, listProjects } from '../../../services/contentFactory/contentProjectService';
import { savePosts } from '../../../services/contentFactory/contentPosts';
import { saveIdeas, listIdeas } from '../../../services/contentFactory/contentIdeas';
import type { ProjectPost } from '../../../services/contentFactory/contentTypes';

const NOW = new Date(2026, 9, 24, 20).getTime();
const on = { performanceSummaries: true, contentIdeas: true };
const post = (id: string, views: number, readAtMs = NOW - 3600e3): ProjectPost => ({
  id, platform: 'instagram', piece: 'reel', file: 'f', title: `Reel ${id}`, caption: '', hashtags: [], scheduledAtMs: NOW, status: 'posted',
  platformId: id, sentAtMs: NOW - 8 * 86400e3, metrics: { readings: { '7d': { readAtMs, values: { views }, unavailable: [] } } },
});

function setup() {
  const brand = saveBrand({ name: 'Acme', lessons: [
    { id: 'l1', atMs: 1, text: 'Question hooks work.', source: 'performance', status: 'proposed', kind: 'worked', postRef: { projectId: 'x', postId: 'today1' } },
  ] } as any);
  const p = createProject(brand.id, 'Launch', emptyBrief());
  savePosts(p.id, [post('today1', 12400), post('today2', 300), post('old', 500, NOW - 3 * 86400e3)]);
  const lessons = getBrand(brand.id)!.lessons.map((l) => ({ ...l, postRef: { projectId: p.id, postId: 'today1' } }));
  saveBrand({ ...getBrand(brand.id)!, lessons });
  return { brandId: brand.id, projectId: p.id };
}

beforeEach(() => localStorage.clear());

describe('collectContentNotifications', () => {
  it('one summary a day for the posts that reached 7 days today, with their lessons to keep or drop', () => {
    setup();
    const found = collectContentNotifications(NOW, new Set(), on);
    const summary = found.filter((n) => n.key.startsWith('perf:'));
    expect(summary).toHaveLength(1);
    expect(summary[0].key).toBe('perf:2026-10-24');
    expect(summary[0].text).toContain('Reel today1 (Instagram): 12,400 views');
    expect(summary[0].text).toContain('Reel today2 (Instagram): 300 views');
    expect(summary[0].text).not.toContain('Reel old');
    expect(summary[0].text).toContain('1. Worked: Question hooks work.');
    expect(summary[0].buttons).toEqual([[{ text: 'Keep 1', action: 'keep', ref: expect.any(String) }, { text: 'Drop 1', action: 'drop', ref: expect.any(String) }]]);
    expect(collectContentNotifications(NOW, new Set(['perf:2026-10-24']), on).filter((n) => n.key.startsWith('perf:'))).toEqual([]);
  });

  it('a new idea comes with Start project and Dismiss', () => {
    const { brandId, projectId } = setup();
    const [idea] = saveIdeas(brandId, ['Part two: the cold brew test'], { projectId, postId: 'today1' });
    const found = collectContentNotifications(NOW, new Set(), on).find((n) => n.key === `idea:${idea.id}`)!;
    expect(found.text).toBe('New idea for Acme: Part two: the cold brew test (from "Reel today1")');
    expect(found.buttons).toEqual([[{ text: 'Start project', action: 'start', ref: idea.id }, { text: 'Dismiss', action: 'dismiss', ref: idea.id }]]);
  });

  it('nothing is collected when the switches are off', () => {
    const { brandId, projectId } = setup();
    saveIdeas(brandId, ['x'], { projectId, postId: 'today1' });
    expect(collectContentNotifications(NOW, new Set(), { performanceSummaries: false, contentIdeas: false })).toEqual([]);
  });
});

describe('content buttons', () => {
  it('fit in a Telegram button and expire after 7 days', () => {
    const token = contentButtonToken({ action: 'keep', ref: 'b|l1' }, NOW);
    expect(token).toMatch(/^c:[A-Za-z0-9]{8}$/);
    expect(readContentButtonToken(token, NOW)).toEqual({ action: 'keep', ref: 'b|l1' });
    expect(readContentButtonToken(token, NOW + 8 * 86400e3)).toBeNull();
    expect(readContentButtonToken('c:unknown1', NOW)).toBeNull();
  });

  it('Keep and Drop decide a lesson once; a stale button says so', () => {
    const { brandId } = setup();
    const keep = contentButtonToken({ action: 'keep', ref: `${brandId}|l1` }, NOW);
    const drop = contentButtonToken({ action: 'drop', ref: `${brandId}|l1` }, NOW);
    expect(handleContentButton(keep, NOW)).toBe('Kept.');
    expect(handleContentButton(drop, NOW)).toBe('Already done.');
    expect(getBrand(brandId)!.lessons[0].status).toBe('kept');
    expect(handleContentButton('c:zzzzzzzz', NOW)).toBe('That button has expired.');
  });

  it('Start project starts one from the idea; Dismiss hides it', () => {
    const { brandId, projectId } = setup();
    const [a, b] = saveIdeas(brandId, ['Part two', 'For tea'], { projectId, postId: 'today1' });
    expect(handleContentButton(contentButtonToken({ action: 'start', ref: a.id }, NOW), NOW)).toBe('Project started: Part two.');
    expect(handleContentButton(contentButtonToken({ action: 'dismiss', ref: b.id }, NOW), NOW)).toBe('Dismissed.');
    expect(handleContentButton(contentButtonToken({ action: 'start', ref: a.id }, NOW), NOW)).toBe('Already done.');
    expect(listIdeas(brandId)).toEqual([]);
    expect(listProjects(brandId).map((p) => p.name)).toContain('Part two');
  });
});
