// Agent roles Part B in the real app (2026-10-25): every agent's skills are
// listed, your own skill is saved to the app's skills folder by the backend,
// a skill that gives an agent another agent's work is refused with the reason,
// and with a local model a request's steps show the skill and why on the
// board. Nothing is sent. The spec deletes the skill it saves.
import { enterShell, invoke, openPage, ollamaHasModels, warmSelectedModel, clickSend } from '../helpers.mjs';

const MINE = 'e2e-short-answers.md';
// Small models write unusable plans more often (agent-roles.e2e.mjs uses the same choice).
const PREFERRED_TEST_MODEL = 'qwen2.5:7b';

async function installedModels() {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
    const data = await response.json();
    return (data.models || []).map((m) => m.name);
  } catch {
    return [];
  }
}

/** The test never approves anything: any approval window is denied, and counted. */
async function denyAnyApproval() {
  const deny = await $('button[aria-label="Deny action"]');
  if (await deny.isExisting() && await deny.isDisplayed()) {
    await deny.click();
    return 1;
  }
  return 0;
}

async function openSkills() {
  await openPage('system', 'ecosystem');
  const tab = await $('//main//button[normalize-space(.)="Skills"]');
  await tab.waitForDisplayed({ timeout: 30000 });
  await tab.click();
  await $('[data-testid="skills-page"]').waitForDisplayed({ timeout: 30000 });
}

async function newSkill(agent, { name, useWhen, task, instructions }) {
  const section = await $(`[data-testid="skills-agent-${agent}"]`);
  await section.scrollIntoView();
  await (await section.$('.//button[normalize-space(.)="New skill"]')).click();
  const form = await $('[data-testid="skill-form"]');
  await form.waitForDisplayed();
  await (await form.$('input[aria-label="Name"]')).setValue(name);
  await (await form.$('input[aria-label="Use when"]')).setValue(useWhen);
  if (task) await (await form.$(`input[aria-label="${task}"]`)).click();
  await (await form.$('textarea[aria-label="Instructions"]')).setValue(instructions);
  await (await form.$('.//button[normalize-space(.)="Save skill"]')).click();
}

async function lastRequest() {
  const requests = JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_requests_v1') || '[]'));
  return requests.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))[0] || null;
}

describe('Alphonso desktop: agent skills', () => {
  before(async () => {
    await enterShell();
  });

  after(async () => {
    try { await invoke('skills_delete_user', { agent: 'alphonso', file: MINE }); } catch { /* nothing saved */ }
  });

  it("lists each agent's skills", async () => {
    await openSkills();
    expect(await (await $('[data-testid="skills-agent-hector"]')).getText()).toContain('Web research with sources');
    expect(await (await $('[data-testid="skills-agent-maria"]')).getText()).toContain('Claim check');
    expect(await $('[data-testid="skills-agent-jose"]').isExisting()).toBe(false);
  });

  it('saves your own skill to the skills folder, and refuses one that does another agent\'s work', async () => {
    await newSkill('alphonso', { name: 'E2E short answers', useWhen: 'Someone wants a one-line answer.', task: 'assistant_answer', instructions: 'Answer in one line.' });
    await browser.waitUntil(async () => (await (await $('[data-testid="skills-agent-alphonso"]')).getText()).includes('E2E short answers'),
      { timeout: 20000, timeoutMsg: 'the saved skill never showed' });
    const listed = await invoke('skills_list_user');
    expect(listed.ok).toBe(true);
    const files = listed.value;
    const mine = files.find((f) => f.agent === 'alphonso' && f.file === MINE);
    expect(mine).toBeTruthy();
    expect(mine.text).toContain('task_types: [assistant_answer]');

    // Maria may not research: the form has no research task for her, so a hand-written file is used.
    await invoke('skills_save_user', { agent: 'maria', file: 'e2e-snoop.md', text: '---\nname: E2E snoop\nagent: maria\nuse_when: x\ntask_types: [research_report]\n---\nResearch.' });
    try {
      await browser.refresh();
      await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
      await openSkills();
      await browser.waitUntil(async () => (await $('[data-testid="skills-refused"]').isExisting()), { timeout: 20000, timeoutMsg: 'the refused skill was not listed' });
      expect(await (await $('[data-testid="skills-refused"]')).getText()).toContain("research_report is Hector's work, not Maria's.");
      expect(await (await $('[data-testid="skills-agent-maria"]')).getText()).not.toContain('E2E snoop');
    } finally {
      await invoke('skills_delete_user', { agent: 'maria', file: 'e2e-snoop.md' });
    }
  });

  it('shows the skill and its reason under each step on the board', async function () {
    if (!(await ollamaHasModels())) this.skip();
    await invoke('skills_delete_user', { agent: 'alphonso', file: MINE });
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
    const input = await $('[data-testid="chat-compose-input"]');
    await input.waitForDisplayed();
    await input.setValue('/jose Research three facts about honeybees and write a brief paragraph from them. Do not send it anywhere.');
    await clickSend();
    let denied = 0;
    await browser.waitUntil(async () => {
      denied += await denyAnyApproval();
      const request = await lastRequest();
      return request && ['done', 'failed', 'waiting_approval', 'waiting_setup'].includes(request.status);
    }, { timeout: 1400000, interval: 3000, timeoutMsg: 'the request never finished' });
    const request = await lastRequest();
    console.log('AGENT-SKILLS request', JSON.stringify({ denied, plan: request.plan, steps: request.steps.map((s) => [s.stepId, s.agent, s.actionType, s.status, s.skill, s.skillReason]) }));
    const ran = request.steps.filter((s) => s.agent !== 'jose' && s.status !== 'not_run' && s.status !== 'waiting_approval');
    expect(ran.length).toBeGreaterThan(0);
    for (const step of ran) expect(typeof step.skillReason).toBe('string');
    expect(ran.some((s) => s.skill)).toBe(true);

    // The board shows it for a step that ran.
    const withSkill = ran.find((s) => s.skill);
    await openPage('system', 'orchestrator');
    const requestsTab = await $('//main//button[normalize-space(.)="Requests"]');
    await requestsTab.waitForDisplayed({ timeout: 30000 });
    await requestsTab.click();
    const boxes = await $$('[data-testid="jose-plan-step"]');
    const index = request.steps.findIndex((s) => s.stepId === withSkill.stepId);
    await boxes[index].click();
    const line = await $('[data-testid="jose-step-skill"]');
    await line.waitForDisplayed({ timeout: 20000 });
    expect(await line.getText()).toBe(`Skill: ${withSkill.skill} — ${withSkill.skillReason}`);
  }).timeout(1500000);
});
