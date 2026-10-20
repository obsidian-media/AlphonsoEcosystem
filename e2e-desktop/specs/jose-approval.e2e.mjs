// Orchestrator: a command given to Jose becomes a packet that waits for
// approval, and only moves on when a person approves and then executes it.
// This checks the approval state machine (pending -> approved -> executed)
// and the visible execution result produced by the packet executor.
import { enterShell, mainText, buttonByText, openPage } from '../helpers.mjs';

const COMMAND = 'Research what the IANA example domain is used for.';
const exact = (label) => $(`//main//button[normalize-space(.)="${label}"]`);

describe('Alphonso desktop Jose approvals', () => {
  before(async () => {
    await enterShell();
    await openPage('system', 'orchestrator');
  });

  it('holds a new command for approval instead of running it', async () => {
    const command = await $('main textarea');
    await command.waitForDisplayed();
    await command.setValue(COMMAND);
    await buttonByText('send to jose').click();
    await browser.waitUntil(async () => (await mainText()).includes('APPROVALS (1)'), {
      timeoutMsg: 'the command never produced a pending approval',
    });
    const text = await mainText();
    expect(text).toContain('PENDING 1');
    expect(text).not.toContain('executed');
  });

  it('clears the approval queue when the packet is approved', async () => {
    await buttonByText('approvals').click();
    const approve = await exact('Approve');
    await approve.waitForClickable();
    await approve.click();
    await browser.waitUntil(async () => (await mainText()).includes('No pending approvals.'), {
      timeoutMsg: 'the packet was still pending after Approve',
    });
    expect(await mainText()).toContain('PENDING 0');
  });

  it('executes the approved packet only on request', async () => {
    await buttonByText('packets').click();
    await browser.waitUntil(async () => (await mainText()).includes('ACTIVE HANDOFFS'));
    expect(await mainText()).toMatch(/used for\. approved jose → hector/);
    const execute = await exact('Execute');
    await execute.waitForClickable();
    await execute.click();
    await browser.waitUntil(async () => /used for\. executed jose → hector/.test(await mainText()), {
      timeout: 60000,
      timeoutMsg: 'the packet never reached "executed"',
    });
    const output = await mainText();
    expect(output).toContain('Execution Results');
    expect(output).toContain('Task queued — no live runtime adapter');
  });
});
