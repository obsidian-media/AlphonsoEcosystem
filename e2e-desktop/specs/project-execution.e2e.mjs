// Project Execution: intake -> generate the execution packet -> approval
// gates -> results. The Results tab must stay locked until every gate has
// been resolved. This subsystem is a deterministic planner (no model calls).
import { enterShell, mainText, buttonByText, openPage } from '../helpers.mjs';

const resultsTab = () => $('//main//button[translate(normalize-space(.), "RESULTS", "results")="results"]');
const approveButtons = () => $$('//main//button[translate(normalize-space(.), "APROVE", "aprove")="approve"]');

describe('Alphonso desktop Project Execution', () => {
  before(async () => {
    await enterShell();
    await openPage('work', 'project_execution');
  });

  it('generates an execution packet with approval gates', async () => {
    const name = await $('input[placeholder="Project name"]');
    await name.waitForDisplayed();
    await name.setValue('E2E project');
    await $('textarea[placeholder="Project description"]').setValue('A small landing page with a contact form.');
    const next = await buttonByText('continue to execution');
    await next.waitForEnabled();
    await next.click();
    const generate = await buttonByText('generate');
    await generate.waitForClickable();
    await generate.click();
    await browser.waitUntil(async () => (await mainText()).includes('ITEMS AWAITING APPROVAL'), {
      timeoutMsg: 'no approval gates appeared after generating the packet',
    });
    expect((await approveButtons()).length).toBeGreaterThan(0);
  });

  it('keeps Results locked while any gate is unresolved', async () => {
    expect(await (await resultsTab()).isEnabled()).toBe(false);
  });

  it('opens Results once every gate is approved', async () => {
    for (let remaining = (await approveButtons()).length; remaining > 0; remaining -= 1) {
      await (await approveButtons())[0].click();
      await browser.waitUntil(async () => (await approveButtons()).length === remaining - 1);
    }
    const proceed = await $('//main//button[normalize-space(.)="Continue"]');
    await proceed.waitForClickable();
    await proceed.click();
    await browser.waitUntil(async () => (await mainText()).includes('AGENT ASSIGNMENT BOARD'), {
      timeoutMsg: 'Results never opened after all gates were approved',
    });
    expect(await mainText()).toContain('Deliverable 1 for E2E project.');
  });
});
