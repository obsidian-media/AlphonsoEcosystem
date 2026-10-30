// Agent phase 5: Marcus's model picks where a send goes, from connectors you set up; the
// answer is checked, so a channel nobody named (#general) is never used.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../lib/ollama', () => ({ generateAgentLlmResponse: vi.fn() }));

import { generateAgentLlmResponse } from '../../../lib/ollama';
import { saveConnectorCredential } from '../../../services/connectors/connectorAuth';
import { pickDestination, hintFromTaskType, NO_DESTINATION, MARCUS_MODEL_FAILED, CAMPAIGN_STUDIO_ONLY, NEWSLETTER_NEEDS, mailTools } from '../../../services/marcus/pickDestination';

const llm = vi.mocked(generateAgentLlmResponse);
const say = (o: unknown) => ({ response: JSON.stringify(o) }) as never;
const REQ = '/jose Write a two-sentence announcement that our bakery opens on Saturday, then post it to our Slack channel #news.';
// Two channels named: Marcus's model has to choose (one named channel needs no model, QA batch 1).
const REQ_TWO = '/jose Write a two-sentence announcement that our bakery opens on Saturday, then post it to Slack #news or #updates.';

beforeEach(() => {
  localStorage.clear();
  llm.mockReset();
  saveConnectorCredential('slack', 'SLACK_BOT_TOKEN', 'xoxb-1');
});

describe('pickDestination', () => {
  it('a given destination skips the model and is still checked', async () => {
    const ok = await pickDestination(REQ, 'Open Saturday.', { given: { connector: 'slack', target: '#news' } });
    expect(ok).toEqual({ ok: true, destination: { connector: 'slack', target: '#news', kind: 'message', label: 'Slack #news' } });
    const bad = await pickDestination(REQ, 'Open Saturday.', { given: { connector: 'slack', target: '#general' } });
    expect(bad.ok).toBe(false);
    expect(llm).not.toHaveBeenCalled();
  });

  it('a model answer naming #general is refused and asked again', async () => {
    llm.mockResolvedValueOnce(say({ connector: 'slack', target: '#general', kind: 'message', reason: 'default' }))
      .mockResolvedValueOnce(say({ connector: 'slack', target: '#news', kind: 'message', reason: 'named' }));
    const got = await pickDestination(REQ_TWO, 'Open Saturday.', {});
    expect(got).toMatchObject({ ok: true, destination: { connector: 'slack', target: '#news', label: 'Slack #news' } });
    expect(llm).toHaveBeenCalledTimes(2);
    expect(String((llm.mock.calls[1][1] as { prompt: string }).prompt)).toContain('"#general" was not named in the request and is not a default.');
  });

  it('the prompt has the request with keys hidden, the text and only set-up connectors', async () => {
    llm.mockResolvedValueOnce(say({ connector: 'slack', target: '#news', kind: 'message' }));
    await pickDestination(`${REQ_TWO} key sk-live-1234abcd5678efgh`, 'Open Saturday.', {});
    const prompt = String((llm.mock.calls[0][1] as { prompt: string }).prompt);
    expect(prompt).not.toContain('sk-live-1234abcd5678efgh');
    expect(prompt).toContain('Open Saturday.');
    expect(prompt).toContain('slack');
    expect(prompt).not.toMatch(/\bdiscord\b/);
  });

  it('unreadable twice → NO_DESTINATION', async () => {
    llm.mockResolvedValue({ response: 'no idea' } as never);
    expect(await pickDestination(REQ_TWO, 'x', {})).toEqual({ ok: false, outcome: 'failed', reason: NO_DESTINATION });
    expect(NO_DESTINATION).toBe("Marcus couldn't tell where to send this: name the channel, or set a default in Settings → Connectors.");
  });

  // QA batch 1 (live check of 2.10.0, 2026-10-28): "post it to Slack #test" failed with "Marcus
  // couldn't tell where to send this": a channel that isn't a saved default went to the model.
  it('one named connector and one named #channel are used without asking the model', async () => {
    const got = await pickDestination('/jose Write a one-line note that the test worked, and post it to Slack #test', 'It worked.', {});
    expect(got).toEqual({ ok: true, destination: { connector: 'slack', target: '#test', kind: 'message', label: 'Slack #test' } });
    expect(llm).not.toHaveBeenCalled();
  });

  it("when Marcus's model doesn't answer, he says so rather than blaming the channel", async () => {
    llm.mockRejectedValue(new Error('model not found'));
    expect(await pickDestination(REQ_TWO, 'x', {})).toEqual({ ok: false, outcome: 'failed', reason: MARCUS_MODEL_FAILED });
    expect(MARCUS_MODEL_FAILED).toBe("Marcus's model didn't answer, so he couldn't choose where to send this. Check that Ollama is running, or name one channel (for example Slack #news).");
  });

  it('a connector that is not set up → setup with its sentence', async () => {
    const got = await pickDestination('/jose tell my team on Telegram the meeting moved', 'Moved to 3pm.', { hint: 'telegram' });
    expect(got).toEqual({ ok: false, outcome: 'setup', reason: "Telegram isn't set up: add the bot token in Settings → Connectors → Telegram." });
  });

  it('a connector the request names but that is not set up → setup, without asking the model', async () => {
    const got = await pickDestination('/jose post a short note that we open at 9 to Discord #news', 'We open at 9.', {});
    expect(got).toEqual({ ok: false, outcome: 'setup', reason: "Discord isn't set up: add the bot token in Settings → Connectors → Discord." });
    expect(llm).not.toHaveBeenCalled();
  });

  // The desktop run (2026-10-26): offered only n8n, the 7B model answered Slack.
  it('a model answer naming a connector it was not offered is asked again', async () => {
    saveConnectorCredential('discord', 'DISCORD_BOT_TOKEN', 'd-1');
    saveConnectorCredential('discord', 'DISCORD_GUILD_ID', 'G');
    llm.mockResolvedValueOnce(say({ connector: 'telegram', target: 'team', kind: 'message' }))
      .mockResolvedValueOnce(say({ connector: 'slack', target: '#news', kind: 'message' }));
    const got = await pickDestination(REQ_TWO, 'Open Saturday.', {});
    expect(got).toMatchObject({ ok: true, destination: { connector: 'slack', target: '#news' } });
    expect(String((llm.mock.calls[1][1] as { prompt: string }).prompt)).toContain('"telegram" is not one of the connectors offered.');
  });

  it('a listed n8n workflow the request names is used without asking the model', async () => {
    saveConnectorCredential('n8n', 'N8N_BASE_URL', 'http://127.0.0.1:5678');
    saveConnectorCredential('n8n', 'N8N_WORKFLOWS', 'Team notes: team-notes; Releases: release-hook');
    const got = await pickDestination('/jose Write a one-line note that the shop opens at 9 and send it to my n8n workflow Team notes.', 'We open at 9.', {});
    expect(got).toMatchObject({ ok: true, destination: { connector: 'n8n', target: 'Team notes', label: 'n8n workflow Team notes' } });
    expect(llm).not.toHaveBeenCalled();
    saveConnectorCredential('n8n', 'N8N_BASE_URL', '');
    saveConnectorCredential('n8n', 'N8N_WORKFLOWS', '');
  });

  it('Instagram asked from Chat → CAMPAIGN_STUDIO_ONLY', async () => {
    llm.mockResolvedValueOnce(say({ connector: 'instagram', target: 'feed', kind: 'message' }));
    const got = await pickDestination('/jose post this on Instagram', 'Hi', {});
    expect(got).toEqual({ ok: false, outcome: 'failed', reason: CAMPAIGN_STUDIO_ONLY });
    expect(CAMPAIGN_STUDIO_ONLY).toBe("Marcus posts to Instagram, Facebook and YouTube from Miya Studio's Campaign Studio.");
  });

  it('a release needs its version', async () => {
    saveConnectorCredential('github', 'GITHUB_TOKEN', 'ghp_1');
    const ok = await pickDestination('/jose Create a GitHub release v1.2.0 for acme/shop', 'Fixed login.', { given: { connector: 'github', target: 'acme/shop', kind: 'release' } });
    expect(ok).toMatchObject({ ok: true, destination: { kind: 'release', title: 'v1.2.0' } });
    const no = await pickDestination('/jose Create a GitHub release for acme/shop', 'Fixed login.', { given: { connector: 'github', target: 'acme/shop', kind: 'release' } });
    expect(no).toEqual({ ok: false, outcome: 'failed', reason: 'Say which version to release.' });
  });

  it('the hint from the task type', () => {
    expect(hintFromTaskType('distribution_slack')).toBe('slack');
    expect(hintFromTaskType('distribution_release')).toBe('github');
    expect(hintFromTaskType('distribution_execution')).toBeUndefined();
  });
});

// Agent roles Part C2: a newsletter goes through an n8n workflow or a mail app in Composio only.
describe('a newsletter', () => {
  const NEWS = 'Write our October newsletter and send it to our subscribers through n8n workflow Newsletter.';
  const opts = { actionType: 'distribution_newsletter' };

  it('says what to set up when neither n8n nor a mail app is', async () => {
    expect(await pickDestination('Write our October newsletter and send it to our subscribers.', 'Hello readers.', opts))
      .toEqual({ ok: false, outcome: 'setup', reason: NEWSLETTER_NEEDS });
    // Naming n8n while it isn't set up says that more exactly.
    expect(await pickDestination(NEWS, 'Hello readers.', opts)).toMatchObject({ ok: false, outcome: 'setup', reason: expect.stringContaining("n8n isn't set up") });
    expect(llm).not.toHaveBeenCalled();
  });

  it('goes to the n8n workflow the request names', async () => {
    saveConnectorCredential('n8n', 'N8N_BASE_URL', 'http://127.0.0.1:5678');
    saveConnectorCredential('n8n', 'N8N_WORKFLOWS', 'Newsletter: news-hook');
    const got = await pickDestination(NEWS, 'Hello readers.', opts);
    expect(got).toMatchObject({ ok: true, destination: { connector: 'n8n', target: 'Newsletter' } });
  });

  it('is never sent to Slack, even when Slack is named', async () => {
    saveConnectorCredential('n8n', 'N8N_BASE_URL', 'http://127.0.0.1:5678');
    saveConnectorCredential('n8n', 'N8N_WORKFLOWS', 'Newsletter: news-hook');
    expect(await pickDestination('Send the newsletter to Slack #news', 'Hello readers.', { ...opts, given: { connector: 'slack', target: '#news' } }))
      .toEqual({ ok: false, outcome: 'setup', reason: NEWSLETTER_NEEDS });
  });

  it("offers only mail apps' tools from Composio", () => {
    const tool = (toolkit: string) => ({ name: `${toolkit}_send`, description: '', toolkit, parameters: {}, enabled: true });
    expect(mailTools([tool('gmail'), tool('slack'), tool('mailchimp'), tool('notion')]).map((t) => t.toolkit)).toEqual(['gmail', 'mailchimp']);
  });
});
