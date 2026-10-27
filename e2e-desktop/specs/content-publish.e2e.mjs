// Publishing (Miya content factory phase 3a, 2026-10-23), in the real app,
// without posting anything. A project with a finished video and a campaign
// (seeded, so no model is needed): Campaign Studio makes the Posts list, a
// post's time is changed, "Approve and schedule" runs the Publish step through
// Jose with one approval and hands the Instagram Reel to Marcus's runner for
// its time, and cancelling it cancels the runner's send too.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { enterShell, invoke, buttonByText, openPage, keepOutputFolder, printContentDiag } from '../helpers.mjs';

const savedProjects = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_content_projects_v1') || '[]'));
const savedBrands = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_content_brands_v1') || '[]'));
const schedule = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_marcus_schedule_v1') || '[]'));
const projectById = async (id) => (await savedProjects()).find((p) => p.id === id);


describe('Alphonso desktop: publishing', () => {
  let outputFolder = '';
  let projectId = '';

  before(async function () {
    this.timeout(300000);
    await enterShell();
    outputFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'alphonso-publish-'));
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
    await name.setValue('Publishing check');
    await (await buttonByText('create')).click();
    await browser.waitUntil(async () => (await savedProjects()).some((p) => p.name === 'Publishing check'), { timeout: 30000 });
    const project = (await savedProjects()).find((p) => p.name === 'Publishing check');
    const brand = (await savedBrands()).find((b) => b.id === project.brandId);
    projectId = project.id;
    const dir = `${brand.folderName}/${project.folderName}`;
    await browser.execute((id, d) => {
      const projects = JSON.parse(localStorage.getItem('alphonso_content_projects_v1') || '[]');
      const p = projects.find((x) => x.id === id);
      // Instagram only: its post waits in Marcus's runner, so nothing is sent during the test.
      p.brief = { ...p.brief, idea: 'Why good coffee takes time', platforms: ['Instagram'] };
      const v = (output) => ({ version: 1, createdAtMs: Date.now(), output, summary: '', joseCommandId: null, stale: false, basedOn: {} });
      Object.assign(p.steps.assemble, { status: 'done', chosenVersion: 1, error: null, versions: [v({ miya: { outputs: [
        { aspect: '16x9', path: `${d}/output/video-16x9-v1.mp4`, durationSec: 20, frames: [] },
        { aspect: '9x16', path: `${d}/output/video-9x16-v1.mp4`, durationSec: 20, frames: [] },
      ] } })] });
      Object.assign(p.steps.campaign, { status: 'done', chosenVersion: 1, error: null, versions: [v({
        miya: { platforms: [{ platform: 'Instagram', caption: 'Slow coffee, better mornings', hashtags: ['#coffee'] }], ads: [], calendar: [] },
        nova: { times: [] },
      })] });
      localStorage.setItem('alphonso_content_projects_v1', JSON.stringify(projects));
    }, projectId, dir);
    await browser.refresh();
    await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
    await keepOutputFolder(outputFolder);
    await openPage('work', 'miya');
    await (await buttonByText('campaign studio')).click();
    const select = await $('select[aria-label="Project"]');
    await select.waitForExist({ timeout: 60000 });
    await select.selectByAttribute('value', projectId);
    await $('section[aria-label="Posts"]').waitForDisplayed({ timeout: 60000 });
  });

  after(() => {
    if (outputFolder) fs.rmSync(outputFolder, { recursive: true, force: true });
  });

  it('makes the posts list and changes a post time', async function () {
    this.timeout(120000);
    await (await buttonByText('make the posts list')).click();
    await browser.waitUntil(async () => ((await projectById(projectId)).posts || []).length === 1, { timeout: 15000, timeoutMsg: 'no posts list' });
    const post = (await projectById(projectId)).posts[0];
    expect(post).toMatchObject({ platform: 'instagram', piece: 'reel', caption: 'Slow coffee, better mornings', status: 'draft' });
    // Three days from now at 10:00, local time.
    const at = new Date();
    at.setDate(at.getDate() + 3);
    at.setHours(10, 0, 0, 0);
    const pad = (n) => String(n).padStart(2, '0');
    const value = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T10:00`;
    await browser.execute((v) => {
      const input = document.querySelector('input[aria-label="Instagram Reel time"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
    await browser.waitUntil(async () => (await projectById(projectId)).posts[0].scheduledAtMs === at.getTime(), { timeout: 10000, timeoutMsg: 'the new time was not saved' });
  });

  it('"Approve and schedule" asks once and hands the Reel to Marcus for its time', async function () {
    this.timeout(300000);
    await (await buttonByText('approve and schedule')).click();
    // Under the runner's 180 s per test, so the diagnostic prints when this times out in CI.
    await browser.waitUntil(async () => (await projectById(projectId)).posts[0].status === 'scheduled', {
      timeout: 150000, interval: 2000, timeoutMsg: 'the post was not scheduled',
    }).catch(async (error) => { await printContentDiag('publish', projectId); throw error; });
    const project = await projectById(projectId);
    const item = (await schedule()).find((i) => i.postId === project.posts[0].id);
    expect(item).toMatchObject({ kind: 'content_post', platform: 'instagram', status: 'pending', scheduledAt: project.posts[0].scheduledAtMs });
    // One approval: the Publish request is not left waiting for a second one.
    const requests = JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_requests_v1') || '[]'));
    const request = requests.find((r) => r.id === project.joseRequestId);
    expect(request.steps.find((s) => s.stepId === 'publish').status).not.toBe('waiting_approval');
    expect(await $('section[aria-label="Posts"]').getText()).toContain('Scheduled');
  });

  it('cancelling the post cancels its scheduled send', async function () {
    this.timeout(60000);
    await (await $('button[aria-label="Cancel Instagram Reel"]')).click();
    await browser.waitUntil(async () => (await projectById(projectId)).posts[0].status === 'cancelled', { timeout: 10000 });
    const postId = (await projectById(projectId)).posts[0].id;
    const item = (await schedule()).find((i) => i.postId === postId);
    expect(item.status).toBe('cancelled');
  });
});
