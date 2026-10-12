// Automation > Builder: create a visual workflow, add steps, save it and run
// it. Run used to only queue the workflow without executing it; this checks
// a run is reported as completed.
import { enterShell, mainText, buttonByText, openPage } from '../helpers.mjs';

const NAME = 'E2E flow';

describe('Alphonso desktop workflow builder', () => {
  before(async () => {
    await enterShell();
    await openPage('work', 'automation');
    await buttonByText('builder').click();
  });

  it('creates a workflow', async () => {
    const name = await $('input[placeholder="New workflow name"]');
    await name.waitForDisplayed();
    await name.setValue(NAME);
    const create = await $('[aria-label="Create workflow"]');
    await create.waitForEnabled();
    await create.click();
    await browser.waitUntil(async () => (await mainText()).includes(`${NAME} 0 steps`), {
      timeoutMsg: 'the new workflow never appeared',
    });
  });

  it('adds three steps', async () => {
    for (const [index, step] of ['trigger', 'notification', 'report'].entries()) {
      await buttonByText('add step').click();
      const choice = await buttonByText(step);
      await choice.waitForClickable();
      await choice.click();
      await browser.waitUntil(async () => (await mainText()).includes(`${index + 1} steps`), {
        timeoutMsg: `step ${index + 1} (${step}) was not added`,
      });
    }
    const text = await mainText();
    for (const label of ['TRIGGER', 'NOTIFICATION', 'REPORT']) expect(text).toContain(label);
  });

  it('saves and runs the workflow to completion', async () => {
    await buttonByText('save').click();
    const run = await $('//main//button[normalize-space(.)="Run"]');
    await run.waitForEnabled();
    await run.click();
    await browser.waitUntil(async () => (await mainText()).includes('Run completed'), {
      timeout: 60000,
      timeoutMsg: 'the run was never reported as completed',
    });
  });
});
