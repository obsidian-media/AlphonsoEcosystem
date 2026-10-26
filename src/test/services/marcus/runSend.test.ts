// Agent phase 5: after you approve, Marcus sends exactly the prepared preview, once, and says
// what the platform said. No model call, and no second approval anywhere.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../lib/ollama', () => ({ generateAgentLlmResponse: vi.fn() }));
vi.mock('../../../services/approval/approvalService', () => ({ requireApproval: vi.fn() }));
vi.mock('../../../services/connectors/slackConnector', () => ({ sendMessage: vi.fn() }));
vi.mock('../../../services/connectors/discordConnector', () => ({ sendMessage: vi.fn(), listGuildChannels: vi.fn() }));
vi.mock('../../../services/connectors/githubConnector', () => ({ createRelease: vi.fn(), createIssue: vi.fn() }));
vi.mock('../../../services/connectors/n8nConnector', () => ({ triggerN8nWebhook: vi.fn() }));
vi.mock('../../../services/connectors/connectorOutbound', () => ({
  sendTelegramConnectorMessage: vi.fn(), sendWhatsAppConnectorMessage: vi.fn(), sendNotionConnectorEntry: vi.fn(), sendClickUpConnectorTask: vi.fn(),
}));

import { generateAgentLlmResponse } from '../../../lib/ollama';
import { requireApproval } from '../../../services/approval/approvalService';
import * as slack from '../../../services/connectors/slackConnector';
import * as discord from '../../../services/connectors/discordConnector';
import * as github from '../../../services/connectors/githubConnector';
import * as n8n from '../../../services/connectors/n8nConnector';
import * as outbound from '../../../services/connectors/connectorOutbound';
import { saveConnectorCredential } from '../../../services/connectors/connectorAuth';
import { createJoseRequest, getJoseRequest } from '../../../services/jose/joseRequestStore';
import { runMarcusSend, ALREADY_SENT, WHATSAPP_24H } from '../../../services/marcus/runSend';

const p = (extra: Record<string, unknown> = {}) => ({
  connector: 'slack', target: '#news', kind: 'message', label: 'Slack #news', text: 'Open Saturday.', sourceStepId: 'write', preparedAtMs: 1, ...extra,
}) as never;
let n = 0;
const fresh = () => {
  n += 1;
  const commandId = `c${n}`;
  createJoseRequest({ commandId, source: 'user', text: 'x', kind: 'normal', steps: [{ stepId: 'marcus', agent: 'marcus', actionType: 'distribution_execution', effects: ['publish_or_send'], needs: [] }] as never });
  return commandId;
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  for (const [c, k, v] of [['slack', 'SLACK_BOT_TOKEN', 'xoxb-1'], ['discord', 'DISCORD_BOT_TOKEN', 'd-1'], ['discord', 'DISCORD_GUILD_ID', 'G'], ['github', 'GITHUB_TOKEN', 'ghp_1'], ['telegram', 'TELEGRAM_TEAM_CHAT_ID', '-100123'], ['n8n', 'N8N_BASE_URL', 'http://127.0.0.1:5678'], ['n8n', 'N8N_WORKFLOWS', 'Team notes: team-notes']]) {
    saveConnectorCredential(c, k, v);
  }
});

describe('runMarcusSend', () => {
  it('sends the saved preview without a model call and never asks a second approval', async () => {
    vi.mocked(slack.sendMessage).mockResolvedValue({ ts: '1.2', channel: 'C1', text: 'Open Saturday.' } as never);
    const r = await runMarcusSend(fresh(), 'marcus', p());
    expect(slack.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ token: 'xoxb-1' }), '#news', 'Open Saturday.');
    expect(r).toEqual({ ok: true, sentence: 'Sent to Slack #news.', link: null, platformId: '1.2' });
    expect(generateAgentLlmResponse).not.toHaveBeenCalled();
    expect(requireApproval).not.toHaveBeenCalled();
  });

  // Final review: a refused send is tried again by the step's retries, not reported as "Already sent.".
  it('a send the platform refused can be tried again', async () => {
    const commandId = fresh();
    vi.mocked(slack.sendMessage).mockRejectedValueOnce(new Error('channel_not_found')).mockResolvedValueOnce({ ts: '1.3' } as never);
    expect(await runMarcusSend(commandId, 'marcus', p())).toEqual({ ok: false, sentence: 'Not sent to Slack #news: channel_not_found.' });
    expect(getJoseRequest(`jose-request-${commandId}`).steps[0].sentAtMs).toBeUndefined();
    expect((await runMarcusSend(commandId, 'marcus', p())).sentence).toBe('Sent to Slack #news.');
    expect((await runMarcusSend(commandId, 'marcus', p())).sentence).toBe(ALREADY_SENT);
  });

  it('each result sentence', async () => {
    vi.mocked(discord.listGuildChannels).mockResolvedValue([{ id: 'C', name: 'news' }] as never);
    vi.mocked(discord.sendMessage).mockResolvedValue({ id: 'M', channelId: 'C' } as never);
    expect((await runMarcusSend(fresh(), 'marcus', p({ connector: 'discord', label: 'Discord #news' }))).sentence).toBe('Sent to Discord #news: https://discord.com/channels/G/C/M');

    vi.mocked(outbound.sendTelegramConnectorMessage).mockResolvedValue({ ok: true } as never);
    expect((await runMarcusSend(fresh(), 'marcus', p({ connector: 'telegram', target: 'team', label: 'your team chat on Telegram' }))).sentence).toBe('Sent to your team chat on Telegram.');
    expect(outbound.sendTelegramConnectorMessage).toHaveBeenCalledWith('-100123', 'Open Saturday.', expect.objectContaining({ approved: true }));

    vi.mocked(outbound.sendWhatsAppConnectorMessage).mockResolvedValue({ ok: true } as never);
    expect((await runMarcusSend(fresh(), 'marcus', p({ connector: 'whatsapp', target: '15550102030', label: 'WhatsApp +15550102030' }))).sentence).toBe('Sent to WhatsApp +15550102030.');

    vi.mocked(github.createRelease).mockResolvedValue({ id: 9 } as never);
    expect((await runMarcusSend(fresh(), 'marcus', p({ connector: 'github', target: 'acme/shop', kind: 'release', title: 'v1.2.0', label: 'GitHub acme/shop', text: 'Fixed login.' }))).sentence)
      .toBe('Draft release v1.2.0 made on GitHub acme/shop: https://github.com/acme/shop/releases. Publish it on GitHub.');
    expect(github.createRelease).toHaveBeenCalledWith(expect.objectContaining({ owner: 'acme', repo: 'shop' }), 'v1.2.0', 'v1.2.0', 'Fixed login.', true, false);

    vi.mocked(github.createIssue).mockResolvedValue({ number: 12 } as never);
    expect((await runMarcusSend(fresh(), 'marcus', p({ connector: 'github', target: 'acme/shop', kind: 'issue', title: 'Login fails', label: 'GitHub acme/shop', text: 'It fails.' }))).sentence)
      .toBe('Issue #12 opened on GitHub acme/shop: https://github.com/acme/shop/issues/12.');

    vi.mocked(outbound.sendNotionConnectorEntry).mockResolvedValue({ ok: true, externalId: 'ab-cd' } as never);
    expect((await runMarcusSend(fresh(), 'marcus', p({ connector: 'notion', target: '', kind: 'page', title: 'Notes', label: 'Notion' }))).sentence).toBe('Notion page made: https://www.notion.so/abcd');

    vi.mocked(outbound.sendClickUpConnectorTask).mockResolvedValue({ ok: true } as never);
    expect((await runMarcusSend(fresh(), 'marcus', p({ connector: 'clickup', target: '', kind: 'task', title: 'Do it', label: 'ClickUp' }))).sentence).toBe('ClickUp task made.');

    vi.mocked(n8n.triggerN8nWebhook).mockResolvedValue({ ok: true } as never);
    expect((await runMarcusSend(fresh(), 'marcus', p({ connector: 'n8n', target: 'Team notes', kind: 'trigger', label: 'n8n workflow Team notes' }))).sentence).toBe('Started your n8n workflow Team notes.');
    expect(n8n.triggerN8nWebhook).toHaveBeenCalledWith('team-notes', expect.objectContaining({ text: 'Open Saturday.' }));
  });

  it('WhatsApp error 131047 → the 24-hour sentence', async () => {
    vi.mocked(outbound.sendWhatsAppConnectorMessage).mockResolvedValue({ ok: false, error: 'Message failed (#131047) Re-engagement message' } as never);
    const r = await runMarcusSend(fresh(), 'marcus', p({ connector: 'whatsapp', target: '15550102030', label: 'WhatsApp +15550102030' }));
    expect(r).toMatchObject({ ok: false, sentence: `Not sent to WhatsApp +15550102030: ${WHATSAPP_24H}` });
  });

  it("a refusal says the platform's reason", async () => {
    vi.mocked(slack.sendMessage).mockRejectedValue(new Error('channel_not_found'));
    expect((await runMarcusSend(fresh(), 'marcus', p())).sentence).toBe('Not sent to Slack #news: channel_not_found.');
  });

  it('sends once', async () => {
    vi.mocked(slack.sendMessage).mockResolvedValue({ ts: '1.2' } as never);
    const commandId = fresh();
    await runMarcusSend(commandId, 'marcus', p());
    expect(getJoseRequest(`jose-request-${commandId}`)?.steps[0].sentAtMs).toBeGreaterThan(0);
    expect(await runMarcusSend(commandId, 'marcus', p())).toEqual({ ok: false, sentence: ALREADY_SENT });
    expect(slack.sendMessage).toHaveBeenCalledTimes(1);
  });
});
