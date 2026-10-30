// Outside tools (MCP) in the real app (2026-10-30): a stand-in MCP server on this computer
// (e2e-desktop/fixtures/mcpStandIn.mjs) is listed through the real backend, a tool is marked
// "Reading only" in Settings, a reading request uses it without asking, a change waits on the
// board with its exact call and runs once after approval, and a Paid server is blocked in
// Zero-Cost Mode. The backend accepts a local http server only in a debug build under a test
// profile with ALPHONSO_E2E_MCP_LOCAL=1 (set by wdio.conf.mjs for this spec). Nothing real is
// called. The model steps need a local model and skip without one.
import { enterShell, invoke, ollamaHasModels, warmSelectedModel, mainText, buttonByText, needsLargerModel } from '../helpers.mjs';
import { startMcpStandIn } from '../fixtures/mcpStandIn.mjs';

const PREFERRED_TEST_MODEL = process.env.ALPHONSO_E2E_MODEL || 'qwen2.5:7b';
const SERVERS_KEY = 'alphonso_mcp_servers_v1';
let standIn;

async function installedModels() {
  try {
    const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
    return ((await r.json()).models || []).map((m) => m.name);
  } catch { return []; }
}

const servers = async () => JSON.parse(await browser.execute((k) => localStorage.getItem(k) || '[]', SERVERS_KEY));
const setServers = (list) => browser.execute((k, v) => localStorage.setItem(k, v), SERVERS_KEY, JSON.stringify(list));
const requests = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_requests_v1') || '[]'))
  .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));

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
  const send = await $('[data-testid="chat-send-button"]');
  await send.waitForEnabled({ timeout: 30000 });
  await send.click();
  let asked = false;
  await browser.waitUntil(async () => {
    if (await approvalShown()) { asked = true; await (await $('button[aria-label="Deny action"]')).click(); }
    const r = (await requests())[0];
    return r && r.id !== before && !r.steps.some((s) => ['running', 'pending', 'queued'].includes(s.status)) && r.status !== 'running';
  }, { timeout: 1500000, interval: 4000, timeoutMsg: `the request never finished: ${text}` });
  return { request: (await requests())[0], asked };
}

async function openOutsideTools() {
  await $('[aria-label="Open settings"]').click();
  await browser.waitUntil(async () => /API CREDENTIALS|General/.test(await mainText()), { timeout: 30000 });
  await buttonByText('Connectors').click();
  const category = await $('[data-testid="connector-category-outside_tools"]');
  await category.waitForExist({ timeout: 30000 });
  await category.scrollIntoView();
  await category.click();
  await $('[data-testid="outside-tools-section"]').waitForDisplayed({ timeout: 30000 });
}

describe('Alphonso desktop: outside tools (MCP)', () => {
  before(async () => {
    standIn = await startMcpStandIn();
    await enterShell();
    // The Settings form takes https addresses only; the stand-in is a local http server, so it is
    // added straight to the saved list, as the form would save it.
    await setServers([{ id: 'shop', name: 'Shop', url: standIn.url, signIn: 'none', cost: 'free', enabled: true, tools: [] }]);
    await browser.refresh();
    await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
  });

  after(async () => { await standIn?.close(); });

  it('the backend refuses a plain http address on the internet', async () => {
    const r = await invoke('mcp_list_tools', { serverId: 'probe', url: 'http://example.com/mcp', version: null });
    const text = JSON.stringify(r);
    console.log('MCP-E2E http', text.slice(0, 300));
    expect(r.ok && r.value?.ok).toBeFalsy();
    expect(text).toMatch(/https/);
  });

  it('Settings lists the stand-in’s tools through the real backend, and a tool is marked Reading only', async () => {
    await openOutsideTools();
    const row = await $('[data-testid="mcp-server-shop"]');
    await row.waitForDisplayed({ timeout: 30000 });
    await (await row.$('.//button[normalize-space(.)="Refresh tools"]')).click();
    await browser.waitUntil(async () => (await servers())[0]?.tools?.length === 2, { timeout: 30000, timeoutMsg: 'the tools were never listed' });
    expect(standIn.versions.every((v) => v === '2026-07-28')).toBe(true);
    await (await row.$('.//button[starts-with(normalize-space(.), "Show tools")]')).click();
    const list = await $('[data-testid="mcp-tool-shop-list_products"]');
    await list.waitForDisplayed({ timeout: 10000 });
    expect(await list.getText()).toContain('The server says: reads only');
    await (await $('select[aria-label="What list_products may do"]')).selectByAttribute('value', 'reading_only');
    await browser.waitUntil(async () => (await servers())[0].tools.find((t) => t.name === 'list_products')?.mark === 'reading_only', { timeout: 10000 });
    expect((await servers())[0].tools.find((t) => t.name === 'update_price').mark).toBe('ask');
  });

  it('the backend calls a tool on the stand-in and gets its answer', async () => {
    const r = await invoke('mcp_call_tool', { serverId: 'shop', url: standIn.url, version: '2026-07-28', tool: 'list_products', arguments: {}, inputSchema: null });
    console.log('MCP-E2E call', JSON.stringify(r).slice(0, 300));
    expect(r.ok).toBe(true);
    expect(r.value.ok).toBe(true);
    expect(r.value.text).toContain('3 products.');
    expect(standIn.calls.filter((c) => c.name === 'list_products')).toHaveLength(1);
    standIn.calls.length = 0;
  });

  describe('with a local model', function () {
    this.timeout(1700000);

    before(async function () {
      if (!(await ollamaHasModels())) { console.log('SKIPPED: no local model, so no agent step can run'); this.skip(); }
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
    });

    it('a reading request reads from the Shop without asking', async function () {
      needsLargerModel(this, 'choosing which outside tool to read');
      const { request, asked } = await ask('/jose How many products are in my Shop right now? Look it up.');
      console.log('MCP-E2E read', JSON.stringify({ steps: request.steps.map((s) => [s.stepId, s.agent, s.actionType, s.status]), calls: standIn.calls }));
      expect(asked).toBe(false);
      expect(standIn.calls.some((c) => c.name === 'list_products')).toBe(true);
      expect(standIn.calls.some((c) => c.name === 'update_price')).toBe(false);
    });

    it('a change waits on the board with its exact call and runs once after approval', async function () {
      needsLargerModel(this, 'filling in the price change');
      standIn.calls.length = 0;
      const { request } = await ask('/jose Set the price of the Blue mug in my Shop to 18.');
      const marcus = request.steps.find((s) => s.agent === 'marcus' && s.actionType === 'distribution_outside_tool');
      console.log('MCP-E2E change', JSON.stringify({ steps: request.steps.map((s) => [s.stepId, s.agent, s.actionType, s.status, s.note]), marcus }));
      expect(marcus).toBeTruthy();
      expect(marcus.status).toBe('waiting_approval');
      expect(marcus.outsideCall.tool).toBe('update_price');
      expect(marcus.outsideCall.arguments.price).toBe(18);
      expect(standIn.calls.some((c) => c.name === 'update_price')).toBe(false);
      const links = await $$('//main//button[normalize-space(.)="Open on the board"]');
      await links[links.length - 1].click();
      await browser.waitUntil(async () => (await mainText()).includes('Shop: Update price'), { timeout: 30000 });
      await (await $('//main//button[starts-with(normalize-space(.), "Approve and carry on")]')).click();
      await browser.waitUntil(async () => standIn.calls.some((c) => c.name === 'update_price'), { timeout: 600000, interval: 2000, timeoutMsg: 'the change never reached the stand-in' });
      await browser.pause(5000);
      expect(standIn.calls.filter((c) => c.name === 'update_price')).toHaveLength(1);
      expect(standIn.products['Blue mug']).toBe(18);
    });

    it('a Paid server is blocked in Zero-Cost Mode', async function () {
      needsLargerModel(this, 'planning the price change');
      standIn.calls.length = 0;
      await setServers((await servers()).map((s) => ({ ...s, cost: 'paid' })));
      await browser.refresh();
      await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
      const { request } = await ask('/jose Set the price of the Red mug in my Shop to 15.');
      const marcus = request.steps.find((s) => s.agent === 'marcus' && s.actionType === 'distribution_outside_tool');
      console.log('MCP-E2E paid', JSON.stringify({ steps: request.steps.map((s) => [s.stepId, s.agent, s.actionType, s.status, s.error]) }));
      expect(marcus).toBeTruthy();
      expect(marcus.status).toBe('setup_needed');
      expect(JSON.stringify(request)).toContain('Shop is a paid server and Zero-Cost Mode is on.');
      expect(standIn.calls).toHaveLength(0);
    });
  });
});
