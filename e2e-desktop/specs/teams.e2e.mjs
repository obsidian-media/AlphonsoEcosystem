// Agent roles Part C1 in the real app (2026-10-27): a team is built and saved on the Teams page,
// asked for by name in Chat it becomes a request with exactly its steps and its label, and a
// saved template that gives an agent another agent's work shows the problem with Run disabled.
// Nothing is approved. The Chat run is skipped without a local model.
import { enterShell, invoke, ollamaHasModels, openPage, clickSend } from '../helpers.mjs';

const readJson = (key) => browser.execute((k) => localStorage.getItem(k) || '[]', key).then((s) => JSON.parse(s));

async function denyAnyApproval() {
  const deny = await $('button[aria-label="Deny action"]');
  if (await deny.isExisting() && await deny.isDisplayed()) await deny.click();
}

describe('Alphonso desktop: Teams', () => {
  before(async () => {
    await enterShell();
    const extra = { showPlanFirst: 'never' };
    const loaded = await invoke('load_settings');
    await invoke('save_settings', { settingsJson: JSON.stringify({ ...JSON.parse((loaded.ok && loaded.value) || '{}'), ...extra }) });
    await browser.execute((values) => {
      localStorage.setItem('alphonso_settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('alphonso_settings') || '{}'), ...values }));
      // A template whose step gives Hector's work to Nova.
      const templates = JSON.parse(localStorage.getItem('alphonso_jose_user_templates_v1') || '[]').filter((t) => t.id !== 'user_wrong-hands');
      templates.push({ id: 'user_wrong-hands', name: 'Wrong hands', kind: 'normal', matchWords: [], steps: [{ stepId: 'nova', agent: 'nova', actionType: 'research_report', effects: ['read'], needs: [] }] });
      localStorage.setItem('alphonso_jose_user_templates_v1', JSON.stringify(templates));
    }, extra);
    await browser.refresh();
    await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
    await openPage('system', 'pairings');
    await $('[data-testid="teams-page"]').waitForDisplayed({ timeout: 60000 });
  });

  it('shows a template that gives Hector\'s work to Nova with its problem and Run disabled', async () => {
    const problems = await $('[data-testid="team-problems-user_wrong-hands"]');
    await problems.waitForDisplayed({ timeout: 30000 });
    expect(await problems.getText()).toContain("Gives Hector's work to Nova (research_report).");
    expect(await $('[data-testid="team-run-user_wrong-hands"]').isEnabled()).toBe(false);
  });

  it('builds and saves a team of Hector and Alphonso', async () => {
    await $('[data-testid="teams-new"]').click();
    await $('input[aria-label="Team name"]').setValue('Teatime');
    await $('input[aria-label="The job"]').setValue('Find facts and write them up');
    await $('select[aria-label="Add an agent"]').selectByAttribute('value', 'hector');
    await $('select[aria-label="Work for Hector"]').selectByAttribute('value', 'research_report');
    await $('select[aria-label="Add an agent"]').selectByAttribute('value', 'alphonso');
    await $('select[aria-label="Work for Alphonso"]').selectByAttribute('value', 'assistant_write');
    const save = await $('//button[normalize-space(.)="Save team"]');
    await save.waitForEnabled({ timeout: 30000 });
    await save.click();
    const team = await browser.waitUntil(async () => (await readJson('alphonso_jose_user_templates_v1')).find((t) => t.name === 'Teatime'), { timeout: 30000, timeoutMsg: 'the team was not saved' });
    expect(team.steps.map((s) => [s.agent, s.actionType])).toEqual([['hector', 'research_report'], ['alphonso', 'assistant_write']]);
    expect(team.steps[1].needs).toEqual([team.steps[0].stepId]);
  });

  it('runs the team when Chat asks for it by name', async function () {
    if (!(await ollamaHasModels())) this.skip();
    const before = (await readJson('alphonso_jose_requests_v1')).map((r) => r.id);
    await $('[data-testid="sidebar-chat-shortcut"]').click();
    const input = await $('[data-testid="chat-compose-input"]');
    await input.waitForDisplayed();
    await input.setValue('use team Teatime to write two lines about tea');
    await clickSend();
    const request = await browser.waitUntil(async () => {
      await denyAnyApproval();
      return (await readJson('alphonso_jose_requests_v1')).find((r) => !before.includes(r.id));
    }, { timeout: 240000, interval: 2000, timeoutMsg: 'no request was made' });
    expect(request.plan?.note).toBe('Steps set by your team Teatime.');
    const work = request.steps.filter((s) => s.agent !== 'sentinel').map((s) => [s.agent, s.actionType]);
    expect(work).toEqual([['hector', 'research_report'], ['alphonso', 'assistant_write']]);
  }).timeout(300000);
});
