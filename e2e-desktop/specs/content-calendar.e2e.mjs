// The Calendar page (Miya content factory phase 3b, 2026-10-23), in the real app,
// without posting anything. Two brands' posts and a Content Studio draft (seeded):
// they show on the month, the draft is dragged to another day, an Instagram post is
// moved with the side panel's Change (Marcus's runner moves its send too) and then
// cancelled (its send is cancelled too).
import { enterShell, openPage } from '../helpers.mjs';

const projects = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_content_projects_v1') || '[]'));
const schedule = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_marcus_schedule_v1') || '[]'));
const jobs = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_content_catalyst_jobs_v1') || '[]'));
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

describe('Alphonso desktop: the Calendar', () => {
  // Posts a few days ahead, inside the current month view when possible.
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const day = (n, h = 0) => { const d = new Date(base); d.setDate(d.getDate() + n); d.setHours(h, 0, 0, 0); return d; };
  const igAt = day(3, 18);
  const draftDay = day(4);
  const draftTarget = day(5);

  before(async function () {
    this.timeout(300000);
    await enterShell();
    await browser.execute((seed) => {
      const now = Date.now();
      const brand = (id, name, palette, platforms) => ({
        id, name, folderName: id, palette, fonts: '', logo: '', tone: '', audience: '', visualStyle: '', characterRefs: '',
        voice: { engine: 'kokoro', voiceId: 'af_heart' }, platforms, schedule: '', postingSlots: [], honestyRules: '',
        references: [], lessons: [], pastScripts: '', qualityThreshold: 7, createdAtMs: now, updatedAtMs: now,
      });
      localStorage.setItem('alphonso_content_brands_v1', JSON.stringify([
        brand('lw', 'Learn With Alphonso', ['#30a46c'], ['YouTube', 'Instagram']),
        brand('sp', 'ShipToPhone', [], ['Instagram']),
      ]));
      const step = () => ({ status: 'not_started', versions: [], chosenVersion: null, error: null, startedAtMs: null, progress: [] });
      const steps = Object.fromEntries(['brief', 'research', 'script', 'review', 'scenes', 'thumbnail', 'voice', 'music', 'broll', 'clips', 'assemble', 'campaign', 'quality', 'publish'].map((s) => [s, step()]));
      const project = (id, brandId, name, posts) => ({
        id, brandId, name, folderName: id, brief: { idea: name, platforms: [], outputs: [], format: 'voiceover_broll', lengthSec: 60, notes: '', writeInMyVoice: false, showEverything: false },
        briefRevision: 1, steps, posts, createdAtMs: now, updatedAtMs: now,
      });
      const post = (id, platform, piece, title, at, extra = {}) => ({ id, platform, piece, file: 'f.mp4', title, caption: `${title} caption`, hashtags: [], scheduledAtMs: at, status: 'scheduled', ...extra });
      localStorage.setItem('alphonso_content_projects_v1', JSON.stringify([
        project('p1', 'lw', 'Why tired', [post('ig1', 'instagram', 'reel', 'Tired reel', seed.igAt)]),
        project('p2', 'sp', 'Launch', [post('sp1', 'instagram', 'reel', 'Launch reel', seed.igAt + 3600000)]),
      ]));
      localStorage.setItem('alphonso_marcus_schedule_v1', JSON.stringify([
        { id: 'm1', kind: 'content_post', projectId: 'p1', postId: 'ig1', platform: 'instagram', scheduledAt: seed.igAt, content: '', agentId: 'marcus', createdAt: now, status: 'pending' },
      ]));
      localStorage.setItem('alphonso_content_catalyst_jobs_v1', JSON.stringify([
        { id: 'job1', request: { idea: 'Studio draft', platform: 'instagram' }, scheduled_date: seed.draftDay, scheduled_time: '', status: 'ready', updatedAtMs: now },
      ]));
    }, { igAt: igAt.getTime(), draftDay: dayKey(draftDay) });
    await browser.refresh();
    await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
    await openPage('work', 'calendar');
    await $('[data-testid="calendar-item-post:ig1"]').waitForDisplayed({ timeout: 60000 });
  });

  it("shows both brands' posts and the draft", async function () {
    this.timeout(60000);
    expect(await $('[data-testid="calendar-item-post:sp1"]').isDisplayed()).toBe(true);
    expect(await $('[data-testid="calendar-item-draft:job1"]').isDisplayed()).toBe(true);
    expect(await $(`[data-testid="calendar-day-${dayKey(igAt)}"]`).getText()).toContain('18:00 Tired reel');
  });

  it('dragging the draft to another day moves it', async function () {
    this.timeout(60000);
    const target = await $(`[data-testid="calendar-day-${dayKey(draftTarget)}"]`);
    await (await $('[data-testid="calendar-item-draft:job1"]')).dragAndDrop(target);
    await browser.waitUntil(async () => (await jobs())[0].scheduled_date === dayKey(draftTarget), { timeout: 15000, timeoutMsg: 'the draft did not move' });
  });

  it("Change in the side panel moves the Instagram post and its send; Cancel cancels both", async function () {
    this.timeout(120000);
    await (await $('[data-testid="calendar-item-post:ig1"]')).click();
    const panel = await $('section[aria-label="Selected post"]');
    await panel.waitForDisplayed({ timeout: 15000 });
    const to = day(6, 9);
    const value = `${dayKey(to)}T09:00`;
    await browser.execute((v) => {
      const input = document.querySelector('section[aria-label="Selected post"] input[aria-label="New time"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
    await (await panel.$('button=Change')).click();
    await browser.waitUntil(async () => (await projects())[0].posts[0].scheduledAtMs === to.getTime(), { timeout: 15000, timeoutMsg: 'the post did not move' });
    expect((await schedule()).find((i) => i.postId === 'ig1').scheduledAt).toBe(to.getTime());

    await (await panel.$('button=Cancel post')).click();
    const dialog = await $('[role="dialog"]');
    await dialog.waitForDisplayed({ timeout: 15000 });
    await (await dialog.$('button=Cancel it')).click();
    await browser.waitUntil(async () => (await projects())[0].posts[0].status === 'cancelled', { timeout: 15000, timeoutMsg: 'the post was not cancelled' });
    expect((await schedule()).find((i) => i.postId === 'ig1').status).toBe('cancelled');
  });
});
