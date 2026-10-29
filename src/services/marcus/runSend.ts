// Sending what you approved (agent phase 5): exactly the prepared preview, once, through the
// connector, with no model call and no second approval. The result says what the platform said.
import { getConnectorCredential } from '../connectors/connectorAuth';
import { requestForCommand, updateJoseStep } from '../jose/joseRequestStore';
import { listedN8nWorkflows, telegramOwnerChatId } from './destinations';
import type { SendPreview, SendResult } from './types';

export const ALREADY_SENT = 'Already sent.';
export const WHATSAPP_24H = 'WhatsApp only lets you message someone within 24 hours of their last message to you; outside that it needs an approved template.';
export const COMPOSIO_NOT_READY = "Composio sending isn't ready yet.";

const setting = (connector: string, key: string) => String(getConnectorCredential(connector, key) || '').trim();
const message = (error: unknown) => String((error as Error)?.message || error || 'it failed').replace(/\.$/, '');
/** What to do when Slack refuses a send, by Slack's own error code (QA batch 1: "missing_scope" was shown raw). */
export const SLACK_REASONS = {
  missing_scope: "Slack's bot isn't allowed to post: add the chat:write scope under OAuth & Permissions in your Slack app, reinstall the app, then paste the new Bot User OAuth Token (xoxb-…) in Settings → Connectors → Slack",
  not_in_channel: "the bot isn't in that channel: type /invite @your-bot-name in the channel",
  channel_not_found: "Slack has no channel by that name that the bot can see: check the name, or invite the bot to it",
  invalid_auth: "Slack refused the token: paste a current Bot User OAuth Token (xoxb-…) in Settings → Connectors → Slack",
} as const;
const SLACK_SAME_AS: Record<string, keyof typeof SLACK_REASONS> = { token_revoked: 'invalid_auth', not_authed: 'invalid_auth', account_inactive: 'invalid_auth', token_expired: 'invalid_auth' };

export function slackReason(error: string): string {
  const code = String(error || '').trim().match(/([a-z_]+)$/)?.[1] || '';
  const known = (code in SLACK_REASONS ? code : SLACK_SAME_AS[code]) as keyof typeof SLACK_REASONS | undefined;
  return known ? SLACK_REASONS[known] : String(error || '');
}

const notSent = (label: string, reason: string): SendResult => ({ ok: false, sentence: `Not sent to ${label}: ${reason.replace(/\.$/, '')}.` });

/** Whether a step's send already went out; sets the mark before sending when not. */
function claim(commandId: string, stepId: string): boolean {
  const request = requestForCommand(commandId);
  const step = request?.steps.find((s) => s.stepId === stepId);
  if (!request || !step) return true;
  if (step.sentAtMs) return false;
  updateJoseStep(request.id, stepId, { sentAtMs: Date.now() });
  return true;
}

async function send(preview: SendPreview, commandId: string): Promise<SendResult> {
  const { connector, target, text, label } = preview;
  const options = { approved: true, commandId };
  switch (connector) {
    case 'slack': {
      // Through the backend (QA batch 1): Slack refuses a bot token sent from the app window, so every
      // send from the window failed with "Failed to fetch". Discord and GitHub accept it and stay as they are.
      const { sendSlackMessage } = await import('../connectors/connectorOutbound');
      const channel = target.startsWith('#') || /^[CGD][A-Z0-9]{6,}$/.test(target) ? target : `#${target}`;
      const r = await sendSlackMessage(channel, text, options) as { ok?: boolean; error?: string; ts?: string | null };
      return r?.ok ? { ok: true, sentence: `Sent to ${label}.`, link: null, platformId: r.ts || null } : notSent(label, slackReason(String(r?.error || 'Slack refused it')));
    }
    case 'discord': {
      const discord = await import('../connectors/discordConnector');
      const botToken = setting('discord', 'DISCORD_BOT_TOKEN');
      const guild = setting('discord', 'DISCORD_GUILD_ID');
      let channelId = target;
      if (!/^\d+$/.test(target)) {
        const name = target.replace(/^#/, '').toLowerCase();
        const found = (await discord.listGuildChannels({ botToken } as never, guild)).find((c) => String(c.name).toLowerCase() === name);
        if (!found) return notSent(label, `there is no channel #${name} in your Discord server`);
        channelId = found.id;
      }
      const sent = await discord.sendMessage({ botToken } as never, channelId, text);
      const link = guild && sent?.id ? `https://discord.com/channels/${guild}/${channelId}/${sent.id}` : null;
      return { ok: true, sentence: link ? `Sent to ${label}: ${link}` : `Sent to ${label}.`, link, platformId: sent?.id || null };
    }
    case 'telegram': {
      const { sendTelegramConnectorMessage } = await import('../connectors/connectorOutbound');
      const chatId = target === 'me' ? telegramOwnerChatId() : setting('telegram', 'TELEGRAM_TEAM_CHAT_ID');
      if (!chatId) return notSent(label, target === 'me' ? 'pair Telegram first with /start' : 'set your team chat in Settings → Connectors → Telegram');
      const r = await sendTelegramConnectorMessage(chatId, text, options) as { ok?: boolean; error?: string; externalId?: string };
      return r?.ok ? { ok: true, sentence: `Sent to ${label}.`, link: null, platformId: r.externalId || null } : notSent(label, String(r?.error || 'Telegram refused it'));
    }
    case 'whatsapp': {
      const { sendWhatsAppConnectorMessage } = await import('../connectors/connectorOutbound');
      const r = await sendWhatsAppConnectorMessage(target.replace(/\D/g, ''), text, options) as { ok?: boolean; error?: string; externalId?: string };
      if (r?.ok) return { ok: true, sentence: `Sent to ${label}.`, link: null, platformId: r.externalId || null };
      const error = String(r?.error || 'WhatsApp refused it');
      return notSent(label, /131047|re-engagement|24 hours/i.test(error) ? WHATSAPP_24H : error);
    }
    case 'github': {
      const github = await import('../connectors/githubConnector');
      const [owner, repo] = target.split('/');
      const config = { token: setting('github', 'GITHUB_TOKEN'), owner, repo };
      if (preview.kind === 'release') {
        const version = preview.title || '';
        const release = await github.createRelease(config as never, version, version, text, true, false);
        const link = `https://github.com/${owner}/${repo}/releases`;
        return { ok: true, sentence: `Draft release ${version} made on ${label}: ${link}. Publish it on GitHub.`, link, platformId: release?.id ? String(release.id) : null };
      }
      const issue = await github.createIssue(config as never, preview.title || text.split('\n')[0].slice(0, 80), text, []);
      const link = `https://github.com/${owner}/${repo}/issues/${issue.number}`;
      return { ok: true, sentence: `Issue #${issue.number} opened on ${label}: ${link}.`, link, platformId: String(issue.number) };
    }
    case 'notion': {
      const { sendNotionConnectorEntry } = await import('../connectors/connectorOutbound');
      const r = await sendNotionConnectorEntry({ title: preview.title || text.split('\n')[0].slice(0, 80), content: text, parentPageId: target || setting('notion', 'NOTION_PARENT_PAGE_ID') }, options) as { ok?: boolean; error?: string; externalId?: string };
      if (!r?.ok) return notSent(label, String(r?.error || 'Notion refused it'));
      const link = r.externalId ? `https://www.notion.so/${String(r.externalId).replace(/-/g, '')}` : null;
      return { ok: true, sentence: link ? `Notion page made: ${link}` : 'Notion page made.', link, platformId: r.externalId || null };
    }
    case 'clickup': {
      const { sendClickUpConnectorTask } = await import('../connectors/connectorOutbound');
      const r = await sendClickUpConnectorTask({ title: preview.title || text.split('\n')[0].slice(0, 80), content: text, listId: target || setting('clickup', 'CLICKUP_LIST_ID') }, options) as { ok?: boolean; error?: string; externalId?: string };
      if (!r?.ok) return notSent(label, String(r?.error || 'ClickUp refused it'));
      const link = r.externalId ? `https://app.clickup.com/t/${r.externalId}` : null;
      return { ok: true, sentence: link ? `ClickUp task made: ${link}` : 'ClickUp task made.', link, platformId: r.externalId || null };
    }
    case 'n8n': {
      const workflow = listedN8nWorkflows().find((w) => w.name.toLowerCase() === target.toLowerCase());
      if (!workflow) return notSent(label, 'that workflow is not in your list in Settings → Connectors → n8n');
      const n8n = await import('../connectors/n8nConnector');
      const r = await n8n.triggerN8nWebhook(workflow.path, { text, title: preview.title || '', source: 'alphonso' });
      return r?.ok ? { ok: true, sentence: `Started your ${label}.`, link: null, platformId: null } : notSent(label, String(r?.error || 'n8n refused it'));
    }
    case 'composio': {
      if (!preview.composio) return notSent(label, COMPOSIO_NOT_READY);
      const { executeComposioTool } = await import('../composioService');
      const { toolkit, tool, args } = preview.composio;
      const r = await executeComposioTool(tool, args, { toolkit, approved: true });
      const words = tool.toLowerCase().split('_').filter((w, i) => !(i === 0 && w === toolkit.toLowerCase())).join(' ');
      return r.success ? { ok: true, sentence: `Done on ${label}: ${words}${target ? ` to ${target}` : ''}.`, link: null, platformId: null } : notSent(label, String(r.error || 'Composio refused it'));
    }
    default:
      return notSent(label, COMPOSIO_NOT_READY);
  }
}

/** A send that didn't go out may be tried again (the step's retries, Carry on). */
function release(commandId: string, stepId: string): void {
  try { const request = requestForCommand(commandId); if (request) updateJoseStep(request.id, stepId, { sentAtMs: undefined }); } catch { /* no request */ }
}

export async function runMarcusSend(commandId: string, stepId: string, preview: SendPreview): Promise<SendResult> {
  if (!claim(commandId, stepId)) return { ok: false, sentence: ALREADY_SENT };
  let result: SendResult;
  try {
    result = await send(preview, commandId);
  } catch (error) {
    result = notSent(preview.label, message(error));
  }
  if (!result.ok) release(commandId, stepId);
  return result;
}
