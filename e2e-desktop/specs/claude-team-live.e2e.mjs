// Every agent on Claude, by hand (owner, 2026-10-31: "the whole setup will be on Claude").
// Skipped unless you set:
//   ALPHONSO_LIVE_TEAM_PROVIDER       claude (default) or openrouter
//   ALPHONSO_LIVE_ANTHROPIC_KEY_FILE  for claude: a file holding an Anthropic API key
//   ALPHONSO_LIVE_OPENROUTER_KEY_FILE for openrouter: a file holding an OpenRouter key
//   ALPHONSO_LIVE_TEAM_MODEL          the model (empty = Claude's default; for OpenRouter a
//                                     paid model id from its list, e.g. Anthropic's Claude)
//   ALPHONSO_LIVE_PAID_INPUT_PRICE    price per million input tokens, USD
//   ALPHONSO_LIVE_PAID_OUTPUT_PRICE   price per million output tokens, USD
// Optional: ALPHONSO_LIVE_SPEND_CAP_USD (default 0.50), ALPHONSO_LIVE_REPORT_FILE (each step's
// full output is written there for reading afterwards).
//
// One request with a step for each working agent (Hector, Nova, Alphonso, Miya, Maria, Sentinel,
// Marcus, Echo), every step on Claude as Allow paid models runs it today: each step asks once with
// its cost and is approved on the board. Jose plans and closes, as always on this computer's
// model. Marcus only checks readiness: nothing is sent. The key reaches the app only by being
// typed into Connectors.
import fs from 'node:fs';
import { enterShell, invoke, ollamaHasModels, openPage } from '../helpers.mjs';

const PROVIDER = process.env.ALPHONSO_LIVE_TEAM_PROVIDER === 'openrouter' ? 'openrouter' : 'claude';
const MODEL = process.env.ALPHONSO_LIVE_TEAM_MODEL || '';
const keyFile = PROVIDER === 'openrouter' ? process.env.ALPHONSO_LIVE_OPENROUTER_KEY_FILE : process.env.ALPHONSO_LIVE_ANTHROPIC_KEY_FILE;
const KEY_PLACEHOLDER = PROVIDER === 'openrouter' ? 'sk-or-...' : 'sk-ant-...';
const KEY = (() => { try { return keyFile ? fs.readFileSync(keyFile, 'utf8').trim() : ''; } catch { return ''; } })();
const INPUT_PRICE = Number(process.env.ALPHONSO_LIVE_PAID_INPUT_PRICE);
const OUTPUT_PRICE = Number(process.env.ALPHONSO_LIVE_PAID_OUTPUT_PRICE);
const CAP = Number(process.env.ALPHONSO_LIVE_SPEND_CAP_USD) || 0.5;
const REPORT = process.env.ALPHONSO_LIVE_REPORT_FILE || '';
const TOPIC = 'a small specialty coffee kiosk in a busy commuter train station';

const savedRequests = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_requests_v1') || '[]'));
const requestById = async (id) => (await savedRequests()).find((r) => r.id === id);
const spentThisMonth = async () => browser.execute(() => {
  try { return JSON.parse(localStorage.getItem('alphonso_jose_spend_v1') || '{}').totalUsd || 0; } catch { return 0; }
});

async function useSettings(values) {
  const loaded = await invoke('load_settings');
  const saved = JSON.parse((loaded.ok && loaded.value) || '{}');
  await invoke('save_settings', { settingsJson: JSON.stringify({ ...saved, ...values }) });
  await browser.execute((extra) => {
    const settings = JSON.parse(localStorage.getItem('alphonso_settings') || '{}');
    localStorage.setItem('alphonso_settings', JSON.stringify({ ...settings, ...extra }));
  }, values);
  await browser.refresh();
  await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
}

async function saveKey() {
  await $('[aria-label="Open settings"]').click();
  const connectors = await $('//nav//button[normalize-space(.)="Connectors"]');
  await connectors.waitForClickable({ timeout: 30000 });
  await connectors.click();
  const category = await $('[data-testid="connector-category-ai_models"]');
  await category.waitForExist({ timeout: 30000 });
  if ((await category.getAttribute('aria-expanded')) !== 'true') await category.click();
  const field = await $(`input[placeholder="${KEY_PLACEHOLDER}"]`);
  await field.waitForDisplayed({ timeout: 30000 });
  await field.scrollIntoView({ block: 'center' });
  await field.click();
  await field.setValue(KEY);
  for (const save of await $$('//button[normalize-space(.)="Save & Enable"]')) {
    if (await browser.execute((f, b) => Boolean(f.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING), field, save)) {
      await save.click();
      return;
    }
  }
  throw new Error(`no Save & Enable after the ${PROVIDER} key`);
}

/** The plan, saved waiting for you, as the planner would save it: one step per working agent. */
async function saveTeamPlan() {
  return browser.execute((topic, model) => {
    const now = Date.now();
    const claude = model;
    const step = (stepId, agent, actionType, effects, needs, instruction, extra = {}) => ({
      stepId, agent, actionType, effects: [...effects, 'spend'], needs, instruction, model: claude, status: 'waiting', ...extra,
    });
    const request = {
      id: `jose-request-plan-claude-team-${now.toString(36)}`,
      commandId: '',
      source: 'user',
      text: `Claude team check (${model}): ${topic}`,
      kind: 'normal',
      status: 'waiting_plan_approval',
      steps: [
        step('hector', 'hector', 'research_report', ['read'], [], `Research ${topic}: how many people pass through such stations, what commuters pay for coffee, and what makes kiosks there succeed or fail.`),
        step('nova', 'nova', 'analysis_findings', ['read'], ['hector'], 'From the research, judge whether to open the kiosk, and what to do first.'),
        step('alphonso', 'alphonso', 'assistant_write', ['write_own_work'], ['nova'], 'Write a three-sentence pitch for the kiosk for a landlord, using only what the research found.'),
        step('miya', 'miya', 'creative_package', ['write_own_work'], ['nova'], 'A quick creative idea for launching the kiosk on social media: title, hook, short script.'),
        step('maria', 'maria', 'audit_quality', ['read'], ['alphonso'], 'Review the pitch: is every claim backed by the research?', { reviewOf: 'alphonso' }),
        step('sentinel', 'sentinel', 'security_review', ['read'], ['alphonso'], 'Check the pitch for anything unsafe to send.', { reviewOf: 'alphonso' }),
        step('marcus', 'marcus', 'distribution_readiness', ['read'], ['alphonso'], 'Is the pitch ready to send by email? Send nothing.'),
        step('echo', 'echo', 'memory_preservation', ['read', 'write_own_work'], ['nova', 'alphonso'], 'Remember what was decided about the kiosk.'),
      ],
      plan: { source: 'fresh', templateId: null, note: 'Live check: every agent on Claude.' },
      changeLog: [],
      runOptions: { source: 'user', previewMode: false, zeroCostMode: false },
      createdAtMs: now,
      updatedAtMs: now,
    };
    const all = JSON.parse(localStorage.getItem('alphonso_jose_requests_v1') || '[]');
    localStorage.setItem('alphonso_jose_requests_v1', JSON.stringify([...all, request]));
    return request.id;
  }, TOPIC, `${PROVIDER}:${MODEL}`);
}

async function openRequest(id) {
  await openPage('system', 'orchestrator');
  await (await $('//main//button[normalize-space(.)="Requests"]')).click();
  const text = (await requestById(id)).text;
  await (await $(`//main//button[contains(normalize-space(.), "${text}")]`)).click();
}

const stepRows = (r) => (r?.steps || []).map((s) => [s.stepId, s.agent, s.status, s.model || null, s.error ? String(s.error).slice(0, 160) : null]);

describe('Alphonso desktop: every agent on Claude (live)', function () {
  this.timeout(3600000);

  before(async function () {
    if (!KEY || !Number.isFinite(INPUT_PRICE) || !Number.isFinite(OUTPUT_PRICE)) this.skip();
    if (!(await ollamaHasModels())) this.skip();
    await enterShell();
  });

  it('runs one request through every agent on Claude, each step approved with its cost', async function () {
    await saveKey();
    await useSettings({
      zeroCostMode: false, approvalMode: true, showPlanFirst: 'always',
      paidModels: { allowed: true, provider: PROVIDER, model: MODEL, inputPerMillionUsd: INPUT_PRICE, outputPerMillionUsd: OUTPUT_PRICE, monthlyCapUsd: CAP },
    });
    const before = await spentThisMonth();
    const id = await saveTeamPlan();
    await openRequest(id);
    await (await $('//main//button[normalize-space(.)="Run this plan"]')).click();

    // Approve each step as it asks, until the request ends.
    const started = Date.now();
    let approvals = 0;
    const asked = [];
    while (Date.now() - started < 3000000) {
      const r = await requestById(id);
      if (r && ['done', 'failed', 'stopped', 'cancelled', 'expired', 'waiting_setup'].includes(r.status)) break;
      const buttons = await $$('//main//button[starts-with(normalize-space(.), "Approve and carry on")]');
      if (r?.status === 'waiting_approval' && buttons.length) {
        const waiting = (r.steps || []).filter((s) => s.status === 'waiting_approval').map((s) => [s.stepId, s.waitingFor || s.note || null]);
        asked.push(...waiting);
        await buttons[0].click();
        approvals += 1;
        await browser.pause(3000);
        continue;
      }
      await browser.pause(3000);
    }

    const done = await requestById(id);
    const outputs = await browser.execute((cid) => {
      try { return JSON.parse(localStorage.getItem('alphonso_jose_step_outputs_v1') || '{}')[cid]?.steps || {}; } catch { return {}; }
    }, done.commandId);
    const claudeLog = await browser.execute((id) => {
      try {
        const rows = JSON.parse(localStorage.getItem('alphonso_connector_audit_v2') || '[]');
        return rows.filter((r) => r.connectorId === id || r.connector === id).map((r) => r.eventType || r.event || r.action || null);
      } catch { return []; }
    }, PROVIDER);
    const spent = (await spentThisMonth()) - before;
    const summary = {
      provider: PROVIDER,
      model: MODEL || '(default)',
      status: done.status,
      seconds: Math.round((Date.now() - started) / 1000),
      approvals,
      asked,
      spentUsd: Math.round(spent * 10000) / 10000,
      claudeCalls: claudeLog.filter((e) => e === 'send_success').length,
      claudeFailures: claudeLog.filter((e) => e !== 'send_success').length,
      steps: stepRows(done),
      changeLog: (done.changeLog || []).slice(-12),
    };
    console.log('CLAUDE-TEAM', JSON.stringify(summary));
    if (REPORT) {
      const lines = [`# Every agent on Claude: ${TOPIC}`, '', '```json', JSON.stringify(summary, null, 2), '```', ''];
      for (const s of done.steps) lines.push(`## ${s.stepId} (${s.agent}, ${s.status})`, '', String(outputs[s.stepId]?.summary || s.error || '(nothing saved)'), '');
      const closing = await browser.execute((cid) => {
        try {
          const all = JSON.parse(localStorage.getItem('alphonso_jose_command_routes_v2') || '[]');
          const list = Array.isArray(all) ? all : Object.values(all);
          return list.find((c) => c && (c.commandId === cid || c.id === cid))?.userReport?.summary || '';
        } catch { return ''; }
      }, done.commandId);
      lines.push('## Closing summary', '', String(closing || '(none)'));
      fs.writeFileSync(REPORT, lines.join('\n'));
    }
    expect(spent).toBeGreaterThan(0);
    expect(spent).toBeLessThanOrEqual(CAP);
    for (const agent of ['hector', 'nova', 'alphonso', 'miya', 'maria', 'sentinel', 'marcus', 'echo']) {
      expect(done.steps.some((s) => s.agent === agent && s.status === 'done')).toBe(true);
    }
  });
});
