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
  sendSlackMessage: vi.fn(),
}));
import { sendSlackMessage } from '../../../services/connectors/connectorOutbound';
import { slackReason, SLACK_REASONS, clickupReason, CLICKUP_REASONS } from '../../../services/marcus/runSend';

import { generateAgentLlmResponse } from '../../../lib/ollama';
import { requireApproval } from '../../../services/approval/approvalService';
import * as slack from '../../../services/connectors/slackConnector';
import * as discord from '../../../services/connectors/discordConnector';
import * as github from '../../../services/connectors/githubConnector';
import * as n8n from '../../../services/connectors/n8nConnector';
import * as outbound from '../../../services/connectors/connectorOutbound';
import { saveConnectorCredential } from '../../../services/connectors/connectorAuth';
import { createJoseRequest, getJoseRequest, createWaitingPlanRequest, attachRunToRequest } from '../../../services/jose/joseRequestStore';
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
    // QA batch 1 (live check of 2.10.0, 2026-10-28): Slack refuses a bot token sent from the app
    // window ("Failed to fetch"), so the send goes through the backend (connector_slack_send).
    vi.mocked(sendSlackMessage).mockResolvedValue({ ok: true, ts: '1.2', channel: 'C1' } as never);
    const commandId = fresh();
    const r = await runMarcusSend(commandId, 'marcus', p());
    expect(sendSlackMessage).toHaveBeenCalledWith('#news', 'Open Saturday.', { approved: true, commandId });
    expect(slack.sendMessage).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: true, sentence: 'Sent to Slack #news.', link: null, platformId: '1.2' });
    expect(generateAgentLlmResponse).not.toHaveBeenCalled();
    expect(requireApproval).not.toHaveBeenCalled();
  });

  // Final review (agent phase 6): a plan approved first keeps its own request id; the send is still sent once.
  it('a send in a plan you approved first is sent once', async () => {
    const steps = [{ stepId: 'marcus', agent: 'marcus', actionType: 'distribution_execution', effects: ['publish_or_send'], needs: [] }];
    const waiting = createWaitingPlanRequest({ text: 'x', source: 'user', kind: 'normal', steps, plan: { source: 'fresh' }, runOptions: { source: 'user' } } as never);
    attachRunToRequest(waiting.id, { commandId: 'c-plan', steps } as never);
    vi.mocked(sendSlackMessage).mockResolvedValue({ ok: true, ts: '1.4' } as never);
    expect((await runMarcusSend('c-plan', 'marcus', p())).ok).toBe(true);
    expect(await runMarcusSend('c-plan', 'marcus', p())).toEqual({ ok: false, sentence: ALREADY_SENT });
    expect(sendSlackMessage).toHaveBeenCalledTimes(1);
  });

  // Final review: a refused send is tried again by the step's retries, not reported as "Already sent.".
  it('a send the platform refused can be tried again', async () => {
    const commandId = fresh();
    vi.mocked(sendSlackMessage).mockResolvedValueOnce({ ok: false, error: 'channel_not_found' } as never).mockResolvedValueOnce({ ok: true, ts: '1.3' } as never);
    expect(await runMarcusSend(commandId, 'marcus', p())).toEqual({ ok: false, sentence: `Not sent to Slack #news: ${SLACK_REASONS.channel_not_found}.` });
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
    vi.mocked(sendSlackMessage).mockResolvedValue({ ok: false, error: 'channel_not_found' } as never);
    expect((await runMarcusSend(fresh(), 'marcus', p())).sentence).toBe(`Not sent to Slack #news: ${SLACK_REASONS.channel_not_found}.`);
  });

  it('sends once', async () => {
    vi.mocked(sendSlackMessage).mockResolvedValue({ ok: true, ts: '1.2' } as never);
    const commandId = fresh();
    await runMarcusSend(commandId, 'marcus', p());
    expect(getJoseRequest(`jose-request-${commandId}`)?.steps[0].sentAtMs).toBeGreaterThan(0);
    expect(await runMarcusSend(commandId, 'marcus', p())).toEqual({ ok: false, sentence: ALREADY_SENT });
    expect(sendSlackMessage).toHaveBeenCalledTimes(1);
  });
});

// QA batch 1 (live ClickUp check): the list ID field held the workspace number, and the board
// showed ClickUp's "Team not authorized", which doesn't say what to fix.
describe('clickupReason', () => {
  it("turns ClickUp's refusals into what to do, and keeps anything else as ClickUp said it", () => {
    expect(clickupReason('Team not authorized')).toBe(CLICKUP_REASONS.not_your_list);
    expect(clickupReason('HTTP 401: {"err":"Team not authorized","ECODE":"OAUTH_027"}')).toBe(CLICKUP_REASONS.not_your_list);
    expect(CLICKUP_REASONS.not_your_list).toContain('/li/');
    expect(clickupReason('Oauth token not found')).toBe(CLICKUP_REASONS.bad_key);
    expect(clickupReason('Failed to fetch')).toBe('Failed to fetch');
  });

  it('a refused ClickUp send says what to fix', async () => {
    vi.mocked(outbound.sendClickUpConnectorTask).mockResolvedValueOnce({ ok: false, error: 'Team not authorized' } as never);
    const result = await runMarcusSend(fresh(), 'marcus', p({ connector: 'clickup', target: '', kind: 'task', title: 'Note', label: 'ClickUp' }));
    expect(result.ok).toBe(false);
    expect(result.sentence).toBe(`Not sent to ClickUp: ${CLICKUP_REASONS.not_your_list}.`);
  });
});

// QA batch 1 (third live run): Slack answered "HTTP 200: missing_scope" and the board showed it raw.
describe('slackReason', () => {
  it("turns Slack's codes into what to do, and keeps anything else as Slack said it", () => {
    expect(slackReason('HTTP 200: missing_scope')).toBe(SLACK_REASONS.missing_scope);
    expect(SLACK_REASONS.missing_scope).toContain('chat:write');
    expect(slackReason('not_in_channel')).toBe(SLACK_REASONS.not_in_channel);
    expect(slackReason('HTTP 200: invalid_auth')).toBe(SLACK_REASONS.invalid_auth);
    expect(slackReason('token_revoked')).toBe(SLACK_REASONS.invalid_auth);
    expect(slackReason('Failed to fetch')).toBe('Failed to fetch');
  });
});
