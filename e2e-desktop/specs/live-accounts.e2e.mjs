// The live check with the owner's own accounts, run by hand (QA batch 1, owner 2026-10-28).
// Skipped unless you set these (paths and numbers only; the keys never go on a command line):
//   ALPHONSO_LIVE_SLACK_TOKEN_FILE        a file holding a Slack Bot User OAuth Token (xoxb-…)
//   ALPHONSO_LIVE_SLACK_CHANNEL           the channel to post to, e.g. #test (the bot must be in it)
//   ALPHONSO_LIVE_ELEVENLABS_KEY_FILE     a file holding an ElevenLabs API key
//   ALPHONSO_LIVE_ELEVENLABS_PRICE_PER_1K your ElevenLabs price per 1,000 characters, USD
//   ALPHONSO_LIVE_SPEND_CAP_USD           the month's spending cap for the paid check, USD
// Each key is read from its file here and typed into the test app's Settings, as a user would;
// it lives only in this run's throwaway profile. The Slack check posts one real message; the
// ElevenLabs check makes one short voice-over (one line), after its estimate is approved.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { enterShell, invoke, mainText, buttonByText, openPage, keepOutputFolder, ollamaHasModels, warmSelectedModel, clickSend } from '../helpers.mjs';

const readKey = (file) => (file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : '');
const SLACK_TOKEN = readKey(process.env.ALPHONSO_LIVE_SLACK_TOKEN_FILE);
const SLACK_CHANNEL = String(process.env.ALPHONSO_LIVE_SLACK_CHANNEL || '').trim();
const ELEVEN_KEY = readKey(process.env.ALPHONSO_LIVE_ELEVENLABS_KEY_FILE);
const ELEVEN_PRICE = Number(process.env.ALPHONSO_LIVE_ELEVENLABS_PRICE_PER_1K);
const SPEND_CAP = Number(process.env.ALPHONSO_LIVE_SPEND_CAP_USD);
const PREFERRED_TEST_MODEL = process.env.ALPHONSO_E2E_MODEL || 'qwen2.5:7b';

const savedRequests = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_requests_v1') || '[]'));
const stepOutputs = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_step_outputs_v1') || '{}'));
const savedProjects = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_content_projects_v1') || '[]'));
const savedBrands = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_content_brands_v1') || '[]'));

async function installedModels() {
  try {
    const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
    return r.ok ? ((await r.json()).models || []).map((m) => m.name) : [];
  } catch {
    return [];
  }
}

async function useSettings(values) {
  const loaded = await invoke('load_settings');
  const saved = JSON.parse((loaded.ok && loaded.value) || '{}');
  await invoke('save_settings', { settingsJson: JSON.stringify({ ...saved, ...values }) });
  await browser.execute((v) => {
    const settings = JSON.parse(localStorage.getItem('alphonso_settings') || '{}');
    localStorage.setItem('alphonso_settings', JSON.stringify({ ...settings, ...v }));
  }, values);
  await browser.refresh();
  await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
}

/** Settings → Connectors, one field typed, then that section's Save & Enable. */
async function saveConnectorField(placeholder, value, more = {}) {
  await $('[aria-label="Open settings"]').click();
  const connectors = await $('//nav//button[normalize-space(.)="Connectors"]');
  await connectors.waitForClickable({ timeout: 30000 });
  await connectors.click();
  let field = await $(`input[placeholder="${placeholder}"]`);
  if (!(await field.isExisting())) {
    // A closed category: open the one that holds it.
    for (const id of ['content', 'automation', 'search', 'ai_models']) {
      const toggle = await $(`[data-testid="connector-category-${id}"]`);
      if (await toggle.isExisting()) await toggle.click();
      field = await $(`input[placeholder="${placeholder}"]`);
      if (await field.isExisting()) break;
    }
  }
  await field.waitForDisplayed({ timeout: 30000 });
  await field.scrollIntoView();
  await field.setValue(value);
  for (const [other, text] of Object.entries(more)) await (await $(`input[placeholder="${other}"]`)).setValue(text);
  const saves = await $$('//button[normalize-space(.)="Save & Enable"]');
  for (const save of saves) {
    if (await browser.execute((a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING), field, save)) {
      await save.click();
      return;
    }
  }
  throw new Error(`no Save & Enable after "${placeholder}"`);
}

async function newestRequest(before) {
  return (await savedRequests()).find((r) => !before.has(r.id));
}

async function approveOnBoard(stepId) {
  await openPage('system', 'orchestrator');
  await (await $('//main//button[normalize-space(.)="Requests"]')).click();
  const approve = await $(`//main//button[starts-with(normalize-space(.), "Approve and carry on")]`);
  await approve.waitForClickable({ timeout: 60000 });
  await approve.click();
  console.log('LIVE approved', stepId);
}

describe('Alphonso desktop: the live check with your own accounts', () => {
  before(async function () {
    if (!SLACK_TOKEN && !ELEVEN_KEY) this.skip();
    await enterShell();
  });

  it('posts one approved message to your Slack channel, exactly once', async function () {
    this.timeout(2400000);
    if (!SLACK_TOKEN || !SLACK_CHANNEL || !(await ollamaHasModels())) this.skip();
    const model = (await installedModels()).includes(PREFERRED_TEST_MODEL) ? { selectedModel: PREFERRED_TEST_MODEL } : {};
    await useSettings({ showPlanFirst: 'never', ...model });
    await saveConnectorField('xoxb-...', SLACK_TOKEN, { '#team (optional)': SLACK_CHANNEL });
    await browser.waitUntil(async () => /slack saved/i.test(await mainText()), { timeout: 60000, timeoutMsg: 'Slack was not saved' });
    await warmSelectedModel();

    const before = new Set((await savedRequests()).map((r) => r.id));
    await $('[data-testid="sidebar-chat-shortcut"]').click();
    const input = await $('[data-testid="chat-compose-input"]');
    await input.waitForDisplayed();
    await input.setValue(`/jose Write a one-line note that the Alphonso QA live check worked, and post it to Slack ${SLACK_CHANNEL}`);
    await clickSend();

    let request;
    await browser.waitUntil(async () => {
      request = await newestRequest(before);
      const marcus = request?.steps.find((s) => s.agent === 'marcus');
      return Boolean(marcus && (marcus.status === 'waiting_approval' || ['done', 'failed', 'setup_needed'].includes(marcus.status)));
    }, { timeout: 1800000, interval: 3000, timeoutMsg: 'Marcus never reached his send' });
    const marcus = request.steps.find((s) => s.agent === 'marcus');
    console.log('LIVE slack before', JSON.stringify({ status: marcus.status, label: marcus.sendPreview?.label, chars: marcus.sendPreview?.text?.length, error: marcus.error }));
    expect(marcus.status).toBe('waiting_approval');
    expect(marcus.sendPreview?.label).toBe(`Slack ${SLACK_CHANNEL}`);
    expect(String(marcus.sendPreview?.text || '').length).toBeGreaterThan(0);

    await approveOnBoard(marcus.stepId);
    await browser.waitUntil(async () => {
      request = (await savedRequests()).find((r) => r.id === request.id);
      return !['running', 'waiting_approval', 'queued'].includes(request.status);
    }, { timeout: 600000, interval: 3000, timeoutMsg: 'the request did not finish after approval' });
    const done = request.steps.find((s) => s.agent === 'marcus');
    const output = (await stepOutputs())[request.commandId]?.steps?.[done.stepId];
    console.log('LIVE slack after', JSON.stringify({ request: request.status, step: done.status, summary: output?.summary, platformId: output?.schema?.platformId }));
    expect(done.status).toBe('done');
    expect(output.summary).toContain(`Sent to Slack ${SLACK_CHANNEL}.`);
    expect(output.schema?.platformId).toBeTruthy();
    expect(done.sentAtMs).toBeGreaterThan(0);
  });

  it('makes one short ElevenLabs voice-over after its estimate is approved, and records the cost', async function () {
    this.timeout(1800000);
    if (!ELEVEN_KEY || !(ELEVEN_PRICE > 0) || !(SPEND_CAP > 0)) this.skip();
    const outputFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'alphonso-live-voice-'));
    try {
      await useSettings({
        outputFolder, showPlanFirst: 'never', zeroCostMode: false, approvalMode: true,
        paidModels: { allowed: true, elevenLabsPricePer1kCharsUsd: ELEVEN_PRICE, monthlyCapUsd: SPEND_CAP },
      });
      await keepOutputFolder(outputFolder);
      await saveConnectorField('Your ElevenLabs API key', ELEVEN_KEY);
      await browser.waitUntil(async () => /elevenlabs saved/i.test(await mainText()), { timeout: 60000, timeoutMsg: 'ElevenLabs was not saved' });
      const listed = await invoke('elevenlabs_voices', { keyOverride: ELEVEN_KEY });
      const voices = listed?.value?.voices || listed?.voices || [];
      console.log('LIVE eleven voices', JSON.stringify({ ok: listed?.value?.ok ?? listed?.ok, count: voices.length }));
      expect(voices.length).toBeGreaterThan(0);

      // A project with one approved line, its brand's voice set to ElevenLabs (as the Brands tab would).
      await openPage('work', 'miya');
      const name = await $('input[aria-label="New project name"]');
      await name.waitForDisplayed({ timeout: 60000 });
      await name.setValue('Live voice check');
      await (await buttonByText('create')).click();
      await browser.waitUntil(async () => (await savedProjects()).some((p) => p.name === 'Live voice check'), { timeout: 30000 });
      const project = (await savedProjects()).find((p) => p.name === 'Live voice check');
      await browser.execute((id, voiceId) => {
        const projects = JSON.parse(localStorage.getItem('alphonso_content_projects_v1') || '[]');
        const p = projects.find((x) => x.id === id);
        const v = (output) => ({ version: 1, createdAtMs: Date.now(), output, summary: '', joseCommandId: null, stale: false, basedOn: {} });
        p.brief = { ...p.brief, idea: 'A live voice check', platforms: ['YouTube'] };
        const set = (step, output, status = 'done') => Object.assign(p.steps[step], { status, versions: [v(output)], chosenVersion: 1, error: null });
        set('script', { miya: { hooks: ['a', 'b', 'c'], chosenHook: 0, title: 'T', script: [{ startSec: 0, endSec: 3, spoken: 'This is a short live check.' }] } });
        set('review', { nova: {}, maria: {} }, 'approved');
        set('scenes', { miya: { style: 'plain', scenes: [{ id: 's1', startSec: 0, endSec: 3, description: 'A title card', imagePrompt: 'x' }] }, pictures: [] });
        localStorage.setItem('alphonso_content_projects_v1', JSON.stringify(projects));
        const brands = JSON.parse(localStorage.getItem('alphonso_content_brands_v1') || '[]');
        const b = brands.find((x) => x.id === p.brandId);
        b.engines = { ...(b.engines || {}), voice: { engine: 'elevenlabs', voiceId } };
        localStorage.setItem('alphonso_content_brands_v1', JSON.stringify(brands));
      }, project.id, voices[0].id);
      await browser.refresh();
      await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
      await keepOutputFolder(outputFolder);

      const before = new Set((await savedRequests()).map((r) => r.id));
      await openPage('work', 'miya');
      await (await buttonByText('scene builder')).click();
      const select = await $('select[aria-label="Project"]');
      await select.waitForExist({ timeout: 60000 });
      await select.selectByAttribute('value', project.id);
      const run = await $('//section[@aria-label="Voice-over"]//button[normalize-space(.)="Run" or normalize-space(.)="Retry" or normalize-space(.)="Run again"]');
      await run.waitForClickable({ timeout: 60000 });
      await run.click();

      let request;
      await browser.waitUntil(async () => {
        request = await newestRequest(before);
        return Boolean(request && request.steps.some((s) => ['waiting_approval', 'done', 'failed', 'setup_needed'].includes(s.status)));
      }, { timeout: 300000, interval: 3000, timeoutMsg: 'the voice step never started' });
      const waiting = request.steps.find((s) => s.status === 'waiting_approval');
      console.log('LIVE eleven before', JSON.stringify({ status: request.status, steps: request.steps.map((s) => [s.stepId, s.status, s.costEstimateUsd, s.error]) }));
      expect(waiting).toBeTruthy();
      await approveOnBoard(waiting.stepId);

      let voice;
      await browser.waitUntil(async () => {
        voice = (await savedProjects()).find((p) => p.id === project.id)?.steps?.voice;
        return ['done', 'failed'].includes(voice?.status);
      }, { timeout: 900000, interval: 3000, timeoutMsg: 'the voice step did not finish' });
      const chosen = voice.versions?.[voice.versions.length - 1]?.output;
      const spent = await browser.execute(() => { try { return JSON.parse(localStorage.getItem('alphonso_jose_spend_v1') || '{}').totalUsd || 0; } catch { return 0; } });
      console.log('LIVE eleven after', JSON.stringify({ status: voice.status, error: voice.error, engine: chosen?.engine, note: chosen?.note, words: (chosen?.words || []).length, spent }));
      expect(voice.status).toBe('done');
      expect(chosen?.engine).toBe('elevenlabs');
      expect(spent).toBeGreaterThan(0);
      expect(spent).toBeLessThanOrEqual(SPEND_CAP);
    } finally {
      fs.rmSync(outputFolder, { recursive: true, force: true });
    }
  });
});
