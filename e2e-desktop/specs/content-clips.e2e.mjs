// AI clips (Miya content factory phase 2b, 2026-10-23), in the real app. A
// project with a scene plan and pictures (seeded, so no model is needed):
// the Scene Builder's Main moment switch and AI clip settings are saved; the AI
// clips step, run from Miya Studio, either makes a real clip with the user's
// ComfyUI and installed video model (then the clip plays), or says what to set
// up. Runtime Hub's ComfyUI card shows the video models and the card's memory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { enterShell, invoke, buttonByText, openPage } from '../helpers.mjs';

const VENDOR_FFMPEG = path.resolve('src-tauri/vendor/ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
const NO_ENGINE = 'Install a video model in Runtime Hub (ComfyUI), or add a Runway key in Connectors.';

const savedProjects = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_content_projects_v1') || '[]'));
const savedBrands = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_content_brands_v1') || '[]'));
const projectById = async (id) => (await savedProjects()).find((p) => p.id === id);

async function keepOutputFolder(folder) {
  await browser.waitUntil(async () => browser.execute((wanted) => {
    const settings = JSON.parse(localStorage.getItem('alphonso_settings') || '{}');
    if (settings.outputFolder === wanted) return true;
    localStorage.setItem('alphonso_settings', JSON.stringify({ ...settings, outputFolder: wanted }));
    return false;
  }, folder), { timeout: 30000, interval: 1000, timeoutMsg: 'the output folder setting did not stick' });
}

async function openSceneBuilder(projectId) {
  await openPage('work', 'miya');
  await (await buttonByText('scene builder')).click();
  const select = await $('select[aria-label="Project"]');
  await select.waitForExist({ timeout: 60000 });
  await select.selectByAttribute('value', projectId);
  await $('section[aria-label="AI clips"]').waitForDisplayed({ timeout: 60000 });
}

describe('Alphonso desktop: AI clips', () => {
  let outputFolder = '';
  let projectId = '';

  before(async function () {
    this.timeout(300000);
    await enterShell();
    outputFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'alphonso-clips-'));
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
    await name.setValue('AI clips check');
    await (await buttonByText('create')).click();
    await browser.waitUntil(async () => (await savedProjects()).some((p) => p.name === 'AI clips check'), { timeout: 30000 });
    const project = (await savedProjects()).find((p) => p.name === 'AI clips check');
    const brand = (await savedBrands()).find((b) => b.id === project.brandId);
    projectId = project.id;
    const dir = `${brand.folderName}/${project.folderName}`;
    // Scene pictures, as ComfyUI would have made them.
    const scenesDir = path.join(outputFolder, ...dir.split('/'), 'scenes');
    fs.mkdirSync(scenesDir, { recursive: true });
    if (fs.existsSync(VENDOR_FFMPEG)) {
      for (const id of ['s1', 's2']) {
        execFileSync(VENDOR_FFMPEG, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=s=832x480', '-frames:v', '1', path.join(scenesDir, `v1-${id}.png`)], { windowsHide: true });
      }
    }
    await browser.execute((id, d) => {
      const projects = JSON.parse(localStorage.getItem('alphonso_content_projects_v1') || '[]');
      const p = projects.find((x) => x.id === id);
      p.brief = { ...p.brief, idea: 'Why good coffee takes time', platforms: ['YouTube'] };
      const v = (output) => ({ version: 1, createdAtMs: Date.now(), output, summary: '', joseCommandId: null, stale: false, basedOn: {} });
      Object.assign(p.steps.scenes, { status: 'done', chosenVersion: 1, error: null, versions: [v({
        miya: { style: 'warm morning light', scenes: [
          { id: 's1', startSec: 0, endSec: 3, description: 'A barista pours coffee into a white cup', movement: 'slow push in', mainMoment: true },
          { id: 's2', startSec: 3, endSec: 6, description: 'Steam rises from the cup', mainMoment: false },
        ] },
        pictures: [
          { sceneId: 's1', status: 'done', relativePath: `${d}/scenes/v1-s1.png` },
          { sceneId: 's2', status: 'done', relativePath: `${d}/scenes/v1-s2.png` },
        ],
      })] });
      localStorage.setItem('alphonso_content_projects_v1', JSON.stringify(projects));
    }, projectId, dir);
    await browser.refresh();
    await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
    await keepOutputFolder(outputFolder);
    await openSceneBuilder(projectId);
  });

  after(() => {
    if (outputFolder) fs.rmSync(outputFolder, { recursive: true, force: true });
  });

  it('saves the main moments and the AI clip settings', async function () {
    this.timeout(120000);
    const box = await $('input[aria-label="Main moment: Scene 2"]');
    await box.waitForExist({ timeout: 30000 });
    expect(await box.isSelected()).toBe(false);
    await box.click();
    await browser.waitUntil(async () => (await projectById(projectId)).steps.scenes.versions[0].output.miya.scenes[1].mainMoment === true, { timeout: 10000 });
    await box.click();
    await (await $('select[aria-label="AI clips for"]')).selectByAttribute('value', 'every');
    await browser.waitUntil(async () => (await projectById(projectId)).videoSettings?.aiClips === 'every', { timeout: 10000 });
    await (await $('select[aria-label="AI clips for"]')).selectByAttribute('value', 'main');
    await browser.waitUntil(async () => (await projectById(projectId)).videoSettings?.aiClips === 'main', { timeout: 10000 });
  });

  it('runs the AI clips step: a real clip when a video model is installed, else says what to set up', async function () {
    this.timeout(2400000);
    const info = await invoke('comfyui_video_models', { savedDir: null });
    const installed = (info.models || []).some((m) => m.installed);
    const run = await $('//section[@aria-label="AI clips"]//button[normalize-space(.)="Run" or normalize-space(.)="Run again" or normalize-space(.)="Retry"]');
    await run.waitForClickable({ timeout: 30000 });
    await run.click();
    await browser.waitUntil(async () => ['done', 'failed'].includes((await projectById(projectId)).steps.clips?.status), {
      timeout: 2300000, interval: 3000, timeoutMsg: 'the AI clips step did not finish',
    });
    const clips = await projectById(projectId);
    expect(clips.steps.clips.status).toBe('done');
    const output = clips.steps.clips.versions[clips.steps.clips.versions.length - 1].output.miya;
    if (!installed) {
      expect(output.skipped).toBe(NO_ENGINE);
      await browser.waitUntil(async () => (await $('section[aria-label="AI clips"]').getText()).includes(NO_ENGINE), { timeout: 30000 });
      return;
    }
    // A real local clip for the one main moment, playing in the Scene Builder.
    expect(output.engine).toBe('local');
    expect(output.clips.map((c) => c.sceneId)).toEqual(['s1']);
    expect(output.clips[0].status).toBe('done');
    await browser.waitUntil(async () => browser.execute(() => {
      const video = document.querySelector('section[aria-label="AI clips"] video');
      if (!video) return false;
      if (video.readyState < 1) video.load();
      return video.readyState >= 1 && video.duration > 0;
    }), { timeout: 60000, timeoutMsg: 'the clip did not load in the Scene Builder' });
  });

  it("shows Runtime Hub's video models with the card's memory", async function () {
    this.timeout(120000);
    await openPage('system', 'runtimes');
    await browser.waitUntil(async () => {
      const text = await browser.execute(() => document.querySelector('section[aria-label="Video models"]')?.innerText || '');
      return /Your card: \d+ GB|No NVIDIA graphics card was found/.test(text) && text.includes('LTX-Video 2B') && text.includes('Wan 2.2 5B');
    }, { timeout: 90000, timeoutMsg: 'the video models were not shown on the ComfyUI card' });
  });
});
