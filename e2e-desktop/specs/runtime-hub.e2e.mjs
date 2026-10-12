// Runtime Hub: the app must be able to stop and restart the Ollama it
// started itself at launch. Checked against the real port, not only the
// label on screen. Skipped if Ollama was already running before the app
// launched (then it is not the app's to stop) or never comes up (not
// installed, or auto-start is off).
import { enterShell, mainText, openPage } from '../helpers.mjs';

const OLLAMA_CARD = '//*[@data-testid="runtime-tool-ollama"]';
const ollamaCardText = async () => (await $(OLLAMA_CARD).getText()).toLowerCase();

async function ollamaAnswers() {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/version', { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForOllama(expected, timeout) {
  await browser.waitUntil(async () => (await ollamaAnswers()) === expected, {
    timeout,
    interval: 1000,
    timeoutMsg: `Ollama was still ${expected ? 'not answering' : 'answering'} after ${timeout / 1000}s`,
  });
}

describe('Alphonso desktop Runtime Hub', () => {
  before(async function () {
    const runningBeforeLaunch = await ollamaAnswers();
    await enterShell();
    if (runningBeforeLaunch) this.skip();
    try {
      await waitForOllama(true, 40000);
    } catch {
      this.skip();
    }
    await openPage('system', 'runtimes');
  });

  it('stops the Ollama it auto-started', async () => {
    const stop = await $(`${OLLAMA_CARD}//button[normalize-space(.)="Stop"]`);
    await stop.waitForClickable();
    await stop.click();
    await waitForOllama(false, 20000);
    await browser.waitUntil(async () => (await ollamaCardText()).includes('stopped'), {
      timeout: 15000,
      timeoutMsg: 'the Ollama card never showed "stopped"',
    });
    expect(await mainText()).not.toContain('was not started by Alphonso');
  });

  it('starts it again', async () => {
    const start = await $(`${OLLAMA_CARD}//button[normalize-space(.)="Start"]`);
    await start.waitForClickable();
    await start.click();
    await waitForOllama(true, 40000);
  });
});
