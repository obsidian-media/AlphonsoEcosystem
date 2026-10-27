// Miya content factory (phase 1, 2026-10-22): a project for a brand runs
// Research (Hector + Nova) and then the Script (Miya) through Jose with a real
// local model, and the project is saved in <output folder>/<brand>/<project>/.
// When ComfyUI is running, the Thumbnail Studio also makes its 3 thumbnails.
// Skipped when no Ollama model is reachable.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { enterShell, invoke, mainText, buttonByText, openPage, ollamaHasModels } from '../helpers.mjs';

const STEP_TIMEOUT = 15 * 60 * 1000;
// The factory's answers need a model that follows a JSON format reliably;
// measured 2026-10-22: qwen2.5:7b 20/20, llama3.2:3b 13/20. Use it when it is
// installed (test profile only).
// CI's model run sets ALPHONSO_E2E_MODEL (Jose phase 7); locally the 7B model when installed.
const PREFERRED_TEST_MODEL = process.env.ALPHONSO_E2E_MODEL || 'qwen2.5:7b';

async function installedModels() {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
    const data = await response.json();
    return (data.models || []).map((m) => m.name);
  } catch {
    return [];
  }
}

async function comfyRunning() {
  try {
    const response = await fetch('http://127.0.0.1:8188/system_stats', { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}

/** The section of a step (StepPanel's aria-label) and its status badge text. */
async function stepText(label) {
  return browser.execute((name) => {
    const section = document.querySelector(`section[aria-label="${name}"]`);
    return section ? section.innerText : '';
  }, label);
}

async function runStep(label) {
  const button = await $(`section[aria-label="${label}"] button`);
  await button.waitForClickable();
  await button.click();
  await browser.waitUntil(async () => {
    const text = await stepText(label);
    return /\bDone\b|\bFailed\b|Waiting for your approval/.test(text);
  }, { timeout: STEP_TIMEOUT, interval: 3000, timeoutMsg: `${label} did not finish within 15 minutes` });
  return stepText(label);
}

describe('Alphonso desktop content factory', () => {
  let outputFolder = '';

  before(async function () {
    await enterShell();
    if (!(await ollamaHasModels())) this.skip();
    outputFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'alphonso-content-'));
    // Settings saved in the backend are merged in at start (useBootEffects), so
    // the folder is saved there too, as the Settings page does.
    const loaded = await invoke('load_settings');
    const saved = JSON.parse((loaded.ok && loaded.value) || '{}');
    const model = (await installedModels()).includes(PREFERRED_TEST_MODEL) ? PREFERRED_TEST_MODEL : undefined;
    const extra = { outputFolder, ...(model ? { selectedModel: model } : {}) };
    const stored = await invoke('save_settings', { settingsJson: JSON.stringify({ ...saved, ...extra }) });
    expect(stored.ok).toBe(true);
    await browser.execute((values) => {
      const settings = JSON.parse(localStorage.getItem('alphonso_settings') || '{}');
      localStorage.setItem('alphonso_settings', JSON.stringify({ ...settings, ...values }));
    }, extra);
    await browser.refresh();
    await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
    await openPage('work', 'miya');
  });

  after(() => {
    // ALPHONSO_E2E_KEEP_OUTPUT=1 keeps the project folder so the pictures can be looked at.
    if (process.env.ALPHONSO_E2E_KEEP_OUTPUT === '1') {
      console.log(`content-factory output kept in ${outputFolder}`);
      return;
    }
    if (outputFolder) fs.rmSync(outputFolder, { recursive: true, force: true });
  });

  it('creates a project and writes its brief', async () => {
    const name = await $('input[aria-label="New project name"]');
    await name.waitForDisplayed({ timeout: 60000 });
    await name.setValue('Why we procrastinate');
    await (await buttonByText('create')).click();
    const idea = await $('textarea[aria-label="Idea"]');
    await idea.waitForDisplayed();
    await idea.setValue('A 45 second video on why we procrastinate and one trick that helps, for adults learning English.');
    await (await $('input[aria-label="Platforms"]')).setValue('YouTube');
    await (await $('input[aria-label="What to make"]')).setValue('Long video');
    await (await buttonByText('save brief')).click();
    expect(await mainText()).toContain('Script Studio');
  });

  it('runs Research through Hector and Nova', async () => {
    const text = await runStep('Research');
    expect(text).toContain('Done');
  });

  it('writes the script and saves the project in its folder', async () => {
    const text = await runStep('Script');
    expect(text).toContain('Done');
    const main = await mainText();
    expect(main).toMatch(/Spoken/i);
    const brandDirs = fs.readdirSync(outputFolder);
    expect(brandDirs.length).toBe(1);
    const projectDir = path.join(outputFolder, brandDirs[0], 'why-we-procrastinate');
    expect(fs.existsSync(path.join(projectDir, 'project.json'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'script', 'v1.md'))).toBe(true);
  });

  it('makes three finished thumbnails when ComfyUI is running', async function () {
    if (!(await comfyRunning())) this.skip();
    await (await buttonByText('thumbnail studio')).click();
    const text = await runStep('Thumbnails');
    expect(text).toContain('Done');
    await browser.waitUntil(async () => (await $$('main img[alt^="Thumbnail:"]')).length === 3, {
      timeout: STEP_TIMEOUT, interval: 5000, timeoutMsg: 'the 3 thumbnails did not appear',
    });
    const dir = path.join(outputFolder, fs.readdirSync(outputFolder)[0], 'why-we-procrastinate', 'thumbnail');
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.png')).length).toBe(3);
  });
});
