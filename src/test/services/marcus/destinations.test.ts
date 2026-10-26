// Agent phase 5: where Marcus may send. A default from Settings, or a target your request names
// outside quoted text; never one he makes up (Slack used to fall back to #general).
import { describe, it, expect, beforeEach } from 'vitest';
import { saveConnectorCredential } from '../../../services/connectors/connectorAuth';
import {
  CHANNEL_LIMITS, destinationsFor, isAllowedTarget, listedN8nWorkflows, requestWithoutQuotes, targetLabel,
} from '../../../services/marcus/destinations';

beforeEach(() => localStorage.clear());

describe('isAllowedTarget', () => {
  it('a channel named in the request is allowed; #general neither named nor a default is not', () => {
    expect(isAllowedTarget('slack', '#news', 'post it to our Slack channel #news')).toBe(true);
    expect(isAllowedTarget('slack', 'news', 'post it to our Slack channel #news')).toBe(true);
    expect(isAllowedTarget('slack', '#general', 'post it to our Slack channel #news')).toBe(false);
  });

  it('a channel only in quotes is not named', () => {
    expect(isAllowedTarget('slack', '#general', 'post this to Slack: "everyone join #general"')).toBe(false);
    expect(requestWithoutQuotes('tell them "hi #general" now')).not.toContain('#general');
  });

  it('a default from Settings is allowed', () => {
    saveConnectorCredential('slack', 'SLACK_DEFAULT_CHANNEL', '#team');
    expect(isAllowedTarget('slack', '#team', 'tell the team the shop opens at 9')).toBe(true);
    expect(destinationsFor('slack').defaults).toEqual(['#team']);
  });

  it('a phone number matches by digits', () => {
    expect(isAllowedTarget('whatsapp', '+1 (555) 010-2030', 'message 15550102030 on WhatsApp')).toBe(true);
    expect(isAllowedTarget('whatsapp', '+1 555 999 0000', 'message 15550102030 on WhatsApp')).toBe(false);
  });

  it('an allowed WhatsApp number is a default', () => {
    saveConnectorCredential('whatsapp', 'WHATSAPP_ALLOWED_NUMBERS', '15550102030, 15550104040');
    expect(isAllowedTarget('whatsapp', '15550104040', 'send it on WhatsApp')).toBe(true);
  });

  it('an n8n workflow must be listed, whatever the request says', () => {
    saveConnectorCredential('n8n', 'N8N_WORKFLOWS', 'Team notes: team-notes\nReleases: release-hook');
    expect(listedN8nWorkflows()).toEqual([{ name: 'Team notes', path: 'team-notes' }, { name: 'Releases', path: 'release-hook' }]);
    expect(isAllowedTarget('n8n', 'Team notes', 'send it to my n8n workflow Team notes')).toBe(true);
    expect(isAllowedTarget('n8n', 'Payroll', 'send it to my n8n workflow Payroll')).toBe(false);
  });

  it('a GitHub repository exactly, or the default', () => {
    expect(isAllowedTarget('github', 'acme/shop', 'make a release v1.2.0 of acme/shop')).toBe(true);
    expect(isAllowedTarget('github', 'acme/other', 'make a release v1.2.0 of acme/shop')).toBe(false);
    saveConnectorCredential('github', 'GITHUB_DEFAULT_REPO', 'acme/shop');
    expect(isAllowedTarget('github', 'acme/shop', 'make a release v1.2.0')).toBe(true);
  });

  it('Telegram: "my team" is the team chat, "me" is you', () => {
    expect(isAllowedTarget('telegram', 'team', 'tell my team on Telegram')).toBe(true);
    expect(isAllowedTarget('telegram', 'me', 'send me a Telegram message')).toBe(true);
    expect(isAllowedTarget('telegram', 'team', 'send me a Telegram message')).toBe(false);
  });
});

describe('limits, set-up and labels', () => {
  it('limits', () => {
    expect(CHANNEL_LIMITS['discord:message']).toBe(2000);
    expect(CHANNEL_LIMITS['telegram:message']).toBe(4096);
    expect(CHANNEL_LIMITS['whatsapp:message']).toBe(4096);
    expect(CHANNEL_LIMITS['slack:message']).toBe(40000);
    expect(CHANNEL_LIMITS['github:release']).toBe(125000);
    expect(CHANNEL_LIMITS['github:issue']).toBe(65536);
  });

  it('not set up says what to add', () => {
    expect(destinationsFor('slack').setUp).toBe(false);
    expect(destinationsFor('slack').setUpSentence).toBe("Slack isn't set up: add the bot token in Settings → Connectors → Slack.");
    saveConnectorCredential('slack', 'SLACK_BOT_TOKEN', 'xoxb-1');
    expect(destinationsFor('slack')).toMatchObject({ setUp: true, setUpSentence: null, kinds: ['message'] });
  });

  it('labels', () => {
    expect(targetLabel({ connector: 'slack', target: 'news', kind: 'message', label: '' })).toBe('Slack #news');
    expect(targetLabel({ connector: 'discord', target: '#news', kind: 'message', label: '' })).toBe('Discord #news');
    expect(targetLabel({ connector: 'telegram', target: 'team', kind: 'message', label: '' })).toBe('your team chat on Telegram');
    expect(targetLabel({ connector: 'telegram', target: 'me', kind: 'message', label: '' })).toBe('you on Telegram');
    expect(targetLabel({ connector: 'whatsapp', target: '+1 555 010 2030', kind: 'message', label: '' })).toBe('WhatsApp +15550102030');
    expect(targetLabel({ connector: 'github', target: 'acme/shop', kind: 'release', label: '' })).toBe('GitHub acme/shop');
    expect(targetLabel({ connector: 'n8n', target: 'Team notes', kind: 'trigger', label: '' })).toBe('n8n workflow Team notes');
    expect(targetLabel({ connector: 'notion', target: '', kind: 'page', label: '' })).toBe('Notion');
  });
});
