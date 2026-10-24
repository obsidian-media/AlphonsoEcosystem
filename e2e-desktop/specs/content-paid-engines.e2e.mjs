// Paid engines in the content factory (phase 4b), in the real app, with nothing paid sent.
// Zero-Cost Mode stays on throughout, so Higgsfield and ElevenLabs are never called:
// Connectors → Higgsfield refuses extra settings that aren't a JSON object (checked
// before anything is sent); the Brands tab saves an ElevenLabs voice choice (no key, so
// it says what to set up) and Higgsfield pictures; with a local model, a Scenes run then
// makes its pictures with ComfyUI and says why not Higgsfield.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { enterShell, invoke, mainText, buttonByText, openPage, ollamaHasModels } from '../helpers.mjs';

const ZERO_COST_NOTE = 'Higgsfield is off while Zero-Cost Mode is on; made with ComfyUI.';
const savedBrands = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_content_brands_v1') || '[]'));
const savedProjects = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_content_projects_v1') || '[]'));

async function stepText(label) {
  return browser.execute((name) => document.querySelector(`section[aria-label="${name}"]`)?.innerText || '', label);
}

describe('Alphonso desktop: paid engines, nothing paid sent', () => {
  let outputFolder = '';

  before(async function () {
    this.timeout(300000);
    await enterShell();
    outputFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'alphonso-paid-'));
    const loaded = await invoke('load_settings');
    const saved = JSON.parse((loaded.ok && loaded.value) || '{}');
    const extra = { outputFolder, zeroCostMode: true };
    expect((await invoke('save_settings', { settingsJson: JSON.stringify({ ...saved, ...extra }) })).ok).toBe(true);
    await browser.execute((values) => {
      const settings = JSON.parse(localStorage.getItem('alphonso_settings') || '{}');
      localStorage.setItem('alphonso_settings', JSON.stringify({ ...settings, ...values }));
    }, extra);
    await browser.refresh();
    await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
  });

  after(() => {
    if (outputFolder) fs.rmSync(outputFolder, { recursive: true, force: true });
  });

  it('Connectors → Higgsfield refuses extra settings that are not a JSON object', async function () {
    this.timeout(120000);
    await $('[aria-label="Open settings"]').click();
    await browser.waitUntil(async () => /API CREDENTIALS|General/.test(await mainText()), { timeout: 30000 });
    await buttonByText('Connectors').click();
    await $('[data-testid="connector-category-content"]').click();
    const keyId = await $('input[placeholder="Your Higgsfield key id"]');
    await keyId.waitForExist({ timeout: 30000 });
    await keyId.scrollIntoView();
    // Never real keys: Zero-Cost Mode is on, and the Test below stops before sending.
    await keyId.setValue('test-key-id');
    await (await $('input[placeholder="Your Higgsfield key secret"]')).setValue('test-key-secret');
    await (await $('input[placeholder="e.g. higgsfield-ai/soul/v2/standard"]')).setValue('higgsfield-ai/soul/v2/standard');
    await (await $('input[aria-label="Picture model extra settings (JSON)"]')).setValue('[1, 2]');
    await (await buttonByText('Test picture model')).click();
    await browser.waitUntil(async () => (await mainText()).includes('The picture model’s extra settings are not valid JSON.'), {
      timeout: 20000, timeoutMsg: 'the extra settings were not refused',
    });
    await (await $('input[aria-label="Picture model extra settings (JSON)"]')).setValue('{}');
    const section = await keyId.$('./ancestor::div[contains(@class, "rounded-2xl")][1]');
    await (await section.$('.//button[contains(normalize-space(.), "Save")]')).click();
    await browser.waitUntil(async () => /Higgsfield settings saved/.test(await mainText()), { timeout: 30000, timeoutMsg: 'the Higgsfield settings were not saved' });
  });

  it('the Brands tab saves an ElevenLabs voice choice and Higgsfield pictures', async function () {
    this.timeout(120000);
    await enterShell();
    await openPage('work', 'miya');
    await (await buttonByText('Brands')).click();
    const voice = await $('select[aria-label="Voice engine"]');
    await voice.waitForExist({ timeout: 30000 });
    await voice.selectByAttribute('value', 'elevenlabs');
    // No ElevenLabs key in a test profile: the screen says what to set up.
    await browser.waitUntil(async () => (await mainText()).includes('Add your ElevenLabs key in Settings → Connectors → ElevenLabs.'), {
      timeout: 20000, timeoutMsg: 'the ElevenLabs set-up message did not show',
    });
    await (await $('select[aria-label="Pictures made by"]')).selectByAttribute('value', 'higgsfield');
    await (await buttonByText('Save brand')).click();
    await browser.waitUntil(async () => (await savedBrands()).some((b) => b.engines?.voice?.engine === 'elevenlabs' && b.engines?.pictures === 'higgsfield'), {
      timeout: 20000, timeoutMsg: 'the engines were not saved on the brand',
    });
  });

  it('with Zero-Cost Mode on, a Scenes run makes its pictures with ComfyUI and says why', async function () {
    this.timeout(20 * 60 * 1000);
    if (!(await ollamaHasModels())) this.skip();
    await (await buttonByText('Scene Builder')).click();
    const name = await $('input[aria-label="New project name"]');
    await name.waitForDisplayed({ timeout: 60000 });
    await name.setValue('Paid engines check');
    await (await buttonByText('create')).click();
    const idea = await $('textarea[aria-label="Idea"]');
    await idea.waitForDisplayed();
    await idea.setValue('A 20 second video on why coffee cools down, for curious adults.');
    await (await $('input[aria-label="What to make"]')).setValue('Long video');
    await (await buttonByText('save brief')).click();
    const run = await $('section[aria-label="Scenes"] button');
    await run.waitForClickable({ timeout: 60000 });
    await run.click();
    await browser.waitUntil(async () => /\bDone\b|\bFailed\b/.test(await stepText('Scenes')), {
      timeout: 15 * 60 * 1000, interval: 3000, timeoutMsg: 'Scenes did not finish',
    });
    if (/\bFailed\b/.test(await stepText('Scenes'))) this.skip(); // the model's answer, not what this checks
    const project = (await savedProjects()).find((p) => p.name === 'Paid engines check');
    const scenes = project.steps.scenes;
    const chosen = scenes.versions.find((v) => v.version === scenes.chosenVersion) || scenes.versions[scenes.versions.length - 1];
    await browser.waitUntil(async () => {
      const latest = (await savedProjects()).find((p) => p.id === project.id).steps.scenes;
      const version = latest.versions.find((v) => v.version === chosen.version);
      return version?.output?.pictureNote === ZERO_COST_NOTE;
    }, { timeout: 10 * 60 * 1000, interval: 3000, timeoutMsg: 'the pictures did not say why ComfyUI made them' });
    expect(await mainText()).toContain(ZERO_COST_NOTE);
  });
});
