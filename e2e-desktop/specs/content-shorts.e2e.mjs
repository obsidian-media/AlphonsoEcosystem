// Shorts (Miya content factory phase 3d, 2026-10-24), in the real app, without making
// or posting anything. Three seeded Shorts (one of each kind, one too long for Facebook):
// Shorts Studio shows each Short's kind and what each platform makes of it; unticking a
// platform is saved; the Posts list has the Shorts and leaves Facebook off the long one,
// with a note.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { enterShell, invoke, buttonByText, openPage, keepOutputFolder } from '../helpers.mjs';

const savedProjects = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_content_projects_v1') || '[]'));
const savedBrands = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_content_brands_v1') || '[]'));
const projectById = async (id) => (await savedProjects()).find((p) => p.id === id);
const shortsOf = async (id) => (await projectById(id)).steps.shorts.versions[0].output.miya.shorts;


async function reopen(tab, projectId, outputFolder) {
  await browser.refresh();
  await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
  await keepOutputFolder(outputFolder);
  await openPage('work', 'miya');
  await (await buttonByText(tab)).click();
  const select = await $('select[aria-label="Project"]');
  await select.waitForExist({ timeout: 60000 });
  await select.selectByAttribute('value', projectId);
}

describe('Alphonso desktop: Shorts', () => {
  let outputFolder = '';
  let projectId = '';

  before(async function () {
    this.timeout(300000);
    await enterShell();
    outputFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'alphonso-shorts-'));
    const loaded = await invoke('load_settings');
    const saved = JSON.parse((loaded.ok && loaded.value) || '{}');
    const extra = { outputFolder, showPlanFirst: 'never', approvalMode: true, effectApprovals: {} };
    await invoke('save_settings', { settingsJson: JSON.stringify({ ...saved, ...extra }) });
    await browser.execute((values) => {
      const settings = JSON.parse(localStorage.getItem('alphonso_settings') || '{}');
      localStorage.setItem('alphonso_settings', JSON.stringify({ ...settings, ...values }));
    }, extra);
    await browser.refresh();
    await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
    await keepOutputFolder(outputFolder);

    await openPage('work', 'miya');
    const name = await $('input[aria-label="New project name"]');
    await name.waitForDisplayed({ timeout: 60000 });
    await name.setValue('Shorts check');
    await (await buttonByText('create')).click();
    await browser.waitUntil(async () => (await savedProjects()).some((p) => p.name === 'Shorts check'), { timeout: 30000 });
    const project = (await savedProjects()).find((p) => p.name === 'Shorts check');
    const brand = (await savedBrands()).find((b) => b.id === project.brandId);
    projectId = project.id;
    const dir = `${brand.folderName}/${project.folderName}`;
    await browser.execute((id, d) => {
      const projects = JSON.parse(localStorage.getItem('alphonso_content_projects_v1') || '[]');
      const p = projects.find((x) => x.id === id);
      p.brief = { ...p.brief, idea: 'Why good coffee takes time', platforms: ['YouTube', 'Instagram', 'Facebook'], outputs: ['3 Shorts'] };
      const v = (output) => ({ version: 1, createdAtMs: Date.now(), output, summary: '', joseCommandId: null, stale: false, basedOn: {} });
      const copy = (x) => [{ platform: 'youtube', title: `YT ${x}`, caption: `yt ${x}`, hashtags: [] }, { platform: 'instagram', caption: `ig ${x}`, hashtags: [] }, { platform: 'facebook', caption: `fb ${x}`, hashtags: [] }];
      const shorts = [
        { id: 'sh1', kind: 'mini', title: 'Slow coffee', hook: 'Your coffee is lying to you', seconds: 45, platforms: ['youtube', 'instagram'], copy: copy('sh1'), parts: [{ spoken: 'Good coffee waits.', imagePrompt: 'pour-over', seconds: 10 }] },
        { id: 'sh2', kind: 'highlight', title: 'The long pour', hook: 'Watch the bloom', seconds: 60, platforms: ['facebook', 'instagram'], copy: copy('sh2'), moment: { startSec: 10, endSec: 105 } },
        { id: 'sh3', kind: 'cut', title: 'The cup', hook: '', seconds: 30, platforms: ['youtube'], copy: copy('sh3'), moment: { startSec: 120, endSec: 150 } },
      ];
      const made = {
        sh1: { shortId: 'sh1', status: 'done', path: `${d}/shorts/sh1/v1.mp4`, seconds: 45, fileVersion: 1 },
        sh2: { shortId: 'sh2', status: 'done', path: `${d}/shorts/sh2/v1.mp4`, seconds: 95, fileVersion: 1 },
        sh3: { shortId: 'sh3', status: 'done', path: `${d}/shorts/sh3/v1.mp4`, seconds: 30, fileVersion: 1 },
      };
      p.steps.shorts = { status: 'done', chosenVersion: 1, error: null, startedAtMs: null, progress: [], versions: [v({ miya: { shorts }, made })] };
      localStorage.setItem('alphonso_content_projects_v1', JSON.stringify(projects));
    }, projectId, dir);
    await reopen('shorts studio', projectId, outputFolder);
  });

  after(() => {
    if (outputFolder) fs.rmSync(outputFolder, { recursive: true, force: true });
  });

  it("Shorts Studio shows each Short's kind and what each platform makes of it", async function () {
    this.timeout(60000);
    await $('[data-testid="short-sh3"]').waitForDisplayed({ timeout: 30000 });
    expect(await $('select[aria-label="Kind of Short 1"]').getValue()).toBe('mini');
    expect(await $('select[aria-label="Kind of Short 2"]').getValue()).toBe('highlight');
    expect(await $('select[aria-label="Kind of Short 3"]').getValue()).toBe('cut');
    const long = await $('[data-testid="short-sh2"]').getText();
    expect(long).toContain('Facebook: Not a Facebook Reel');
    expect(long).toContain('Instagram: fits');
  });

  it('unticking a platform is saved', async function () {
    this.timeout(60000);
    await (await $('input[aria-label="Short 1 on Instagram"]')).click();
    await browser.waitUntil(async () => !(await shortsOf(projectId))[0].platforms.includes('instagram'), { timeout: 10000, timeoutMsg: 'the platform was not saved' });
    expect((await shortsOf(projectId))[0].platforms).toEqual(['youtube']);
  });

  it('the Posts list has the Shorts and leaves Facebook off the long one, with a note', async function () {
    this.timeout(120000);
    await reopen('campaign studio', projectId, outputFolder);
    await $('section[aria-label="Posts"]').waitForDisplayed({ timeout: 60000 });
    await (await buttonByText('make the posts list')).click();
    await browser.waitUntil(async () => ((await projectById(projectId)).posts || []).length > 0, { timeout: 15000, timeoutMsg: 'no posts list' });
    const posts = (await projectById(projectId)).posts.filter((x) => x.shortId);
    expect(posts.map((x) => `${x.shortId}:${x.platform}`).sort()).toEqual(['sh1:youtube', 'sh2:instagram', 'sh3:youtube']);
    expect(await $('section[aria-label="Posts"]').getText()).toContain('Not a Facebook Reel');
  });
});
