const SLACK_API_BASE = 'https://slack.com/api';

export interface SlackConfig {
  token: string;
  defaultChannel?: string;
}

export interface SlackMessage {
  ts: string;
  channel: string;
  text: string;
  user: string;
  threadTs?: string;
}

export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  numMembers: number;
  purpose: string;
}

async function slackRequest(
  method: string,
  config: SlackConfig,
  payload: Record<string, any> = {}
): Promise<any> {
  const response = await fetch(`${SLACK_API_BASE}/${method}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }

  return data;
}

export async function sendMessage(
  config: SlackConfig,
  channel: string,
  text: string,
  threadTs?: string
): Promise<SlackMessage> {
  const payload: Record<string, any> = { channel, text };
  if (threadTs) payload.thread_ts = threadTs;

  const data = await slackRequest('chat.postMessage', config, payload);

  return {
    ts: data.ts,
    channel: data.channel,
    text: data.message.text,
    user: data.message.user,
    threadTs: data.message.thread_ts,
  };
}

export async function sendRichMessage(
  config: SlackConfig,
  channel: string,
  blocks: any[],
  text?: string
): Promise<SlackMessage> {
  const payload: Record<string, any> = { channel, blocks };
  if (text) payload.text = text;

  const data = await slackRequest('chat.postMessage', config, payload);

  return {
    ts: data.ts,
    channel: data.channel,
    text: data.message.text || text || '',
    user: data.message.user,
  };
}

export async function updateMessage(
  config: SlackConfig,
  channel: string,
  ts: string,
  text: string
): Promise<void> {
  await slackRequest('chat.update', config, { channel, ts, text });
}

export async function deleteMessage(
  config: SlackConfig,
  channel: string,
  ts: string
): Promise<void> {
  await slackRequest('chat.delete', config, { channel, ts });
}

export async function listChannels(config: SlackConfig): Promise<SlackChannel[]> {
  const data = await slackRequest('conversations.list', config, {
    types: 'public_channel,private_channel',
    limit: 200,
  });

  return data.channels.map((ch: any) => ({
    id: ch.id,
    name: ch.name,
    isPrivate: ch.is_private,
    numMembers: ch.num_members,
    purpose: ch.purpose?.value || '',
  }));
}

export async function getChannelHistory(
  config: SlackConfig,
  channel: string,
  limit: number = 50
): Promise<SlackMessage[]> {
  const data = await slackRequest('conversations.history', config, {
    channel,
    limit,
  });

  return data.messages.map((msg: any) => ({
    ts: msg.ts,
    channel,
    text: msg.text,
    user: msg.user,
    threadTs: msg.thread_ts,
  }));
}

export async function uploadFile(
  config: SlackConfig,
  channel: string,
  content: string,
  filename: string,
  title?: string
): Promise<void> {
  await slackRequest('files.upload', config, {
    channels: channel,
    content,
    filename,
    title: title || filename,
  });
}

export async function addReaction(
  config: SlackConfig,
  channel: string,
  timestamp: string,
  emoji: string
): Promise<void> {
  await slackRequest('reactions.add', config, {
    channel,
    timestamp,
    name: emoji,
  });
}

export async function createChannel(
  config: SlackConfig,
  name: string,
  isPrivate: boolean = false
): Promise<SlackChannel> {
  const data = await slackRequest('conversations.create', config, {
    name,
    is_private: isPrivate,
  });

  return {
    id: data.channel.id,
    name: data.channel.name,
    isPrivate: data.channel.is_private,
    numMembers: data.channel.num_members,
    purpose: data.channel.purpose?.value || '',
  };
}

export async function inviteToChannel(
  config: SlackConfig,
  channel: string,
  users: string[]
): Promise<void> {
  await slackRequest('conversations.invite', config, {
    channel,
    users: users.join(','),
  });
}

export async function sendWebhookMessage(
  webhookUrl: string,
  text: string,
  blocks?: any[]
): Promise<void> {
  const payload: Record<string, any> = { text };
  if (blocks) payload.blocks = blocks;

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook error: ${response.status}`);
  }
}
