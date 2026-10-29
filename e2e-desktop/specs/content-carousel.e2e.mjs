// Carousels (Miya content factory phase 3c, 2026-10-24), in the real app, without
// posting anything. A project with five seeded slides and their pictures (no model or
// ComfyUI needed): Carousel Studio shows them; Campaign Studio's Posts list has the
// Instagram carousel; with no storage set up, approving it saves it to post by hand:
// the slides and caption.txt are copied into the project's ready-to-post folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { enterShell, invoke, buttonByText, openPage, keepOutputFolder, printContentDiag } from '../helpers.mjs';

const savedProjects = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_content_projects_v1') || '[]'));
const savedBrands = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_content_brands_v1') || '[]'));
const projectById = async (id) => (await savedProjects()).find((p) => p.id === id);
// A 1×1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');


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

describe('Alphonso desktop: carousels', () => {
  let outputFolder = '';
  let projectId = '';
  let dir = '';

  before(async function () {
    this.timeout(300000);
    await enterShell();
    outputFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'alphonso-carousel-'));
    const loaded = await invoke('load_settings');
    const saved = JSON.parse((loaded.ok && loaded.value) || '{}');
    const extra = { outputFolder, showPlanFirst: 'never', approvalMode: true, effectApprovals: {} };
    await invoke('save_settings', { settingsJson: JSON.stringify({ ...saved, ...extra }) });
    await browser.execute((values) => {
      const settings = JSON.parse(localStorage.getItem('alphonso_settings') || '{}');
      localStorage.setItem('alphonso_settings', JSON.stringify({ ...settings, ...values }));
      // Instagram through the Page; no storage is set up in a test profile.
      localStorage.setItem('alphonso_instagram_route_v1', 'page');
    }, extra);
    await browser.refresh();
    await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
    await keepOutputFolder(outputFolder);

    await openPage('work', 'miya');
    const name = await $('input[aria-label="New project name"]');
    await name.waitForDisplayed({ timeout: 60000 });
    await name.setValue('Carousel check');
    await (await buttonByText('create')).click();
    await browser.waitUntil(async () => (await savedProjects()).some((p) => p.name === 'Carousel check'), { timeout: 30000 });
    const project = (await savedProjects()).find((p) => p.name === 'Carousel check');
    const brand = (await savedBrands()).find((b) => b.id === project.brandId);
    projectId = project.id;
    dir = `${brand.folderName}/${project.folderName}`;
    fs.mkdirSync(path.join(outputFolder, ...dir.split('/'), 'carousel'), { recursive: true });
    for (let n = 1; n <= 5; n += 1) fs.writeFileSync(path.join(outputFolder, ...dir.split('/'), 'carousel', `v1-c${n}.png`), PNG);
    await browser.execute((id, d) => {
      const projects = JSON.parse(localStorage.getItem('alphonso_content_projects_v1') || '[]');
      const p = projects.find((x) => x.id === id);
      p.brief = { ...p.brief, idea: 'Five habits of slow coffee', platforms: ['Instagram'], outputs: ['carousel'] };
      const v = (output) => ({ version: 1, createdAtMs: Date.now(), output, summary: '', joseCommandId: null, stale: false, basedOn: {} });
      const slides = [1, 2, 3, 4, 5].map((n) => ({ id: `c${n}`, cover: n === 1, headline: `HABIT ${n}`, body: `Why habit ${n} matters.`, imagePrompt: 'coffee' }));
      p.steps.carousel = { status: 'done', chosenVersion: 1, error: null, startedAtMs: null, progress: [], versions: [v({
        miya: { slides },
        pictures: slides.map((s) => ({ sceneId: s.id, status: 'done', relativePath: `${d}/carousel/v1-${s.id}.png` })),
      })] };
      Object.assign(p.steps.campaign, { status: 'done', chosenVersion: 1, error: null, versions: [v({
        miya: { platforms: [{ platform: 'Instagram', caption: 'Reel copy', hashtags: [] }], carousel: { caption: 'Swipe for five habits', hashtags: ['#coffee'] }, ads: [], calendar: [] },
        nova: { times: [] },
      })] });
      localStorage.setItem('alphonso_content_projects_v1', JSON.stringify(projects));
    }, projectId, dir);
    await reopen('carousel studio', projectId, outputFolder);
  });

  after(() => {
    if (outputFolder) fs.rmSync(outputFolder, { recursive: true, force: true });
  });

  it('Carousel Studio shows every slide with its text', async function () {
    this.timeout(60000);
    await $('[data-testid="carousel-slide-c5"]').waitForDisplayed({ timeout: 30000 });
    const text = await $('main').getText();
    for (let n = 1; n <= 5; n += 1) expect(text).toContain(`HABIT ${n}`);
    // The label is upper-cased by its style, so the window's text says COVER.
    expect(text).toMatch(/\bcover\b/i);
  });

  it('the Posts list has the Instagram carousel with its own caption', async function () {
    this.timeout(120000);
    await reopen('campaign studio', projectId, outputFolder);
    await $('section[aria-label="Posts"]').waitForDisplayed({ timeout: 60000 });
    await (await buttonByText('make the posts list')).click();
    await browser.waitUntil(async () => ((await projectById(projectId)).posts || []).length === 1, { timeout: 15000, timeoutMsg: 'no posts list' });
    expect((await projectById(projectId)).posts[0]).toMatchObject({ platform: 'instagram', piece: 'carousel', caption: 'Swipe for five habits', status: 'draft' });
  });

  it('with no storage, approving it saves the slides and caption to post by hand', async function () {
    this.timeout(300000);
    // Due now, so the Publish step sends it at once instead of handing it to the runner.
    await browser.execute((id) => {
      const projects = JSON.parse(localStorage.getItem('alphonso_content_projects_v1') || '[]');
      const p = projects.find((x) => x.id === id);
      p.posts[0].scheduledAtMs = Date.now() - 30_000;
      localStorage.setItem('alphonso_content_projects_v1', JSON.stringify(projects));
    }, projectId);
    await reopen('campaign studio', projectId, outputFolder);
    await $('section[aria-label="Posts"]').waitForDisplayed({ timeout: 60000 });
    await (await buttonByText('approve and schedule')).click();
    // Under the runner's 180 s per test, so the diagnostic prints when this times out in CI.
    await browser.waitUntil(async () => (await projectById(projectId)).posts[0].status === 'by_hand', {
      timeout: 150000, interval: 2000, timeoutMsg: 'the carousel was not saved to post by hand',
    }).catch(async (error) => { await printContentDiag('carousel', projectId); throw error; });
    const post = (await projectById(projectId)).posts[0];
    expect(post.folder).toBe(`${dir}/ready-to-post/instagram-carousel-v1`);
    const folder = path.join(outputFolder, ...post.folder.split('/'));
    expect(fs.readdirSync(folder).sort()).toEqual(['01-v1-c1.png', '02-v1-c2.png', '03-v1-c3.png', '04-v1-c4.png', '05-v1-c5.png', 'caption.txt']);
    expect(fs.readFileSync(path.join(folder, 'caption.txt'), 'utf8')).toBe('Swipe for five habits\n\n#coffee');
    // The Posts list refreshes every 2 s while a post goes out; wait for it rather than read it at once (QA batch 0).
    await browser.waitUntil(async () => (await $('section[aria-label="Posts"]').getText()).includes('Post by hand'), {
      timeout: 30000, timeoutMsg: 'the Posts list never showed "Post by hand"',
    });
  });
});
