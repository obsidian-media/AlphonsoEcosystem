// The live check with the owner's own accounts, run by hand (QA batch 1, owner 2026-10-28).
// Skipped unless you set these (paths and numbers only; the keys never go on a command line):
//   ALPHONSO_LIVE_SLACK_TOKEN_FILE        a file holding a Slack Bot User OAuth Token (xoxb-…)
//   ALPHONSO_LIVE_SLACK_CHANNEL           the channel to post to, e.g. #test (the bot must be in it)
//   ALPHONSO_LIVE_ELEVENLABS_KEY_FILE     a file holding an ElevenLabs API key
//   ALPHONSO_LIVE_ELEVENLABS_PRICE_PER_1K your ElevenLabs price per 1,000 characters, USD
//   ALPHONSO_LIVE_SPEND_CAP_USD           the month's spending cap for the paid check, USD
//   ALPHONSO_LIVE_GITHUB_TOKEN_FILE       a file holding a GitHub token that may open issues
//   ALPHONSO_LIVE_GITHUB_REPO             owner/repo for the one test issue (close it afterwards)
//   ALPHONSO_LIVE_NOTION_TOKEN_FILE       a file holding a Notion integration secret
//   ALPHONSO_LIVE_NOTION_PAGE_FILE        a file holding the id of a page shared with it
//   ALPHONSO_LIVE_CLICKUP_KEY_FILE / ALPHONSO_LIVE_CLICKUP_LIST_FILE  a ClickUp key and a test list id
//   ALPHONSO_LIVE_TAVILY_KEY_FILE / ALPHONSO_LIVE_BRAVE_KEY_FILE  search keys for Hector
//   ALPHONSO_LIVE_PEXELS_KEY_FILE / _PIXABAY_KEY_FILE / _COVERR_KEY_FILE  stock footage keys (free)
//   ALPHONSO_LIVE_NVIDIA_KEY_FILE / ALPHONSO_LIVE_GEMINI_KEY_FILE  free-tier cloud model keys
//   ALPHONSO_LIVE_COMPOSIO_KEY_FILE       a Composio API key (read only: its toolkits are listed)
//   ALPHONSO_LIVE_HIGGSFIELD_KEY_ID_FILE / _KEY_SECRET_FILE  Higgsfield keys; with
//   ALPHONSO_LIVE_HIGGSFIELD_PICTURE_MODEL / _CLIP_MODEL      model ids: only Higgsfield's estimate is asked, nothing is made
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
const GITHUB_TOKEN = readKey(process.env.ALPHONSO_LIVE_GITHUB_TOKEN_FILE);
const GITHUB_REPO = String(process.env.ALPHONSO_LIVE_GITHUB_REPO || '').trim();
const NOTION_TOKEN = readKey(process.env.ALPHONSO_LIVE_NOTION_TOKEN_FILE);
const NOTION_PAGE = readKey(process.env.ALPHONSO_LIVE_NOTION_PAGE_FILE);
const CLICKUP_KEY = readKey(process.env.ALPHONSO_LIVE_CLICKUP_KEY_FILE);
const CLICKUP_LIST = readKey(process.env.ALPHONSO_LIVE_CLICKUP_LIST_FILE);
const TAVILY_KEY = readKey(process.env.ALPHONSO_LIVE_TAVILY_KEY_FILE);
const BRAVE_KEY = readKey(process.env.ALPHONSO_LIVE_BRAVE_KEY_FILE);
const STOCK_KEYS = {
  pexels: { key: readKey(process.env.ALPHONSO_LIVE_PEXELS_KEY_FILE), placeholder: 'Your Pexels API key', saved: /pexels key saved/i },
  pixabay: { key: readKey(process.env.ALPHONSO_LIVE_PIXABAY_KEY_FILE), placeholder: 'Your Pixabay API key', saved: /pixabay key saved/i },
  coverr: { key: readKey(process.env.ALPHONSO_LIVE_COVERR_KEY_FILE), placeholder: 'Your Coverr API key', saved: /coverr key saved/i },
};
const CLOUD_KEYS = {
  nvidia_nim: { key: readKey(process.env.ALPHONSO_LIVE_NVIDIA_KEY_FILE), placeholder: 'nvapi-...', saved: /nvidia nim key saved/i, tab: 'NVIDIA NIM' },
  gemini: { key: readKey(process.env.ALPHONSO_LIVE_GEMINI_KEY_FILE), placeholder: 'AIza...', section: 'Google Gemini', saved: /gemini key saved/i, tab: 'Gemini' },
};
const COMPOSIO_KEY = readKey(process.env.ALPHONSO_LIVE_COMPOSIO_KEY_FILE);
const HF_KEY_ID = readKey(process.env.ALPHONSO_LIVE_HIGGSFIELD_KEY_ID_FILE);
const HF_SECRET = readKey(process.env.ALPHONSO_LIVE_HIGGSFIELD_KEY_SECRET_FILE);
const HF_PICTURE = String(process.env.ALPHONSO_LIVE_HIGGSFIELD_PICTURE_MODEL || '').trim();
const HF_CLIP = String(process.env.ALPHONSO_LIVE_HIGGSFIELD_CLIP_MODEL || '').trim();
const PREFERRED_TEST_MODEL = process.env.ALPHONSO_E2E_MODEL || 'qwen2.5:7b';

const savedRequests = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_requests_v1') || '[]'));
const stepOutputs = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_step_outputs_v1') || '{}'));
const savedProjects = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_content_projects_v1') || '[]'));

async function installedModels() {
  // A busy Ollama can take more than a few seconds to list its models: a short single try left
  // the test model unset, and the app planned with a 0.6B model instead (QA batch 1).
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(10000) });
      if (r.ok) return ((await r.json()).models || []).map((m) => m.name);
    } catch { /* tried again below */ }
    await new Promise((done) => setTimeout(done, 5000));
  }
  return [];
}

/** The test model when it is installed, else {} (the app's own choice). */
async function testModel() {
  return (await installedModels()).includes(PREFERRED_TEST_MODEL) ? { selectedModel: PREFERRED_TEST_MODEL } : {};
}

/** Fails when the app isn't on the model the test set. */
async function expectModel(model) {
  if (!model.selectedModel) return;
  const using = await browser.execute(() => JSON.parse(localStorage.getItem('alphonso_settings') || '{}').selectedModel);
  if (using !== model.selectedModel) throw new Error(`the app is on ${using}, not the test model ${model.selectedModel}`);
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
async function saveConnectorField(placeholder, value, more = {}, { section } = {}) {
  await $('[aria-label="Open settings"]').click();
  const connectors = await $('//nav//button[normalize-space(.)="Connectors"]');
  await connectors.waitForClickable({ timeout: 30000 });
  await connectors.click();
  // Two connectors can share a placeholder (Gemini and Google Web Risk both take "AIza..."):
  // `section` names the heading the field sits under.
  const selector = section
    ? `//*[normalize-space(text())="${section}"]/following::input[@placeholder="${placeholder}"][1]`
    : `input[placeholder="${placeholder}"]`;
  const findField = async () => (await $$(selector))[0];
  let field = await findField();
  if (!field || !(await field.isExisting())) {
    // A closed category: open the one that holds it.
    for (const id of ['content', 'automation', 'search', 'ai_models']) {
      const toggle = await $(`[data-testid="connector-category-${id}"]`);
      if (await toggle.isExisting()) await toggle.click();
      field = await findField();
      if (field && (await field.isExisting())) break;
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

/** The app's log for one connector: event names and reasons only (never a key). */
async function connectorLog(id) {
  return browser.execute((cid) => {
    try {
      const rows = JSON.parse(localStorage.getItem('alphonso_connector_audit_v2') || '[]');
      return rows.filter((r) => r.connectorId === cid || r.connector === cid).slice(-8)
        .map((r) => [r.eventType || r.event || r.type || r.action || null, r.details?.reason || r.details?.error || r.error || r.reason || null]);
    } catch { return []; }
  }, id);
}

/** Sends one Chat request and waits until `ready(request)` says it got far enough. */
async function askInChat(text, ready, what) {
  const model = await testModel();
  await useSettings({ showPlanFirst: 'never', ...model });
  await expectModel(model);
  await warmSelectedModel();
  const before = new Set((await savedRequests()).map((r) => r.id));
  await $('[data-testid="sidebar-chat-shortcut"]').click();
  const input = await $('[data-testid="chat-compose-input"]');
  await input.waitForDisplayed();
  await input.setValue(text);
  await clickSend();
  let request;
  await browser.waitUntil(async () => {
    request = await newestRequest(before);
    return Boolean(request && ready(request));
  }, { timeout: 1800000, interval: 3000, timeoutMsg: `${what} never got there` });
  return request;
}

/** One request whose Marcus send waits with `label`, approved on the board, then finished. */
async function marcusSends(name, text, label) {
  const settled = (s) => ['waiting_approval', 'done', 'failed', 'setup_needed'].includes(s?.status);
  let request = await askInChat(text, (r) => settled(r.steps.find((s) => s.agent === 'marcus')), `${name}: Marcus's send`);
  const marcus = request.steps.find((s) => s.agent === 'marcus');
  console.log(`LIVE ${name} before`, JSON.stringify({ status: marcus.status, label: marcus.sendPreview?.label, chars: marcus.sendPreview?.text?.length, error: marcus.error }));
  expect(marcus.status).toBe('waiting_approval');
  expect(marcus.sendPreview?.label).toBe(label);
  await approveOnBoard(marcus.stepId);
  await browser.waitUntil(async () => {
    request = (await savedRequests()).find((r) => r.id === request.id);
    return !['running', 'waiting_approval', 'queued'].includes(request.status);
  }, { timeout: 600000, interval: 3000, timeoutMsg: `${name}: the request did not finish after approval` });
  const done = request.steps.find((s) => s.agent === 'marcus');
  const output = (await stepOutputs())[request.commandId]?.steps?.[done.stepId];
  return { done, output };
}

describe('Alphonso desktop: the live check with your own accounts', () => {
  // Temporary output folders are removed at the end, not after each check: Settings still points
  // at the last one, and a later step writing there failed with "(os error 2)" (QA batch 1).
  const tempFolders = [];
  after(() => { for (const f of tempFolders) fs.rmSync(f, { recursive: true, force: true }); });

  before(async function () {
    if (![...Object.values(STOCK_KEYS), ...Object.values(CLOUD_KEYS)].some((s) => s.key) && !COMPOSIO_KEY && !HF_KEY_ID && !SLACK_TOKEN && !ELEVEN_KEY && !GITHUB_TOKEN && !NOTION_TOKEN && !CLICKUP_KEY && !TAVILY_KEY && !BRAVE_KEY) this.skip();
    await enterShell();
  });

  it('posts one approved message to your Slack channel, exactly once', async function () {
    if (!SLACK_TOKEN || !SLACK_CHANNEL || !(await ollamaHasModels())) this.skip();
    const model = await testModel();
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
    // What stopped it, if anything: the step's own reason and the app's Slack log (event names only).
    const audit = await browser.execute(() => {
      try {
        const rows = JSON.parse(localStorage.getItem('alphonso_connector_audit_v2') || '[]');
        return rows.filter((r) => r.connectorId === 'slack' || r.connector === 'slack').slice(-8)
          .map((r) => [r.eventType || r.event || r.type, r.details?.reason || r.details?.error || r.error || r.reason || null]);
      } catch { return []; }
    });
    console.log('LIVE slack after', JSON.stringify({ request: request.status, step: done.status, error: done.error, summary: output?.summary, platformId: output?.schema?.platformId, audit }));
    expect(done.status).toBe('done');
    expect(output.summary).toContain(`Sent to Slack ${SLACK_CHANNEL}.`);
    expect(output.schema?.platformId).toBeTruthy();
    expect(done.sentAtMs).toBeGreaterThan(0);
  }).timeout(2400000);

  it('makes one short ElevenLabs voice-over after its estimate is approved, and records the cost', async function () {
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
      try {
        await browser.waitUntil(async () => {
          voice = (await savedProjects()).find((p) => p.id === project.id)?.steps?.voice;
          return ['done', 'failed'].includes(voice?.status);
        }, { timeout: 900000, interval: 3000 });
      } catch {
        const after = (await savedRequests()).find((r) => r.id === request.id);
        console.log('LIVE eleven stuck', JSON.stringify({
          voice: { status: voice?.status, error: voice?.error, progress: voice?.progress },
          request: after?.status, steps: after?.steps.map((s) => [s.stepId, s.status, s.error]),
        }));
        throw new Error('the voice step did not finish');
      }
      // A step's version keeps each agent's answer under its name (Miya's here).
      const saved = voice.versions?.[voice.versions.length - 1]?.output;
      const chosen = saved?.miya || saved;
      const spent = await browser.execute(() => { try { return JSON.parse(localStorage.getItem('alphonso_jose_spend_v1') || '{}').totalUsd || 0; } catch { return 0; } });
      console.log('LIVE eleven after', JSON.stringify({ status: voice.status, error: voice.error, engine: chosen?.engine, note: chosen?.note, words: (chosen?.words || []).length, spent }));
      expect(voice.status).toBe('done');
      expect(chosen?.engine).toBe('elevenlabs');
      expect(spent).toBeGreaterThan(0);
      expect(spent).toBeLessThanOrEqual(SPEND_CAP);
    } finally {
      tempFolders.push(outputFolder);
    }
  }).timeout(1800000);

  it('opens one approved issue in your GitHub test repository', async function () {
    if (!GITHUB_TOKEN || !GITHUB_REPO || !(await ollamaHasModels())) this.skip();
    await saveConnectorField('ghp_...', GITHUB_TOKEN, { 'owner/repo (optional)': GITHUB_REPO });
    await browser.waitUntil(async () => /github saved/i.test(await mainText()), { timeout: 60000, timeoutMsg: 'GitHub was not saved' });
    const { done, output } = await marcusSends('github', `/jose Write a one-line note that the Alphonso QA live check ran, and open it as an issue in GitHub ${GITHUB_REPO}`, `GitHub ${GITHUB_REPO}`);
    console.log('LIVE github after', JSON.stringify({ step: done.status, error: done.error, summary: output?.summary, link: output?.resultUrl || output?.schema?.link || null, platformId: output?.schema?.platformId || null, log: await connectorLog('github') }));
    expect(done.status).toBe('done');
  }).timeout(2400000);

  it('writes one approved page in your Notion', async function () {
    if (!NOTION_TOKEN || !NOTION_PAGE || !(await ollamaHasModels())) this.skip();
    await saveConnectorField('secret_...', NOTION_TOKEN, { 'Page UUID (optional)': NOTION_PAGE });
    await browser.waitUntil(async () => /notion saved/i.test(await mainText()), { timeout: 60000, timeoutMsg: 'Notion was not saved' });
    const { done, output } = await marcusSends('notion', '/jose Write a one-line note that the Alphonso QA live check ran, and save it to Notion', 'Notion');
    console.log('LIVE notion after', JSON.stringify({ step: done.status, error: done.error, summary: output?.summary, link: output?.resultUrl || output?.schema?.link || null, log: await connectorLog('notion') }));
    expect(done.status).toBe('done');
  }).timeout(2400000);

  it('makes one approved task in your ClickUp list', async function () {
    if (!CLICKUP_KEY || !CLICKUP_LIST || !(await ollamaHasModels())) this.skip();
    await saveConnectorField('pk_...', CLICKUP_KEY, { 'Found in the list URL (optional)': CLICKUP_LIST });
    await browser.waitUntil(async () => /clickup credentials saved/i.test(await mainText()), { timeout: 60000, timeoutMsg: 'ClickUp was not saved' });
    const { done, output } = await marcusSends('clickup', '/jose Write a one-line note that the Alphonso QA live check ran, and add it as a task in ClickUp', 'ClickUp');
    console.log('LIVE clickup after', JSON.stringify({ step: done.status, error: done.error, summary: output?.summary, link: output?.resultUrl || output?.schema?.link || null, log: await connectorLog('clickup') }));
    expect(done.status).toBe('done');
  }).timeout(2400000);

  it('researches with your Tavily and Brave keys and cites what it read', async function () {
    if ((!TAVILY_KEY && !BRAVE_KEY) || !(await ollamaHasModels())) this.skip();
    if (TAVILY_KEY) {
      await saveConnectorField('tvly-...', TAVILY_KEY);
      await browser.waitUntil(async () => /tavily saved/i.test(await mainText()), { timeout: 60000, timeoutMsg: 'Tavily was not saved' });
    }
    if (BRAVE_KEY) {
      await saveConnectorField('BSA...', BRAVE_KEY);
      await browser.waitUntil(async () => /brave\S* saved/i.test(await mainText()), { timeout: 60000, timeoutMsg: 'Brave was not saved' });
    }
    const finished = (s) => ['done', 'failed', 'setup_needed'].includes(s?.status);
    const request = await askInChat('/jose Research what the IANA example domain is used for and give me a short cited answer.',
      (r) => finished(r.steps.find((s) => s.agent === 'hector')), "Hector's research");
    const hector = request.steps.find((s) => s.agent === 'hector');
    const output = (await stepOutputs())[request.commandId]?.steps?.[hector.stepId];
    const sources = output?.schema?.sources || output?.sources || [];
    console.log('LIVE research', JSON.stringify({ step: hector.status, error: hector.error, sources: sources.length, tavily: await connectorLog('tavily'), brave: await connectorLog('brave_search') }));
    expect(hector.status).toBe('done');
    expect(sources.length).toBeGreaterThan(0);
  }).timeout(2400000);

  // Miya's B-roll step: search each stock source you have a key for and download one clip, through
  // the same backend commands the step uses (fixed endpoints, those download hosts only).
  it('finds and downloads a stock clip from each source you have a key for', async function () {
    const sources = Object.entries(STOCK_KEYS).filter(([, s]) => s.key);
    if (!sources.length) this.skip();
    const outputFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'alphonso-live-stock-'));
    try {
      await keepOutputFolder(outputFolder);
      const results = {};
      for (const [source, s] of sources) {
        await saveConnectorField(s.placeholder, s.key);
        await browser.waitUntil(async () => s.saved.test(await mainText()), { timeout: 60000, timeoutMsg: `${source} was not saved` });
        // invoke() answers { ok, value } or { ok: false, error }: the search result is the value.
        const searched = await invoke('content_stock_search', { request: { source, query: 'ocean waves', orientation: 'landscape', apiKey: s.key } });
        if (!searched.ok) { results[source] = { hits: 0, downloadedBytes: 0, error: String(searched.error).slice(0, 200) }; continue; }
        const body = searched.value;
        const hits = source === 'pexels' ? (body?.videos || []) : (body?.hits || body?.videos || []);
        const first = hits[0];
        const url = source === 'pexels'
          ? (first?.video_files || []).filter((f) => f.file_type === 'video/mp4').sort((a, b) => a.width - b.width)[0]?.link
          : source === 'pixabay' ? (first?.videos?.small?.url || first?.videos?.medium?.url) : first?.urls?.mp4_download;
        const relPath = `broll/live-${source}.mp4`;
        let downloaded = 0;
        let error = null;
        if (url) {
          try {
            const got = await invoke('content_download_media', { request: {
              workspaceRoot: outputFolder, url, relPath,
              ...(source === 'coverr' ? { coverrId: String(first.id), apiKey: s.key } : {}),
            } });
            if (!got.ok) error = String(got.error).slice(0, 200);
            const file = path.join(outputFolder, relPath);
            downloaded = fs.existsSync(file) ? fs.statSync(file).size : 0;
          } catch (e) { error = String(e?.message || e).slice(0, 200); }
        }
        results[source] = { hits: hits.length, downloadedBytes: downloaded, error };
      }
      console.log('LIVE stock', JSON.stringify(results));
      for (const [source] of sources) {
        expect(results[source].hits).toBeGreaterThan(0);
        expect(results[source].downloadedBytes).toBeGreaterThan(50000);
      }
    } finally {
      tempFolders.push(outputFolder);
    }
  }).timeout(900000);

  // NVIDIA NIM and Gemini (free tiers): the provider picked in Chat answers a plain question.
  it('answers a plain question in Chat with NVIDIA NIM and with Gemini', async function () {
    const providers = Object.entries(CLOUD_KEYS).filter(([, c]) => c.key);
    if (!providers.length) this.skip();
    const results = {};
    try {
      for (const [id, c] of providers) {
        await saveConnectorField(c.placeholder, c.key, {}, { section: c.section });
        await browser.waitUntil(async () => c.saved.test(await mainText()), { timeout: 60000, timeoutMsg: `${id} was not saved` });
        const ollamaModel = (await browser.execute(() => JSON.parse(localStorage.getItem('alphonso_settings') || '{}'))).selectedModel;
        await $('[data-testid="sidebar-chat-shortcut"]').click();
        // Settings has the same provider tabs (one row per agent): wait for Chat, then take Chat's.
        await $('[data-testid="chat-compose-input"]').waitForDisplayed({ timeout: 30000 });
        let tab;
        await browser.waitUntil(async () => {
          for (const t of await $$(`button[title="${c.tab}"]`)) if (await t.isDisplayed({ withinViewport: true })) { tab = t; return true; }
          return false;
        }, { timeout: 30000, timeoutMsg: `Chat's ${c.tab} tab is not on screen` });
        await tab.waitForClickable({ timeout: 30000 });
        await tab.click();
        // The picker chooses the provider's first model once its list loads.
        await browser.waitUntil(async () => {
          const settings = await browser.execute(() => JSON.parse(localStorage.getItem('alphonso_settings') || '{}'));
          // A model of this provider's, not the Ollama model still saved (it passed with llama3.2:3b).
          return settings.selectedProvider === id && Boolean(settings.selectedModel) && settings.selectedModel !== ollamaModel;
        }, { timeout: 60000, timeoutMsg: `${c.tab} picked no model of its own` });
        const model = (await browser.execute(() => JSON.parse(localStorage.getItem('alphonso_settings') || '{}'))).selectedModel;
        const before = (await $$('[data-testid="chat-message-assistant"]')).length;
        const input = await $('[data-testid="chat-compose-input"]');
        await input.waitForDisplayed();
        await input.setValue('What is the capital of France? Answer in one word.');
        await clickSend();
        let reply = '';
        await browser.waitUntil(async () => {
          const replies = await $$('[data-testid="chat-message-assistant"]');
          if (replies.length <= before) return false;
          reply = (await replies[replies.length - 1].getText()).trim();
          return reply.length > 0 && !/^\.*$/.test(reply);
        }, { timeout: 180000, interval: 2000, timeoutMsg: `${c.tab} gave no reply` });
        results[id] = { model, reply: reply.slice(0, 160) };
      }
    } catch (e) {
      console.log('LIVE cloud failed', JSON.stringify(results), String(e?.message || e).slice(0, 300));
      throw e;
    } finally {
      // Back to Ollama for the next checks; a failure here must not hide the check's own error.
      try {
        for (const ollama of await $$('button[title="Ollama"]')) {
          if (await ollama.isDisplayed({ withinViewport: true })) { await browser.execute((el) => el.click(), ollama); break; }
        }
      } catch (e) { console.log('LIVE cloud: could not switch back to Ollama:', String(e?.message || e).slice(0, 200)); }
    }
    console.log('LIVE cloud', JSON.stringify(results));
    for (const [id] of providers) expect(results[id].reply).toMatch(/paris/i);
  }).timeout(900000);

  // Composio, read only: Save checks the key with Composio and lists the toolkits. Nothing runs.
  it('checks your Composio key and lists its toolkits', async function () {
    if (!COMPOSIO_KEY) this.skip();
    await $('[aria-label="Open settings"]').click();
    const connectors = await $('//nav//button[normalize-space(.)="Connectors"]');
    await connectors.waitForClickable({ timeout: 30000 });
    await connectors.click();
    const field = await $('input[placeholder="Enter Composio API key"]');
    await field.waitForDisplayed({ timeout: 30000 });
    await field.scrollIntoView();
    await field.setValue(COMPOSIO_KEY);
    await (await $('//input[@placeholder="Enter Composio API key"]/following::button[1]')).click();
    let text = '';
    await browser.waitUntil(async () => {
      text = await mainText();
      return /Available Toolkits \((\d+)\)/.test(text) || /composio.*(fail|invalid|error|unauthor)/i.test(text);
    }, { timeout: 120000, interval: 2000, timeoutMsg: 'Composio gave no answer' });
    const count = Number((text.match(/Available Toolkits \((\d+)\)/) || [])[1] || 0);
    console.log('LIVE composio', JSON.stringify({ toolkits: count, healthy: !/composio.*(fail|invalid|error|unauthor)/i.test(text) }));
    expect(count).toBeGreaterThan(0);
  }).timeout(300000);

  // Higgsfield, estimate only (owner, 2026-10-29): Test asks Higgsfield's price; nothing is made or charged.
  it("gets Higgsfield's estimate for your picture and clip models", async function () {
    if (!HF_KEY_ID || !HF_SECRET || (!HF_PICTURE && !HF_CLIP)) this.skip();
    await saveConnectorField('Your Higgsfield key id', HF_KEY_ID, {
      'Your Higgsfield key secret': HF_SECRET,
      ...(HF_PICTURE ? { 'e.g. higgsfield-ai/soul/v2/standard': HF_PICTURE } : {}),
      ...(HF_CLIP ? { 'e.g. kling-video/v2.1/pro/image-to-video': HF_CLIP } : {}),
    });
    await browser.waitUntil(async () => /higgsfield settings saved/i.test(await mainText()), { timeout: 60000, timeoutMsg: 'Higgsfield was not saved' });
    const results = {};
    for (const [what, model] of [['picture', HF_PICTURE], ['clip', HF_CLIP]]) {
      if (!model) continue;
      // The answer shows beside the buttons, after "Open the Higgsfield Console".
      const answer = '//button[normalize-space(.)="Open the Higgsfield Console"]/following-sibling::span[1]';
      const shown = async () => ((await $(answer).isExisting()) ? (await $(answer).getText()).trim() : '');
      const before = await shown();
      await (await buttonByText(`Test ${what} model`)).click();
      // The answer can read the same as the last model's (the same refusal), so a new answer is
      // one seen after "Checking…", or after 20 s with no change.
      const started = Date.now();
      let sawChecking = false;
      let line = '';
      await browser.waitUntil(async () => {
        line = await shown();
        if (line === 'Checking…') { sawChecking = true; return false; }
        return Boolean(line) && (sawChecking || line !== before || Date.now() - started > 20000);
      }, { timeout: 120000, interval: 300, timeoutMsg: `Higgsfield gave no estimate for the ${what} model` });
      results[what] = { model, line };
    }
    console.log('LIVE higgsfield', JSON.stringify(results));
    for (const what of Object.keys(results)) expect(results[what].line).toMatch(/model works: about \$/i);
  }).timeout(600000);
});
