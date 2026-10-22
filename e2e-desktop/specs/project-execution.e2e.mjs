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
    // The panel re-renders after each approval, so a button found a moment
    // ago can be gone ("stale element", seen in CI on PR 305). Re-find and
    // retry until the count drops.
    while ((await approveButtons()).length > 0) {
      const before = (await approveButtons()).length;
      await browser.waitUntil(
        async () => {
          const buttons = await approveButtons();
          if (buttons.length < before) return true;
          try { await buttons[0].click(); } catch { /* re-rendered; try again */ }
          return false;
        },
        { timeout: 20000, interval: 1000, timeoutMsg: 'an approval click never took effect' }
      );
    }
    // QA Bug 5: the heading kept saying "4 items awaiting approval" after
    // every gate was approved.
    const afterApproval = (await mainText()).toLowerCase();
    expect(afterApproval).not.toContain('awaiting approval');
    expect(afterApproval).toContain('all gates resolved');
    // Depending on timing the panel shows its own Continue button, or the
    // page has already replaced it with "All gates resolved"; either way the
    // Results tab must now be open to the user.
    const proceed = await $('//main//button[normalize-space(.)="Continue"]');
    if ((await proceed.isExisting()) && (await proceed.isClickable())) {
      await proceed.click();
    } else {
      const resultsTab = await $('//main//button[normalize-space(.)="Results"]');
      await resultsTab.waitForClickable({ timeoutMsg: 'the Results tab never unlocked' });
      await resultsTab.click();
    }
    await browser.waitUntil(async () => (await mainText()).includes('AGENT ASSIGNMENT BOARD'), {
      timeoutMsg: 'Results never opened after all gates were approved',
    });
    expect(await mainText()).toContain('Deliverable 1 for E2E project.');
  });
});
