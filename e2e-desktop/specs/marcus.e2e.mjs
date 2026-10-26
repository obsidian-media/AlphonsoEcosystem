// Agent phase 5 (Marcus), in the real app (2026-10-26): a send to Slack with no Slack key says
// what to set up and asks nothing; a readiness question asks nothing; a note sent to your n8n
// workflow waits with the exact text, is approved on the board, and a local server standing in
// for n8n receives exactly that text once; and Jose's own plan has no copied placeholder.
// Nothing is sent to a real service. Needs a local model; uses qwen2.5:7b when installed.
import http from 'node:http';
import { enterShell, invoke, ollamaHasModels, warmSelectedModel, mainText, buttonByText } from '../helpers.mjs';

const PREFERRED_TEST_MODEL = 'qwen2.5:7b';
const received = [];
let server;
let port = 0;

async function installedModels() {
  try {
    const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
    return ((await r.json()).models || []).map((m) => m.name);
  } catch { return []; }
}

const requests = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_requests_v1') || '[]'))
  .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
const packets = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_agent_bus_packets_v1') || '[]'));
const outputs = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_step_outputs_v1') || '{}'));

async function approvalShown() {
  const deny = await $('button[aria-label="Deny action"]');
  return (await deny.isExisting()) && (await deny.isDisplayed());
}

async function ask(text) {
  const before = (await requests())[0]?.id;
  await $('[data-testid="sidebar-chat-shortcut"]').click();
  const input = await $('[data-testid="chat-compose-input"]');
  await input.waitForDisplayed();
  await input.setValue(text);
  await (await $('[data-testid="chat-send-button"]')).click();
  let asked = false;
  try {
    await browser.waitUntil(async () => {
      if (await approvalShown()) { asked = true; await (await $('button[aria-label="Deny action"]')).click(); }
      const r = (await requests())[0];
      return r && r.id !== before && !r.steps.some((s) => ['running', 'pending', 'queued'].includes(s.status)) && r.status !== 'running';
    }, { timeout: 1500000, interval: 4000 });
  } catch {
    const r = (await requests())[0];
    throw new Error(`the request never finished: ${JSON.stringify({ status: r?.status, steps: (r?.steps || []).map((s) => [s.stepId, s.agent, s.actionType, s.status]) })}`);
  }
  return { request: (await requests())[0], asked };
}

async function saveN8n() {
  await $('[aria-label="Open settings"]').click();
  await browser.waitUntil(async () => /API CREDENTIALS|General/.test(await mainText()), { timeout: 30000 });
  await buttonByText('Connectors').click();
  await (await $('[data-testid="connector-category-automation"]')).click();
  const base = await $('//main//input[@aria-label="n8n Base URL"]');
  await base.waitForExist({ timeout: 30000 });
  await base.scrollIntoView();
  await base.setValue(`http://127.0.0.1:${port}`);
  await (await $('//main//input[@aria-label="Where Marcus sends: your workflows"]')).setValue('Team notes: team-notes');
  const section = await base.$('./ancestor::div[contains(@class, "rounded-2xl")][1]');
  await (await section.$('.//button[contains(normalize-space(.), "Save")]')).click();
  await browser.pause(1500);
  await $('[data-testid="sidebar-chat-shortcut"]').click();
}

describe('Alphonso desktop: Marcus sends what you approved', () => {
  before(async function () {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        // The window's JSON POST is preceded by the browser's CORS preflight (OPTIONS), as with a real n8n.
        if (req.method === 'POST') received.push({ url: req.url, body });
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
    await enterShell();
    if (!(await ollamaHasModels())) this.skip();
    const extra = { showPlanFirst: 'never', ...((await installedModels()).includes(PREFERRED_TEST_MODEL) ? { selectedModel: PREFERRED_TEST_MODEL } : {}) };
    const loaded = await invoke('load_settings');
    const saved = JSON.parse((loaded.ok && loaded.value) || '{}');
    await invoke('save_settings', { settingsJson: JSON.stringify({ ...saved, ...extra }) });
    await browser.execute((values) => {
      const settings = JSON.parse(localStorage.getItem('alphonso_settings') || '{}');
      localStorage.setItem('alphonso_settings', JSON.stringify({ ...settings, ...values }));
    }, extra);
    await browser.refresh();
    await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
    await warmSelectedModel();
    await $('[data-testid="sidebar-chat-shortcut"]').click();
  });

  after(() => server?.close());

  it('Slack with no key says what to set up and asks nothing', async () => {
    const { request, asked } = await ask('/jose Post a short note that we open at 9 to Slack #news.');
    const marcus = request.steps.find((s) => s.agent === 'marcus');
    console.log('MARCUS-E2E slack', JSON.stringify(request.steps.map((s) => [s.stepId, s.agent, s.actionType, s.status, s.error])));
    expect(marcus).toBeTruthy();
    expect(marcus.status).toBe('setup_needed');
    expect(asked).toBe(false);
    expect(JSON.stringify(request)).toContain("Slack isn't set up: add the bot token in Settings → Connectors → Slack.");
  }).timeout(1600000);

  it('a readiness question answers and asks nothing', async () => {
    const { request, asked } = await ask('/jose Is my announcement ready to post on Slack?');
    const marcus = request.steps.find((s) => s.agent === 'marcus');
    const summary = String((await outputs())[request.commandId]?.steps?.[marcus?.stepId]?.summary || '');
    console.log('MARCUS-E2E ready', JSON.stringify({ steps: request.steps.map((s) => [s.stepId, s.agent, s.actionType, s.status]), summary: summary.slice(0, 600) }));
    expect(marcus?.actionType).toBe('distribution_readiness');
    expect(summary.startsWith('Not ready:')).toBe(true);
    expect(asked).toBe(false);
  }).timeout(1600000);

  it('a note to your n8n workflow waits with the exact text, and n8n gets exactly that once', async () => {
    await saveN8n();
    const { request } = await ask('/jose Write a one-line note that the shop opens at 9 and send it to my n8n workflow Team notes.');
    const marcus = request.steps.find((s) => s.agent === 'marcus' && s.status === 'waiting_approval');
    const marcusAny = request.steps.find((s) => s.agent === 'marcus');
    const packet = (await packets()).find((p) => p.payload?.joseCommandId === request.commandId && p.toAgent === 'marcus');
    console.log('MARCUS-E2E n8n', JSON.stringify({ marcusAny, failure: packet?.failureReason, packetStatus: packet?.status }));
    expect(marcus).toBeTruthy();
    expect(marcus.sendPreview.connector).toBe('n8n');
    expect(marcus.note.startsWith('Start your n8n workflow Team notes with: “')).toBe(true);
    const links = await $$('//main//button[normalize-space(.)="Open on the board"]');
    await links[links.length - 1].click();
    await browser.waitUntil(async () => (await mainText()).includes('Waiting for your approval'), { timeout: 30000 });
    await (await $('//main//button[starts-with(normalize-space(.), "Approve and carry on")]')).click();
    await browser.waitUntil(async () => received.length > 0, { timeout: 120000, interval: 1000, timeoutMsg: 'n8n never received the send' });
    await browser.pause(3000);
    console.log('MARCUS-E2E received', JSON.stringify(received));
    expect(received).toHaveLength(1);
    expect(received[0].url).toBe('/webhook/team-notes');
    expect(JSON.parse(received[0].body).text).toBe(marcus.sendPreview.text);
  }).timeout(1600000);

  it("Jose's own plan has no copied placeholder", async () => {
    const { request } = await ask('Plan this fresh: research two facts about tea and write one line about them.');
    console.log('MARCUS-E2E plan', JSON.stringify({ plan: request.plan, steps: request.steps.map((s) => [s.stepId, s.agent, s.actionType]) }));
    expect(JSON.stringify(request.plan || {})).not.toContain('short_id');
    expect(request.steps.some((s) => s.stepId === 'short_id')).toBe(false);
  }).timeout(1600000);
});
