// A Miya Studio project as one Jose request (Jose redesign phase 6b,
// 2026-10-23): Run project runs Research, the Script and the two reviews (with
// the agents' review loop) through Jose with a real model, then the request
// waits for you ("Approve the review in Miya Studio first."); Approve in Miya
// Studio carries it on to Scenes. From Chat, a content video starts a project
// that "Open in Miya Studio" opens. Skipped without a local model.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { enterShell, invoke, mainText, buttonByText, openPage, ollamaHasModels, warmSelectedModel, clickSend } from '../helpers.mjs';

const PREFERRED_TEST_MODEL = 'qwen2.5:7b';
const REVIEW_WAIT = 'Approve the review in Miya Studio first.';

async function installedModels() {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
    const data = await response.json();
    return (data.models || []).map((m) => m.name);
  } catch {
    return [];
  }
}

const savedRequests = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_requests_v1') || '[]'));
const savedProjects = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_content_projects_v1') || '[]'));
const projectNamed = async (name) => (await savedProjects()).find((p) => p.name === name);
const stepText = async (label) => browser.execute((name) => document.querySelector(`section[aria-label="${name}"]`)?.innerText || '', label);

describe('Alphonso desktop: a Miya Studio project is one Jose request', () => {
  let outputFolder = '';

  before(async function () {
    await enterShell();
    if (!(await ollamaHasModels())) this.skip();
    this.timeout(400000);
    outputFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'alphonso-project-'));
    const loaded = await invoke('load_settings');
    const saved = JSON.parse((loaded.ok && loaded.value) || '{}');
    const model = (await installedModels()).includes(PREFERRED_TEST_MODEL) ? PREFERRED_TEST_MODEL : undefined;
    const extra = { outputFolder, showPlanFirst: 'never', approvalMode: true, effectApprovals: {}, ...(model ? { selectedModel: model } : {}) };
    await invoke('save_settings', { settingsJson: JSON.stringify({ ...saved, ...extra }) });
    await browser.execute((values) => {
      const settings = JSON.parse(localStorage.getItem('alphonso_settings') || '{}');
      localStorage.setItem('alphonso_settings', JSON.stringify({ ...settings, ...values }));
    }, extra);
    await browser.refresh();
    await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
    await warmSelectedModel();
  });

  after(() => {
    if (outputFolder) fs.rmSync(outputFolder, { recursive: true, force: true });
  });

  it('runs the project through the reviews and waits for your approval', async function () {
    this.timeout(2400000);
    await openPage('work', 'miya');
    const name = await $('input[aria-label="New project name"]');
    await name.waitForDisplayed({ timeout: 60000 });
    await name.setValue('Why we procrastinate');
    await (await buttonByText('create')).click();
    const idea = await $('textarea[aria-label="Idea"]');
    await idea.waitForDisplayed();
    await idea.setValue('A 45 second video on why we procrastinate and one trick that helps, for adults learning English.');
    await (await $('input[aria-label="Platforms"]')).setValue('YouTube');
    await (await buttonByText('save brief')).click();

    const before = new Set((await savedRequests()).map((r) => r.id));
    await (await $('//main//button[normalize-space(.)="Run project"]')).click();
    await browser.waitUntil(async () => (await savedRequests()).some((r) => !before.has(r.id)), {
      timeout: 120000, interval: 2000, timeoutMsg: 'Run project made no request',
    });
    const requestId = (await savedRequests()).find((r) => !before.has(r.id)).id;
    await browser.waitUntil(async () => {
      const request = (await savedRequests()).find((r) => r.id === requestId);
      return ['waiting_approval', 'failed', 'done', 'cancelled'].includes(request.status);
    }, { timeout: 2000000, interval: 5000, timeoutMsg: 'the project never reached the review' });
    const request = (await savedRequests()).find((r) => r.id === requestId);
    if (request.status !== 'waiting_approval') {
      console.log('content-project: request', JSON.stringify(request.steps.map((s) => [s.stepId, s.status])), JSON.stringify(request.changeLog || []).slice(0, 1500));
    }
    expect(request.status).toBe('waiting_approval');
    expect(request.plan.note).toBe('Steps set by Miya Studio.');
    const waiting = request.steps.filter((s) => s.status === 'waiting_approval');
    expect(waiting.map((s) => [s.stepId, s.waitFor])).toEqual([['scenes', REVIEW_WAIT]]);
    const project = await projectNamed('Why we procrastinate');
    expect(project.joseRequestId).toBe(requestId);
    for (const step of ['research', 'script', 'review']) expect(project.steps[step].versions.length).toBeGreaterThan(0);
    expect(project.steps.review.status).toBe('needs_approval');
    expect(fs.existsSync(path.join(outputFolder, fs.readdirSync(outputFolder)[0], 'why-we-procrastinate', 'script', 'v1.md'))).toBe(true);
    expect(await mainText()).toContain('Jose request: Waiting for your approval.');
  });

  it('Approve in Miya Studio carries the request on to Scenes', async function () {
    this.timeout(2400000);
    const project = await projectNamed('Why we procrastinate');
    const approve = await $('//section[@aria-label="Review"]//button[normalize-space(.)="Approve"]');
    await approve.waitForClickable({ timeout: 30000 });
    await approve.click();
    await browser.waitUntil(async () => {
      const now = await projectNamed('Why we procrastinate');
      return now.steps.scenes.versions.length > 0 || now.steps.scenes.status === 'failed';
    }, { timeout: 2000000, interval: 5000, timeoutMsg: 'Scenes never ran after the approval' });
    const after = await projectNamed('Why we procrastinate');
    expect(after.steps.review.status).toBe('approved');
    expect(after.steps.scenes.versions.length).toBeGreaterThan(0);
    const request = (await savedRequests()).find((r) => r.id === project.joseRequestId);
    expect(request.steps.find((s) => s.stepId === 'scenes').status).not.toBe('waiting_approval');
    expect(await stepText('Scenes')).not.toMatch(/Failed/);
  });

  it('a content video asked in Chat starts a project that opens in Miya Studio', async function () {
    this.timeout(300000);
    await $('[data-testid="sidebar-chat-shortcut"]').click();
    const input = await $('[data-testid="chat-compose-input"]');
    await input.waitForDisplayed();
    await input.setValue('Ask Jose: make a YouTube video script about brewing coffee at home');
    await clickSend();
    const open = await $('//main//button[normalize-space(.)="Open in Miya Studio"]');
    await open.waitForClickable({ timeout: 120000 });
    expect(await mainText()).toMatch(/Started the Miya Studio project "Make a YouTube video script about brewing/);
    await open.click();
    await browser.waitUntil(async () => (await mainText()).includes('Script Studio'), { timeout: 30000, timeoutMsg: 'Miya Studio did not open' });
    const idea = await $('textarea[aria-label="Idea"]');
    expect(await idea.getValue()).toContain('brewing coffee at home');
  });
});
