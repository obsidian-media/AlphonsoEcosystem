// A live Telegram check with your own bot (Jose redesign phase 5). Skipped
// unless ALPHONSO_LIVE_TELEGRAM_TOKEN and ALPHONSO_LIVE_TELEGRAM_OWNER_CREDENTIAL are set for
// the test run; they are typed into Settings like any user would, never put in
// the app's environment or the repo, and live only in the test's throwaway
// profile. Needs you: send /start to your bot when asked, then press Approve on
// the message Jose sends. Run on its own:
//   npx wdio run e2e-desktop/wdio.conf.mjs --spec e2e-desktop/specs/jose-telegram-live.e2e.mjs
import { enterShell, invoke, mainText, buttonByText, ollamaHasModels, warmSelectedModel, clickSend } from '../helpers.mjs';

const BOT = process.env.ALPHONSO_LIVE_TELEGRAM_TOKEN || '';
const CHAT = process.env.ALPHONSO_LIVE_TELEGRAM_OWNER_CREDENTIAL || '';
const WAIT_FOR_YOU_MS = 15 * 60 * 1000;

async function useSettings(values) {
  const loaded = await invoke('load_settings');
  const saved = JSON.parse((loaded.ok && loaded.value) || '{}');
  await invoke('save_settings', { settingsJson: JSON.stringify({ ...saved, ...values }) });
  await browser.execute((extra) => {
    const settings = JSON.parse(localStorage.getItem('alphonso_settings') || '{}');
    localStorage.setItem('alphonso_settings', JSON.stringify({ ...settings, ...extra }));
  }, values);
}

const restart = async () => {
  await browser.refresh();
  await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
};

const savedRequests = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_requests_v1') || '[]'));
// The app saves the owner's chat id JSON-encoded (appStorage).
const ownerChat = async () => {
  const raw = await browser.execute(() => localStorage.getItem('alphonso_telegram_owner_chat_id'));
  try { return String(JSON.parse(raw)); } catch { return raw; }
};

describe('Alphonso desktop: Jose on your Telegram (live)', () => {
  before(async function () {
    if (!BOT || !CHAT) this.skip();
    if (!(await ollamaHasModels())) this.skip();
    await enterShell();
  });

  it('saves your bot in Settings and connects to it', async function () {
    await $('[aria-label="Open settings"]').click();
    // Settings opens on General; wait for it before choosing Connectors.
    await browser.waitUntil(async () => /API CREDENTIALS|General/.test(await mainText()), { timeout: 30000 });
    await buttonByText('Connectors').click();
    const token = await $('input[placeholder="Paste your bot token from @BotFather"]');
    await token.waitForExist({ timeout: 30000 });
    await token.scrollIntoView();
    await token.setValue(BOT);
    await (await $('input[placeholder="e.g. 123456789, 987654321"]')).setValue(CHAT);
    // The Telegram section's own buttons (every connector has a Save & Enable).
    const section = await token.$('./ancestor::div[contains(@class, "rounded-2xl")][1]');
    await (await section.$('.//button[normalize-space(.)="Save & Enable"]')).click();
    await (await section.$('.//button[normalize-space(.)="Verify Bot"]')).click();
    await browser.waitUntil(async () => /Connected as @/.test(await mainText()), { timeout: 60000, timeoutMsg: 'the bot did not connect' });
  }).timeout(120000);

  it('pairs when you send /start to your bot', async function () {
    await useSettings({ showPlanFirst: 'never', approvalMode: true, effectApprovals: { read: true, write_own_work: true } });
    await restart();
    console.log('\n>>> Send /start to your Telegram bot now. Waiting up to 15 minutes.\n');
    await browser.waitUntil(async () => (await ownerChat()) === CHAT, { timeout: WAIT_FOR_YOU_MS, interval: 3000, timeoutMsg: 'no /start arrived from your chat' });
  }).timeout(WAIT_FOR_YOU_MS + 120000);

  it('carries the request on when you press Approve in Telegram', async function () {
    await warmSelectedModel();
    await $('[data-testid="sidebar-chat-shortcut"]').click();
    const before = (await savedRequests()).length;
    const input = await $('[data-testid="chat-compose-input"]');
    await input.waitForDisplayed();
    await input.setValue('Plan this fresh: suggest three names for a small coffee shop.');
    await clickSend();
    await browser.waitUntil(async () => {
      const latest = (await savedRequests()).slice(-1)[0];
      return (await savedRequests()).length > before && latest.status === 'waiting_approval';
    }, { timeout: 900000, interval: 3000, timeoutMsg: 'the request never waited for approval' });
    const request = (await savedRequests()).slice(-1)[0];
    const waiting = request.steps.find((s) => s.status === 'waiting_approval').stepId;
    console.log('\n>>> Jose sent you an approval on Telegram. Press Approve. Waiting up to 15 minutes.\n');
    await browser.waitUntil(async () => {
      const now = (await savedRequests()).find((r) => r.id === request.id);
      return now.steps.find((s) => s.stepId === waiting).status === 'done';
    }, { timeout: WAIT_FOR_YOU_MS, interval: 3000, timeoutMsg: 'the approved step never ran' });
  }).timeout(WAIT_FOR_YOU_MS + 1200000);
});
