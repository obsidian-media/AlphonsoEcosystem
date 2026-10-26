// Agent phase 5: Marcus's model picks where a send goes, from connectors you set up; the
// answer is checked, so a channel nobody named (#general) is never used.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../lib/ollama', () => ({ generateAgentLlmResponse: vi.fn() }));

import { generateAgentLlmResponse } from '../../../lib/ollama';
import { saveConnectorCredential } from '../../../services/connectors/connectorAuth';
import { pickDestination, hintFromTaskType, NO_DESTINATION, CAMPAIGN_STUDIO_ONLY } from '../../../services/marcus/pickDestination';

const llm = vi.mocked(generateAgentLlmResponse);
const say = (o: unknown) => ({ response: JSON.stringify(o) }) as never;
const REQ = '/jose Write a two-sentence announcement that our bakery opens on Saturday, then post it to our Slack channel #news.';

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
    const got = await pickDestination(REQ, 'Open Saturday.', {});
    expect(got).toMatchObject({ ok: true, destination: { connector: 'slack', target: '#news', label: 'Slack #news' } });
    expect(llm).toHaveBeenCalledTimes(2);
    expect(String((llm.mock.calls[1][1] as { prompt: string }).prompt)).toContain('"#general" was not named in the request and is not a default.');
  });

  it('the prompt has the request with keys hidden, the text and only set-up connectors', async () => {
    llm.mockResolvedValueOnce(say({ connector: 'slack', target: '#news', kind: 'message' }));
    await pickDestination(`${REQ} key sk-live-1234abcd5678efgh`, 'Open Saturday.', {});
    const prompt = String((llm.mock.calls[0][1] as { prompt: string }).prompt);
    expect(prompt).not.toContain('sk-live-1234abcd5678efgh');
    expect(prompt).toContain('Open Saturday.');
    expect(prompt).toContain('slack');
    expect(prompt).not.toMatch(/\bdiscord\b/);
  });

  it('unreadable twice → NO_DESTINATION', async () => {
    llm.mockResolvedValue({ response: 'no idea' } as never);
    expect(await pickDestination(REQ, 'x', {})).toEqual({ ok: false, outcome: 'failed', reason: NO_DESTINATION });
    expect(NO_DESTINATION).toBe("Marcus couldn't tell where to send this: name the channel, or set a default in Settings → Connectors.");
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
    const got = await pickDestination(REQ, 'Open Saturday.', {});
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
