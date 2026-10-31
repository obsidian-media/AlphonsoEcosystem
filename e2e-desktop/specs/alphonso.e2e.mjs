// Agent phase 6 (Alphonso), in the real app (2026-10-26): two temporary projects, `shop` (with a
// test script) and `blog`, are added in Settings → Agents → Alphonso's projects. A quiz is writing
// and runs nothing; a small script with no project named is written to its own folder in the
// output folder (asking first only when it runs or changes something); a change in shop waits with the preview and is written only after
// approval; running the tests asks first and reports the exit code; nothing is committed to git;
// and with two projects a request that names none asks which project, then carries on in blog.
// Needs a local model; uses qwen2.5:7b when installed, and qwen2.5-coder:7b for his code when installed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { enterShell, invoke, ollamaHasModels, warmSelectedModel, mainText, buttonByText, clickSend, needsLargerModel } from '../helpers.mjs';

// CI's model run sets ALPHONSO_E2E_MODEL (Jose phase 7); locally the 7B model when installed.
const PREFERRED_TEST_MODEL = process.env.ALPHONSO_E2E_MODEL || 'qwen2.5:7b';
// Chosen in Settings → Agents → "Model for Alphonso's code" when installed.
const PREFERRED_CODE_MODEL = 'qwen2.5-coder:7b';
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'alphonso-e2e-'));
const SHOP = path.join(ROOT, 'shop');
const BLOG = path.join(ROOT, 'blog');
const OUTPUT = path.join(ROOT, 'output');
const ORIGINAL_TEST = "console.log('not yet');\n";
// A model too small to write a usable change (CI's 1.5B leg, QA 2026-10-31): Alphonso says so,
// which is right, but the checks below need a change to look at.
const UNUSABLE_CHANGE = /didn't give a change he could use/;

// The edit typed into the preview: valid JavaScript, since node runs test.js after the approval (QA batch 1).
const EDITED = "console.log('Edited by the test.');\n";

async function installedModels() {
  try {
    const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
    return ((await r.json()).models || []).map((m) => m.name);
  } catch { return []; }
}

const requests = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_requests_v1') || '[]'))
  .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
const outputs = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_step_outputs_v1') || '{}'));
const stepOutput = async (request, stepId) => (await outputs())[request.commandId]?.steps?.[stepId] || null;
const steps = (request) => (request?.steps || []).map((s) => [s.stepId, s.agent, s.actionType, s.status, s.error]);
const busy = (r) => r.status === 'running' || r.steps.some((s) => ['running', 'pending', 'queued'].includes(s.status));

async function approvalShown() {
  const deny = await $('button[aria-label="Deny action"]');
  return (await deny.isExisting()) && (await deny.isDisplayed());
}

/** Waits until the request is no longer running; an approval window is denied and counted. */
async function settle(requestId, label) {
  let asked = false;
  try {
    await browser.waitUntil(async () => {
      if (await approvalShown()) { asked = true; await (await $('button[aria-label="Deny action"]')).click(); }
      const r = (await requests()).find((x) => x.id === requestId);
      return r && !busy(r);
    }, { timeout: 1500000, interval: 4000 });
  } catch {
    const r = (await requests()).find((x) => x.id === requestId);
    throw new Error(`${label}: the request never settled: ${JSON.stringify({ status: r?.status, steps: steps(r) })}`);
  }
  return { request: (await requests()).find((x) => x.id === requestId), asked };
}

async function ask(text) {
  const before = (await requests())[0]?.id;
  await $('[data-testid="sidebar-chat-shortcut"]').click();
  const input = await $('[data-testid="chat-compose-input"]');
  await input.waitForDisplayed();
  await input.setValue(text);
  await clickSend();
  await browser.waitUntil(async () => { const r = (await requests())[0]; return r && r.id !== before; }, { timeout: 600000, interval: 2000, timeoutMsg: `no request for: ${text}` });
  return settle((await requests())[0].id, text);
}

async function openBoard() {
  // Already on the board (after "Which project") there is no link to follow.
  const links = await $$('//main//button[normalize-space(.)="Open on the board"]');
  if (links.length) await links[links.length - 1].click();
  await browser.waitUntil(async () => /Waiting for|Which project/.test(await mainText()), { timeout: 30000 });
}

async function approveOnBoard(request) {
  await openBoard();
  await (await $('//main//button[starts-with(normalize-space(.), "Approve and carry on")]')).click();
  return settle(request.id, 'after approval');
}

const codeStep = (request) => request.steps.find((s) => s.agent === 'alphonso' && !String(s.actionType || '').startsWith('assistant_'));

function findFile(dir, name) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === name) return full;
    if (entry.isDirectory()) { const hit = findFile(full, name); if (hit) return hit; }
  }
  return null;
}

async function addProject(name, folder) {
  await (await $('//main//input[@aria-label="Project name"]')).setValue(name);
  await (await $('//main//input[@aria-label="Project folder"]')).setValue(folder);
  await buttonByText('Add project').click();
  await browser.waitUntil(async () => (await $(`//main//button[@aria-label="Remove ${name}"]`)).isExisting(), { timeout: 10000 });
}

describe('Alphonso desktop: his code steps in your projects', () => {
  before(async function () {
    fs.mkdirSync(SHOP, { recursive: true });
    fs.mkdirSync(BLOG, { recursive: true });
    fs.mkdirSync(OUTPUT, { recursive: true });
    fs.writeFileSync(path.join(SHOP, 'package.json'), JSON.stringify({ name: 'shop', version: '1.0.0', scripts: { test: 'node test.js' } }, null, 2));
    fs.writeFileSync(path.join(SHOP, 'test.js'), ORIGINAL_TEST);
    fs.writeFileSync(path.join(BLOG, 'index.md'), '# Blog\n');
    await enterShell();
    if (!(await ollamaHasModels())) this.skip();
    const extra = { showPlanFirst: 'never', outputFolder: OUTPUT, ...((await installedModels()).includes(PREFERRED_TEST_MODEL) ? { selectedModel: PREFERRED_TEST_MODEL } : {}) };
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
    await $('[aria-label="Open settings"]').click();
    await browser.waitUntil(async () => /API CREDENTIALS|General/.test(await mainText()), { timeout: 30000 });
    await buttonByText('Agents').click();
    await browser.waitUntil(async () => (await mainText()).includes("Alphonso's projects"), { timeout: 30000 });
    await addProject('shop', SHOP);
    await addProject('blog', BLOG);
    if ((await installedModels()).includes(PREFERRED_CODE_MODEL)) {
      const select = await $('#alphonso-code-model');
      await browser.waitUntil(async () => (await select.$$('option')).length > 1, { timeout: 30000 });
      await select.selectByAttribute('value', PREFERRED_CODE_MODEL);
      await browser.waitUntil(async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_settings') || '{}')).alphonsoCodeModel === PREFERRED_CODE_MODEL, { timeout: 10000, timeoutMsg: 'the code model was not saved' });
    }
    const projects = JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_code_projects_v1') || '[]'));
    expect(projects.map((p) => p.name)).toEqual(['shop', 'blog']);
    await $('[data-testid="sidebar-chat-shortcut"]').click();
  });

  // A check that fails must not leave a request holding a project for the next one.
  afterEach(async () => {
    const waiting = (await requests()).filter((r) => r.status === 'waiting_approval' || r.status === 'waiting_setup');
    if (!waiting.length) return;
    await openBoard().catch(() => undefined);
    for (const button of await $$('//main//button[starts-with(normalize-space(.), "Reject")]')) await button.click().catch(() => undefined);
    await browser.execute(() => localStorage.removeItem('alphonso_project_locks_v1'));
    await $('[data-testid="sidebar-chat-shortcut"]').click();
  });

  after(() => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* best effort */ } });

  it('quiz questions are writing, and nothing runs', async () => {
    const { request, asked } = await ask('/jose Write five quiz questions to test my students on fractions.');
    console.log('ALPHONSO-E2E quiz', JSON.stringify(steps(request)));
    expect(codeStep(request)).toBeFalsy();
    expect(asked).toBe(false);
    const all = JSON.stringify((await outputs())[request.commandId] || {});
    expect(all).not.toContain('command_result');
  }).timeout(1600000);

  it('a small script with no project is written to its own folder in the output folder', async () => {
    const { request } = await ask("/jose Create a small Node.js script hello.js that prints today's date, and run it.");
    const step = codeStep(request);
    console.log('ALPHONSO-E2E hello', JSON.stringify({ steps: steps(request), preview: step?.codePreview && { place: step.codePreview.place, files: step.codePreview.files.map((f) => f.path), commands: step.codePreview.commands } }));
    // With projects listed his model may find the request unclear; then he asks which project
    // (the owner's rule for an unclear request) and writes nothing.
    if (step?.status === 'setup_needed' && step.projectChoices?.length) {
      expect(step.error).toBe('Which project: shop, blog?');
      expect(findFile(OUTPUT, 'hello.js')).toBeNull();
      return;
    }
    expect(step.codePreview.place.kind).toBe('new');
    expect(step.codePreview.files.map((f) => path.basename(f.path))).toContain('hello.js');
    // New files in a folder of its own with nothing to run need no approval; anything else waits.
    const needsApproval = step.codePreview.commands.some((c) => !c.readOnly) || step.codePreview.files.some((f) => f.status === 'changed');
    expect(step.status).toBe(needsApproval ? 'waiting_approval' : 'done');
    if (needsApproval) expect(findFile(OUTPUT, 'hello.js')).toBeNull();
    const done = needsApproval ? (await approveOnBoard(request)).request : request;
    const out = await stepOutput(done, step.stepId);
    console.log('ALPHONSO-E2E hello done', JSON.stringify({ status: done.status, steps: steps(done), saved: Object.keys((await outputs())[done.commandId]?.steps || {}), summary: out?.summary, artifacts: out?.artifacts }));
    const file = findFile(path.join(OUTPUT, 'Alphonso'), 'hello.js');
    expect(file).toBeTruthy();
    // The command policy refuses `node <file>`, so a refused command is left out of the preview
    // with the reason; whatever does run must pass.
    expect(done.status).toBe('done');
    for (const run of (out?.artifacts || []).filter((a) => a.type === 'command_result')) expect(run.exitCode).toBe(0);
  }).timeout(3200000);

  it('a change in shop waits with the preview and is written only after approval', async function () {
    const { request } = await ask("/jose In shop, change test.js so it prints 'ok'.");
    const step = codeStep(request);
    console.log('ALPHONSO-E2E change', JSON.stringify({ steps: steps(request), files: step?.codePreview?.files?.map((f) => [f.path, f.status]) }));
    if (UNUSABLE_CHANGE.test(String(step?.error || '')) || (step?.codePreview && !step.codePreview.files.length)) {
      needsLargerModel(this, 'the model proposed no file change');
    }
    expect(step?.status).toBe('waiting_approval');
    expect(step.project).toBe('shop');
    const files = step.codePreview.files;
    expect(files.length).toBeGreaterThan(0);
    await openBoard();
    const preview = await $('[data-testid="alphonso-code-preview"]');
    await preview.waitForDisplayed({ timeout: 30000 });
    for (const f of files) expect(await preview.getText()).toContain(f.path);
    // Nothing is written before the approval: test.js is as it was, new files don't exist.
    expect(fs.readFileSync(path.join(SHOP, 'test.js'), 'utf8')).toBe(ORIGINAL_TEST);
    for (const f of files.filter((x) => x.status === 'new')) expect(fs.existsSync(path.join(SHOP, f.path))).toBe(false);
    await (await $('//main//button[starts-with(normalize-space(.), "Approve and carry on")]')).click();
    const done = (await settle(request.id, 'change')).request;
    console.log('ALPHONSO-E2E change done', JSON.stringify({ status: done.status, steps: steps(done), summary: (await stepOutput(done, step.stepId))?.summary }));
    // What was approved is what was written (a later fix round may have changed it again).
    // A fix round inside his own run says so in the summary (QA batch 1).
    // A step whose checks still fail after the fix rounds ends failed, and its report is then the
    // step's error, not its output (QA, 2026-10-31: the edit check read only the output).
    const summary = String((await stepOutput(done, step.stepId))?.summary || done.steps.find((x) => x.stepId === step.stepId)?.error || '');
    const fixed = done.steps.some((x) => x.revises === step.stepId) || /differs from what you approved/.test(summary);
    for (const f of files) {
      const now = fs.readFileSync(path.join(SHOP, f.path), 'utf8');
      if (!fixed) expect(now).toBe(f.content);
    }
  }).timeout(3200000);

  it('running the tests asks first and reports the exit code', async () => {
    const { request } = await ask('/jose Run the tests in shop.');
    const step = codeStep(request);
    console.log('ALPHONSO-E2E tests', JSON.stringify({ steps: steps(request), commands: step?.codePreview?.commands }));
    expect(step?.status).toBe('waiting_approval');
    expect((step.codePreview.commands || []).length).toBeGreaterThan(0);
    const done = (await approveOnBoard(request)).request;
    const out = await stepOutput(done, step.stepId);
    // Each approved command is reported as passed or failed, whether the step ended done or failed.
    const after = done.steps.find((x) => x.stepId === step.stepId);
    const report = String(out?.summary || after?.error || '');
    console.log('ALPHONSO-E2E tests done', JSON.stringify({ status: done.status, report }));
    for (const c of step.codePreview.commands) expect(report).toMatch(new RegExp(`${[c.program, ...c.args].join(' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: (passed|failed)`));
  }).timeout(3200000);

  it('nothing was committed to git', () => {
    expect(fs.existsSync(path.join(SHOP, '.git'))).toBe(false);
    expect(fs.existsSync(path.join(BLOG, '.git'))).toBe(false);
  });

  it('with two projects and none named, he asks which one, then works in blog', async function () {
    const { request } = await ask('/jose Add a README file that says what this project is.');
    const step = codeStep(request);
    console.log('ALPHONSO-E2E which', JSON.stringify({ status: request.status, steps: steps(request), choices: step?.projectChoices }));
    expect(request.status).toBe('waiting_setup');
    expect(step.projectChoices).toEqual(['shop', 'blog']);
    expect(step.error).toBe('Which project: shop, blog?');
    await openBoard();
    await (await $('[data-testid="alphonso-pick-blog"]')).click();
    let after = (await settle(request.id, 'pick')).request;
    const picked = codeStep(after);
    console.log('ALPHONSO-E2E picked', JSON.stringify({ status: after.status, steps: steps(after), project: picked?.project }));
    expect(picked.project).toBe('blog');
    if (UNUSABLE_CHANGE.test(String(picked.error || ''))) needsLargerModel(this, 'the model gave no usable change');
    if (picked.status === 'waiting_approval') after = (await approveOnBoard(after)).request;
    expect(findFile(BLOG, 'README.md') || findFile(BLOG, 'README')).toBeTruthy();
    expect(findFile(SHOP, 'README.md')).toBeNull();
  }).timeout(3200000);

  // Agent roles Part C2: you can edit his change before approving it; your edit is what is written.
  it('an edited preview is what gets written', async function () {
    // A change to an existing file, so it waits: a new file is his own work and asks nothing (QA batch 1).
    const { request } = await ask("/jose In shop, change test.js so it prints 'edited'.");
    const step = codeStep(request);
    console.log('ALPHONSO-E2E edit', JSON.stringify({ steps: steps(request), files: step?.codePreview?.files?.map((f) => [f.path, f.status]) }));
    if (UNUSABLE_CHANGE.test(String(step?.error || '')) || (step?.codePreview && !step.codePreview.files.length)) {
      needsLargerModel(this, 'the model proposed no file change');
    }
    expect(step?.status).toBe('waiting_approval');
    const file = step.codePreview.files[0];
    await openBoard();
    await (await $(`[data-testid="alphonso-edit-${file.path}"]`)).click();
    const box = await $(`//textarea[@aria-label="Edit ${file.path}"]`);
    await box.waitForDisplayed({ timeout: 30000 });
    await box.setValue(EDITED);
    await (await $('[data-testid="alphonso-edit-save"]')).click();
    await browser.waitUntil(async () => /Edited by you/.test(await (await $('[data-testid="alphonso-code-preview"]')).getText()), { timeout: 30000 });
    await (await $('//main//button[starts-with(normalize-space(.), "Approve and carry on")]')).click();
    const done = (await settle(request.id, 'edit')).request;
    console.log('ALPHONSO-E2E edit done', JSON.stringify({ status: done.status, steps: steps(done) }));
    // A step whose checks still fail after the fix rounds ends failed, and its report is then the
    // step's error, not its output (QA, 2026-10-31: the edit check read only the output).
    const summary = String((await stepOutput(done, step.stepId))?.summary || done.steps.find((x) => x.stepId === step.stepId)?.error || '');
    const fixed = done.steps.some((x) => x.revises === step.stepId) || /differs from what you approved/.test(summary);
    if (!fixed) expect(fs.readFileSync(path.join(SHOP, file.path), 'utf8')).toBe(EDITED);
  }).timeout(3200000);

  // Agent roles Part C2: naming two projects gives one step per project.
  it('naming shop and blog gives a code step in each', async () => {
    const { request } = await ask('/jose Add a file hello.txt that says hi in shop and in blog.');
    // The planned steps: a fix round after a review ("alphonso-2-fix-1") works in the same project (QA batch 1).
    const code = request.steps.filter((s) => s.agent === 'alphonso' && !String(s.actionType || '').startsWith('assistant_')
      && !s.revises && !s.helpRound && !s.replaces);
    console.log('ALPHONSO-E2E two', JSON.stringify({ steps: steps(request), projects: code.map((s) => s.project) }));
    expect(code.map((s) => s.project).sort()).toEqual(['blog', 'shop']);
    // Nothing is approved: a request still waiting is rejected, so its locks are let go. New files
    // are his own work and ask nothing, so the request may already be done (7B run, 2026-10-31).
    if (request.status === 'waiting_approval' || request.steps.some((s) => s.status === 'waiting_approval')) {
      await openBoard();
      const reject = await $('//main//button[normalize-space(.)="Reject"]');
      if (await reject.isExisting()) await reject.click();
    }
  }).timeout(3200000);
});
