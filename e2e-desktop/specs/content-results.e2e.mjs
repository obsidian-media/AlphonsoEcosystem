// Real results (Miya content factory phase 4a, 2026-10-24), in the real app, with seeded
// numbers: nothing is read from YouTube or Meta, nothing is posted. The Brands tab's
// Results show each post with how it did for its brand; a proposed lesson is kept; an idea
// starts a project; the Calendar side panel shows a post's numbers; a Short is marked.
import { enterShell, openPage, buttonByText } from '../helpers.mjs';

const DAY = 24 * 3600e3;
const savedBrands = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_content_brands_v1') || '[]'));
const savedProjects = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_content_projects_v1') || '[]'));

describe('Alphonso desktop: real results', () => {
  before(async function () {
    this.timeout(300000);
    await enterShell();
    await browser.execute((DAY_MS) => {
      const now = Date.now();
      localStorage.setItem('alphonso_content_brands_v1', JSON.stringify([{
        id: 'acme', name: 'Acme', folderName: 'acme', palette: ['#30a46c'], fonts: '', logo: '', tone: '', audience: '', visualStyle: '', characterRefs: '',
        voice: { engine: 'kokoro', voiceId: 'af_heart' }, platforms: ['Instagram'], schedule: '', postingSlots: [], honestyRules: '', references: [],
        lessons: [{ id: 'l1', atMs: now, text: 'Question hooks kept people watching.', source: 'performance', status: 'proposed', kind: 'worked', postRef: { projectId: 'p1', postId: 'hit' } }],
        pastScripts: '', qualityThreshold: 7, createdAtMs: now, updatedAtMs: now,
      }]));
      const step = () => ({ status: 'not_started', versions: [], chosenVersion: null, error: null, startedAtMs: null, progress: [] });
      const steps = Object.fromEntries(['brief', 'research', 'script', 'review', 'scenes', 'thumbnail', 'voice', 'music', 'broll', 'clips', 'assemble', 'shorts', 'carousel', 'campaign', 'quality', 'publish'].map((s) => [s, step()]));
      // Sent 8 days ago, scheduled today (so they show on this month), with their 7-day numbers already read.
      const post = (id, views, extra = {}) => ({
        id, platform: 'instagram', piece: 'reel', file: 'f.mp4', title: `Reel ${id}`, caption: '', hashtags: [], scheduledAtMs: now + 3600e3,
        status: 'posted', platformId: `ig${id}`, sentAtMs: now - 8 * DAY_MS,
        metrics: { readings: { '7d': { readAtMs: now - DAY_MS, values: { views, reach: views / 2 }, unavailable: ['saves'] } } }, ...extra,
      });
      localStorage.setItem('alphonso_content_projects_v1', JSON.stringify([{
        id: 'p1', brandId: 'acme', name: 'Why coffee waits', folderName: 'p1',
        brief: { idea: 'Why coffee waits', platforms: [], outputs: [], format: 'voiceover_broll', lengthSec: 60, notes: '', writeInMyVoice: false, showEverything: false },
        briefRevision: 1, steps, createdAtMs: now, updatedAtMs: now,
        posts: [post('a', 100), post('b', 200), post('c', 300), post('hit', 900), post('short', 250, { shortId: 'sh1', title: 'Quick tip' })],
      }]));
      localStorage.setItem('alphonso_content_ideas_v1', JSON.stringify([
        { id: 'i1', brandId: 'acme', text: 'Part two: the cold brew test', fromPost: { projectId: 'p1', postId: 'hit' }, atMs: now, status: 'new' },
      ]));
    }, DAY);
    await browser.refresh();
    await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
    await openPage('work', 'miya');
    await (await buttonByText('brands')).click();
    await $('section[aria-label="Results"]').waitForDisplayed({ timeout: 60000 });
  });

  it("the Results show each post with how it did for its brand", async function () {
    this.timeout(60000);
    const results = await $('section[aria-label="Results"]');
    expect(await $('[data-testid="result-hit"]').getText()).toContain('good');
    expect(await $('[data-testid="result-a"]').getText()).toContain('weak');
    expect(await results.getText()).toContain('900');
  });

  it('a proposed lesson is kept, and then counts as a lesson', async function () {
    this.timeout(60000);
    await (await $('button[aria-label="Keep lesson: Question hooks kept people watching."]')).click();
    await browser.waitUntil(async () => (await savedBrands())[0].lessons[0].status === 'kept', { timeout: 10000, timeoutMsg: 'the lesson was not kept' });
  });

  it('an idea starts a project for the brand', async function () {
    this.timeout(60000);
    await (await $('button[aria-label="Start project: Part two: the cold brew test"]')).click();
    await browser.waitUntil(async () => (await savedProjects()).some((p) => p.name === 'Part two: the cold brew test' && p.brandId === 'acme'), { timeout: 10000, timeoutMsg: 'no project from the idea' });
  });

  it("the Calendar shows a post's numbers and marks the Short", async function () {
    this.timeout(120000);
    await openPage('work', 'calendar');
    const chip = await $('[data-testid="calendar-item-post:hit"]');
    await chip.waitForDisplayed({ timeout: 60000 });
    expect(await $('[data-testid="calendar-item-post:short"]').getText()).toContain('Short');
    await chip.click();
    const panel = await $('section[aria-label="Selected post"]');
    await panel.waitForDisplayed({ timeout: 15000 });
    expect(await panel.getText()).toContain('900');
  });
});
