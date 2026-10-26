// Where Marcus may send (agent phase 5): each connector's defaults from Settings, or a target
// your request names outside quoted text. Never one he makes up.
import { getConnectorCredential } from '../connectors/connectorAuth';
import { getStorage } from '../../lib/appStorage';
import { isComposioEnabled } from '../composioService';
import { withoutQuotedContent } from '../jose/quotedContent';
import type { Destination, MarcusConnector, SendKind } from './types';

export const MARCUS_CONNECTORS: MarcusConnector[] = ['slack', 'discord', 'telegram', 'whatsapp', 'github', 'notion', 'clickup', 'n8n', 'composio'];

/** The Settings keys that hold each connector's default destination. */
export const DESTINATION_KEYS: Record<MarcusConnector, string[]> = {
  slack: ['SLACK_DEFAULT_CHANNEL'],
  discord: ['DISCORD_GUILD_ID', 'DISCORD_DEFAULT_CHANNEL_ID'],
  telegram: ['TELEGRAM_TEAM_CHAT_ID'],
  whatsapp: ['WHATSAPP_ALLOWED_NUMBERS'],
  github: ['GITHUB_DEFAULT_REPO'],
  notion: ['NOTION_PARENT_PAGE_ID'],
  clickup: ['CLICKUP_LIST_ID'],
  n8n: ['N8N_WORKFLOWS'],
  composio: [],
};

const SET_UP_KEY: Record<Exclude<MarcusConnector, 'composio'>, [string, string]> = {
  slack: ['SLACK_BOT_TOKEN', 'the bot token'],
  discord: ['DISCORD_BOT_TOKEN', 'the bot token'],
  telegram: ['TELEGRAM_BOT_TOKEN', 'the bot token'],
  whatsapp: ['WHATSAPP_ACCESS_TOKEN', 'the access token'],
  github: ['GITHUB_TOKEN', 'a personal access token'],
  notion: ['NOTION_API_KEY', 'the API key'],
  clickup: ['CLICKUP_API_KEY', 'the API key'],
  n8n: ['N8N_BASE_URL', 'the n8n address'],
};

export const CONNECTOR_NAMES: Record<MarcusConnector, string> = {
  slack: 'Slack', discord: 'Discord', telegram: 'Telegram', whatsapp: 'WhatsApp', github: 'GitHub',
  notion: 'Notion', clickup: 'ClickUp', n8n: 'n8n', composio: 'Composio',
};

const KINDS: Record<MarcusConnector, SendKind[]> = {
  slack: ['message'], discord: ['message'], telegram: ['message'], whatsapp: ['message'],
  github: ['release', 'issue'], notion: ['page'], clickup: ['task'], n8n: ['trigger'], composio: ['composio_action'],
};

/** Characters each channel takes, keyed `connector:kind`. */
export const CHANNEL_LIMITS: Record<string, number> = {
  'slack:message': 40000,
  'discord:message': 2000,
  'telegram:message': 4096,
  'whatsapp:message': 4096,
  'github:release': 125000,
  'github:issue': 65536,
};

/** The paired owner's Telegram chat (telegramCompanionService.js keeps it under this key). */
const TELEGRAM_OWNER_CHAT_KEY = 'alphonso_telegram_owner_chat_id';

const setting = (connector: string, key: string) => String(getConnectorCredential(connector, key) || '').trim();
const digits = (value: string) => String(value || '').replace(/\D/g, '');
const channelName = (value: string) => String(value || '').trim().replace(/^#/, '').toLowerCase();
const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function telegramOwnerChatId(): string {
  return String(getStorage(TELEGRAM_OWNER_CHAT_KEY, '') || '').trim();
}

/** The n8n workflows you listed (`name: webhook path`, one per line or separated by `;`). */
export function listedN8nWorkflows(): Array<{ name: string; path: string }> {
  const out: Array<{ name: string; path: string }> = [];
  for (const line of setting('n8n', 'N8N_WORKFLOWS').split(/[\n;]/)) {
    const at = line.indexOf(':');
    if (at <= 0) continue;
    const name = line.slice(0, at).trim();
    const path = line.slice(at + 1).trim().replace(/^\/+/, '');
    if (name && path) out.push({ name, path });
  }
  return out;
}

function defaultsOf(connector: MarcusConnector): string[] {
  switch (connector) {
    case 'slack': return [setting('slack', 'SLACK_DEFAULT_CHANNEL')].filter(Boolean);
    case 'discord': return [setting('discord', 'DISCORD_DEFAULT_CHANNEL_ID')].filter(Boolean);
    case 'telegram': return [setting('telegram', 'TELEGRAM_TEAM_CHAT_ID') ? 'team' : '', telegramOwnerChatId() ? 'me' : ''].filter(Boolean);
    case 'whatsapp': return setting('whatsapp', 'WHATSAPP_ALLOWED_NUMBERS').split(/[,\n;]/).map((n) => n.trim()).filter(Boolean);
    case 'github': return [setting('github', 'GITHUB_DEFAULT_REPO')].filter(Boolean);
    case 'notion': return [setting('notion', 'NOTION_PARENT_PAGE_ID')].filter(Boolean);
    case 'clickup': return [setting('clickup', 'CLICKUP_LIST_ID')].filter(Boolean);
    case 'n8n': return listedN8nWorkflows().map((w) => w.name);
    default: return [];
  }
}

/** A connector's defaults, its kinds, and whether its key is saved (with what to add when not). */
export function destinationsFor(connector: MarcusConnector): { setUp: boolean; setUpSentence: string | null; defaults: string[]; kinds: SendKind[] } {
  const name = CONNECTOR_NAMES[connector];
  let setUp: boolean;
  let missing: string;
  if (connector === 'composio') {
    setUp = isComposioEnabled();
    missing = 'the API key';
  } else {
    const [key, what] = SET_UP_KEY[connector];
    setUp = Boolean(setting(connector, key));
    missing = what;
  }
  return {
    setUp,
    setUpSentence: setUp ? null : `${name} isn't set up: add ${missing} in Settings → Connectors → ${name}.`,
    defaults: defaultsOf(connector),
    kinds: KINDS[connector],
  };
}

export function requestWithoutQuotes(request: string): string {
  return withoutQuotedContent(String(request || ''));
}

/** A default, or a target named in your request outside its quoted content. */
export function isAllowedTarget(connector: MarcusConnector, target: string, request: string): boolean {
  const wanted = String(target || '').trim();
  const asked = requestWithoutQuotes(request).toLowerCase();
  const defaults = defaultsOf(connector);
  switch (connector) {
    case 'slack':
    case 'discord': {
      const name = channelName(wanted);
      if (!name) return false;
      if (defaults.some((d) => channelName(d) === name)) return true;
      return new RegExp(`(^|[^a-z0-9_-])${escapeRe(name)}($|[^a-z0-9_-])`).test(asked);
    }
    case 'telegram':
      if (wanted === 'team') return /\b(my|our|the) team\b|\bteam chat\b/.test(asked);
      if (wanted === 'me') return /\bme\b|\bmyself\b/.test(asked);
      return false;
    case 'whatsapp': {
      const n = digits(wanted);
      if (n.length < 6) return false;
      if (defaults.some((d) => digits(d) === n)) return true;
      return (asked.match(/\+?[\d][\d\s().-]{5,}\d/g) || []).some((m) => digits(m) === n);
    }
    case 'github':
      if (!wanted) return false;
      return defaults.includes(wanted) || new RegExp(`(^|\\s)${escapeRe(wanted.toLowerCase())}($|[\\s.,!?])`).test(asked);
    case 'n8n':
      return listedN8nWorkflows().some((w) => w.name.toLowerCase() === wanted.toLowerCase());
    case 'notion':
    case 'clickup':
      return !wanted || defaults.includes(wanted);
    case 'composio':
      return Boolean(wanted) && asked.includes(wanted.toLowerCase());
    default:
      return false;
  }
}

/** "Slack #news", "your team chat on Telegram", "n8n workflow Team notes". */
export function targetLabel(d: Pick<Destination, 'connector' | 'target'> & Partial<Destination>): string {
  const target = String(d.target || '').trim();
  switch (d.connector) {
    case 'slack': return `Slack #${channelName(target)}`;
    case 'discord': return /^\d+$/.test(target) ? 'Discord' : `Discord #${channelName(target)}`;
    case 'telegram': return target === 'me' ? 'you on Telegram' : 'your team chat on Telegram';
    case 'whatsapp': return `WhatsApp +${digits(target)}`;
    case 'github': return `GitHub ${target}`;
    case 'notion': return 'Notion';
    case 'clickup': return 'ClickUp';
    case 'n8n': return `n8n workflow ${target}`;
    case 'composio': return d.composio ? `Composio, ${d.composio.toolkit}` : 'Composio';
    default: return target;
  }
}
