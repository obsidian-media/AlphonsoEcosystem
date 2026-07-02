import { evaluatePolicyGate } from '../policyEnforcementService';

const DISCORD_API_BASE = 'https://discord.com/api/v10';

export interface DiscordConfig {
  botToken: string;
  defaultChannelId?: string;
}

export interface DiscordMessage {
  id: string;
  channelId: string;
  content: string;
  authorId: string;
  timestamp: string;
}

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  guildId: string;
  topic: string;
}

async function discordRequest(
  method: string,
  path: string,
  config: DiscordConfig,
  body?: Record<string, any>
): Promise<any> {
  // Policy gate check
  const gate = evaluatePolicyGate({
    connectorId: 'discord',
    actionType: path ? String(path).toLowerCase() : 'request',
    commandPreview: JSON.stringify({ method, path, body }),
    approved: false,
    auth: { enabled: false, isAuthorized: false }
  });
  if (!gate.ok) {
    throw new Error(gate.reason || 'Policy gate blocked');
  }

  const response = await fetch(`${DISCORD_API_BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bot ${config.botToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let detail = '';
    try {
      const errBody = await response.json();
      detail = errBody?.message || JSON.stringify(errBody);
    } catch {
      detail = response.statusText;
    }
    throw new Error(`Discord API error (${response.status}): ${detail}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

export async function sendMessage(
  config: DiscordConfig,
  channelId: string,
  content: string
): Promise<DiscordMessage> {
  const data = await discordRequest('POST', `/channels/${channelId}/messages`, config, { content });
  return {
    id: data.id,
    channelId: data.channel_id,
    content: data.content,
    authorId: data.author?.id,
    timestamp: data.timestamp,
  };
}

export async function editMessage(
  config: DiscordConfig,
  channelId: string,
  messageId: string,
  content: string
): Promise<DiscordMessage> {
  const data = await discordRequest('PATCH', `/channels/${channelId}/messages/${messageId}`, config, { content });
  return {
    id: data.id,
    channelId: data.channel_id,
    content: data.content,
    authorId: data.author?.id,
    timestamp: data.timestamp,
  };
}

export async function deleteMessage(
  config: DiscordConfig,
  channelId: string,
  messageId: string
): Promise<void> {
  await discordRequest('DELETE', `/channels/${channelId}/messages/${messageId}`, config);
}

export async function listGuildChannels(
  config: DiscordConfig,
  guildId: string
): Promise<DiscordChannel[]> {
  const data = await discordRequest('GET', `/guilds/${guildId}/channels`, config);
  return (data || []).map((ch: any) => ({
    id: ch.id,
    name: ch.name,
    type: ch.type,
    guildId: ch.guild_id || guildId,
    topic: ch.topic || '',
  }));
}

export async function getChannelHistory(
  config: DiscordConfig,
  channelId: string,
  limit: number = 50
): Promise<DiscordMessage[]> {
  const data = await discordRequest('GET', `/channels/${channelId}/messages?limit=${limit}`, config);
  return (data || []).map((msg: any) => ({
    id: msg.id,
    channelId: msg.channel_id || channelId,
    content: msg.content,
    authorId: msg.author?.id,
    timestamp: msg.timestamp,
  }));
}

export async function addReaction(
  config: DiscordConfig,
  channelId: string,
  messageId: string,
  emoji: string
): Promise<void> {
  await discordRequest('PUT', `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`, config);
}

export async function sendWebhookMessage(
  webhookUrl: string,
  content: string,
  username?: string
): Promise<void> {
  const payload: Record<string, any> = { content };
  if (username) payload.username = username;

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook error: ${response.status}`);
  }
}
