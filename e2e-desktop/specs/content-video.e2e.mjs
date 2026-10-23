// The finished video (Miya content factory phase 2a, 2026-10-23). A project
// whose script and scenes are already approved (seeded, so no model is needed)
// runs Voice, Stock clips, Music and Finished video through Jose in the real
// app. Test runs use their own Runtime Hub folder, so Kokoro and AudioCraft are
// not installed there: Voice must fail saying how to fix it, Music and Stock
// clips must be skipped saying why. A voice track is then seeded and the real
// assembly runs with the bundled ffmpeg: both MP4s exist with the voice's
// length, and the Scene Builder shows the two players. Skipped without ffmpeg.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { enterShell, invoke, buttonByText, openPage } from '../helpers.mjs';

const VENDOR_FFMPEG = path.resolve('src-tauri/vendor/ffmpeg');

function tool(name) {
  const bundled = path.join(VENDOR_FFMPEG, process.platform === 'win32' ? `${name}.exe` : name);
  if (fs.existsSync(bundled)) return bundled;
  try {
    execFileSync(name, ['-version'], { stdio: 'ignore', windowsHide: true });
    return name;
  } catch {
    return null;
  }
}

const savedProjects = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_content_projects_v1') || '[]'));
const savedBrands = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_content_brands_v1') || '[]'));
const stepState = async (id, step) => (await savedProjects()).find((p) => p.id === id)?.steps?.[step];
const sectionText = async (label) => browser.execute((name) => document.querySelector(`section[aria-label="${name}"]`)?.innerText || '', label);

/** The app can write its settings over ours while it starts; wait until the output folder sticks. */
async function keepOutputFolder(folder) {
  await browser.waitUntil(async () => browser.execute((wanted) => {
    const settings = JSON.parse(localStorage.getItem('alphonso_settings') || '{}');
    if (settings.outputFolder === wanted) return true;
    localStorage.setItem('alphonso_settings', JSON.stringify({ ...settings, outputFolder: wanted }));
    return false;
  }, folder), { timeout: 30000, interval: 1000, timeoutMsg: 'the output folder setting did not stick' });
}

async function runStep(label) {
  const button = await $(`//section[@aria-label="${label}"]//button[normalize-space(.)="Run" or normalize-space(.)="Retry" or normalize-space(.)="Run again"]`);
  await button.waitForClickable({ timeout: 60000 });
  await button.click();
}

async function waitForStep(id, step, statuses, timeout) {
  await browser.waitUntil(async () => statuses.includes((await stepState(id, step))?.status), {
    timeout, interval: 2000, timeoutMsg: `the ${step} step did not finish`,
  });
  return stepState(id, step);
}

describe('Alphonso desktop: Miya makes the finished video', () => {
  let outputFolder = '';
  let ffmpeg = null;
  let ffprobe = null;
  let projectId = '';
  let dir = '';

  before(async function () {
    this.timeout(300000);
    ffmpeg = tool('ffmpeg');
    ffprobe = tool('ffprobe');
    await enterShell();
    if (!ffmpeg || !ffprobe) this.skip();
    outputFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'alphonso-video-'));
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

    // A project made in Miya Studio, then given an approved script and scenes.
    await openPage('work', 'miya');
    const name = await $('input[aria-label="New project name"]');
    await name.waitForDisplayed({ timeout: 60000 });
    await name.setValue('Finished video check');
    await (await buttonByText('create')).click();
    await browser.waitUntil(async () => (await savedProjects()).some((p) => p.name === 'Finished video check'), { timeout: 30000 });
    const project = (await savedProjects()).find((p) => p.name === 'Finished video check');
    const brand = (await savedBrands()).find((b) => b.id === project.brandId);
    projectId = project.id;
    dir = `${brand.folderName}/${project.folderName}`;

    const abs = (rel) => path.join(outputFolder, ...rel.split('/'));
    fs.mkdirSync(abs(`${dir}/scenes`), { recursive: true });
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=s=1280x720', '-frames:v', '1', abs(`${dir}/scenes/v1-s1.png`)], { windowsHide: true });

    await browser.execute((id, d) => {
      const projects = JSON.parse(localStorage.getItem('alphonso_content_projects_v1') || '[]');
      const p = projects.find((x) => x.id === id);
      const v = (output) => ({ version: 1, createdAtMs: Date.now(), output, summary: '', joseCommandId: null, stale: false, basedOn: {} });
      p.brief = { ...p.brief, idea: 'Why good coffee takes time', platforms: ['YouTube'] };
      const set = (step, output, status = 'done') => Object.assign(p.steps[step], { status, versions: [v(output)], chosenVersion: 1, error: null });
      set('script', { miya: { hooks: ['a', 'b', 'c'], chosenHook: 0, title: 'T', script: [
        { startSec: 0, endSec: 3, spoken: 'Hello there.' }, { startSec: 3, endSec: 6, spoken: 'Second part.' },
      ] } });
      set('review', { nova: {}, maria: {} }, 'approved');
      set('scenes', { miya: { style: 'plain', scenes: [
        { id: 's1', startSec: 0, endSec: 3, description: 'A barista pours coffee', imagePrompt: 'x' },
        { id: 's2', startSec: 3, endSec: 6, description: 'People smile', imagePrompt: 'y' },
      ] }, pictures: [{ sceneId: 's1', status: 'done', relativePath: `${d}/scenes/v1-s1.png` }] });
      localStorage.setItem('alphonso_content_projects_v1', JSON.stringify(projects));
    }, projectId, dir);
    await browser.refresh();
    await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
    await keepOutputFolder(outputFolder);
    await openPage('work', 'miya');
    await (await buttonByText('scene builder')).click();
    const select = await $('select[aria-label="Project"]');
    await select.waitForExist({ timeout: 60000 });
    await select.selectByAttribute('value', projectId);
    await $('section[aria-label="Voice-over"]').waitForDisplayed({ timeout: 60000 });
  });

  after(() => {
    if (outputFolder) fs.rmSync(outputFolder, { recursive: true, force: true });
  });

  it('Voice, Music and Stock clips say what they need when it is not installed or set', async function () {
    this.timeout(600000);
    const status = await invoke('media_tools_status');
    await runStep('Voice-over');
    const voice = await waitForStep(projectId, 'voice', ['done', 'failed'], 300000);
    if (status.kokoro) expect(voice.status).toBe('done');
    else expect(voice.error).toContain('Install Kokoro in Runtime Hub.');

    await runStep('Stock clips');
    const broll = await waitForStep(projectId, 'broll', ['done', 'failed'], 300000);
    expect(broll.status).toBe('done');
    expect(await sectionText('Stock clips')).toMatch(/No stock footage keys are set|Pexels|Pixabay|Coverr/);

    if (!status.audiocraft) {
      await runStep('Music');
      const music = await waitForStep(projectId, 'music', ['done', 'failed'], 300000);
      expect(music.status).toBe('done');
      expect(await sectionText('Music')).toContain('AudioCraft is not installed.');
    }
  });

  it('assembles both videos with the bundled ffmpeg and shows them', async function () {
    this.timeout(900000);
    // A voice track, as Kokoro would have made it.
    const voiceRel = `${dir}/audio/voice-v1/full.wav`;
    const voiceAbs = path.join(outputFolder, ...voiceRel.split('/'));
    fs.mkdirSync(path.dirname(voiceAbs), { recursive: true });
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=f=330:d=6', voiceAbs], { windowsHide: true });
    await browser.execute((id, rel) => {
      const projects = JSON.parse(localStorage.getItem('alphonso_content_projects_v1') || '[]');
      const p = projects.find((x) => x.id === id);
      const output = { miya: { full: rel, durationSec: 6, lines: [
        { sceneId: 's1', text: 'Hello there.', startSec: 0, endSec: 3, path: null },
        { sceneId: 's2', text: 'Second part.', startSec: 3, endSec: 6, path: null },
      ] } };
      Object.assign(p.steps.voice, { status: 'done', error: null, chosenVersion: 1,
        versions: [{ version: 1, createdAtMs: Date.now(), output, summary: '', joseCommandId: null, stale: false, basedOn: {} }] });
      localStorage.setItem('alphonso_content_projects_v1', JSON.stringify(projects));
    }, projectId, voiceRel);
    await browser.refresh();
    await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
    await keepOutputFolder(outputFolder);
    await openPage('work', 'miya');
    await (await buttonByText('scene builder')).click();
    await (await $('select[aria-label="Project"]')).selectByAttribute('value', projectId);
    await $('section[aria-label="Finished video"]').waitForDisplayed({ timeout: 60000 });

    await runStep('Finished video');
    const assemble = await waitForStep(projectId, 'assemble', ['done', 'failed'], 800000);
    expect(assemble.error).toBeNull();
    expect(assemble.status).toBe('done');
    for (const aspect of ['16x9', '9x16']) {
      const file = path.join(outputFolder, ...dir.split('/'), 'output', `v1-${aspect}.mp4`);
      expect(fs.existsSync(file)).toBe(true);
      const seconds = Number(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { windowsHide: true }).toString().trim());
      expect(Math.abs(seconds - 6)).toBeLessThanOrEqual(1);
    }
    expect(fs.readFileSync(path.join(outputFolder, ...dir.split('/'), 'output', 'v1.srt'), 'utf8')).toMatch(/^1\r?\n00:00:00,000 --> [\s\S]*Hello[\s\S]*there\.[\s\S]*Second[\s\S]*part\./);
    await browser.waitUntil(async () => (await $$('section[aria-label="Finished video"] video')).length === 2, { timeout: 30000 });
    const sources = await browser.execute(() => [...document.querySelectorAll('section[aria-label="Finished video"] video')].map((v) => v.getAttribute('src') || ''));
    expect(sources.every((src) => /asset/.test(src) && src.includes('.mp4'))).toBe(true);
    // The window can really load them (the output folder is in the asset protocol's scope).
    await browser.execute(() => document.querySelectorAll('section[aria-label="Finished video"] video').forEach((v) => v.load()));
    await browser.waitUntil(async () => browser.execute(() => [...document.querySelectorAll('section[aria-label="Finished video"] video')]
      .every((v) => v.readyState >= 1 && Math.abs(v.duration - 6) <= 1)), { timeout: 30000, timeoutMsg: 'the window could not load the videos' });
  });
});
