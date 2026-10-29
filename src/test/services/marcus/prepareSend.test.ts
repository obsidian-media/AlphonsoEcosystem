// Agent phase 5: a Marcus send is prepared before it asks you, so the approval shows exactly
// what goes where; a problem ends the step without asking anything.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../lib/ollama', () => ({ generateAgentLlmResponse: vi.fn() }));

import { generateAgentLlmResponse } from '../../../lib/ollama';
import { saveConnectorCredential } from '../../../services/connectors/connectorAuth';
import { setStepOutput } from '../../../services/jose/joseStepOutputs';
import { prepareMarcusSend, describeSend, isMarcusSendStep, tooLongReason, SEND_TIME_UNCLEAR } from '../../../services/marcus/prepareSend';
import { NOTHING_TO_SEND } from '../../../services/marcus/sendText';

const llm = vi.mocked(generateAgentLlmResponse);
const REQ = { text: '/jose Write a note that we open Saturday, then post it to our Slack channel #news.' };
const marcus = (extra: Record<string, unknown> = {}) => ({
  stepId: 'marcus', agent: 'marcus', actionType: 'distribution_execution', effects: ['publish_or_send'], needs: ['write'], ...extra,
}) as never;
const preview = (extra: Record<string, unknown> = {}) => ({
  connector: 'slack', target: '#news', kind: 'message', label: 'Slack #news', text: 'Open Saturday.', sourceStepId: 'write', preparedAtMs: 1, ...extra,
}) as never;

beforeEach(() => {
  localStorage.clear();
  llm.mockReset();
  saveConnectorCredential('slack', 'SLACK_BOT_TOKEN', 'xoxb-1');
  saveConnectorCredential('discord', 'DISCORD_BOT_TOKEN', 'd-1');
  setStepOutput('c1', 'write', 'alphonso', { summary: 'Open Saturday.' } as never);
});

describe('isMarcusSendStep', () => {
  it('Marcus with publish_or_send, not a call or a content step', () => {
    expect(isMarcusSendStep(marcus())).toBe(true);
    expect(isMarcusSendStep(marcus({ actionType: 'distribution_readiness', effects: ['read'] }))).toBe(false);
    expect(isMarcusSendStep(marcus({ actionType: 'outreach_call', effects: ['publish_or_send', 'spend'] }))).toBe(false);
    expect(isMarcusSendStep(marcus({ contentStep: { projectId: 'p', step: 'publish' } }))).toBe(false);
    expect(isMarcusSendStep({ ...(marcus() as object), agent: 'alphonso' } as never)).toBe(false);
  });

  // QA batch 0 (CI, 2026-10-27): a planner gave "post this to Slack" the content factory's
  // posting type; with no content data it is an ordinary send and must be prepared before it asks.
  it('a posting step without Miya Studio data is an ordinary send', () => {
    expect(isMarcusSendStep(marcus({ actionType: 'distribution_schedule_posts' }))).toBe(true);
    expect(isMarcusSendStep(marcus({ actionType: 'distribution_schedule_posts', contentStep: { projectId: 'p', step: 'publish' } }))).toBe(false);
  });
});

describe('prepareMarcusSend', () => {
  it('otherwise the preview and the approval line', async () => {
    const got = await prepareMarcusSend('c1', marcus({ payload: { connector: 'slack', target: '#news' } }), REQ);
    expect(got).toMatchObject({ ok: true, preview: { connector: 'slack', target: '#news', label: 'Slack #news', text: 'Open Saturday.', sourceStepId: 'write' } });
    expect(describeSend((got as unknown as { preview: never }).preview)).toBe('Send to Slack #news: “Open Saturday.”');
  });

  // Agent roles Part C2: a send can have a time.
  it('a time in the request goes on the preview and the approval line', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(2026, 10, 2, 10, 0));
      const timed = { text: '/jose Write a note that we open Saturday, then post it to our Slack channel #news tomorrow at 9.' };
      const got: any = await prepareMarcusSend('c1', marcus({ payload: { connector: 'slack', target: '#news' } }), timed);
      expect(got.preview.sendAtMs).toBe(new Date(2026, 10, 3, 9, 0).getTime());
      expect(describeSend(got.preview)).toBe('Send to Slack #news at Tue 09:00: “Open Saturday.”');
    } finally {
      vi.useRealTimers();
    }
  });

  // Final review: a time inside the words being sent is part of the message, not when to send it.
  it('a time in the quoted message, or after the colon, sends now', async () => {
    for (const text of ['/jose Send “We open at 9 tomorrow” to Slack #news.', '/jose Post this to Slack #news: we open tomorrow at 9.']) {
      const got: any = await prepareMarcusSend('c1', marcus({ payload: { connector: 'slack', target: '#news' } }), { text });
      expect(got.ok).toBe(true);
      expect(got.preview.sendAtMs).toBeUndefined();
    }
  });

  it('an unclear time asks again, and nothing is prepared', async () => {
    const got = await prepareMarcusSend('c1', marcus({ payload: { connector: 'slack', target: '#news' } }), { text: '/jose post it to Slack #news later' });
    expect(got).toEqual({ ok: false, outcome: 'failed', reason: SEND_TIME_UNCLEAR });
  });

  it('too long → fix for the step he sends from, nothing asked', async () => {
    setStepOutput('c1', 'write', 'alphonso', { summary: 'x'.repeat(2413) } as never);
    const got = await prepareMarcusSend('c1', marcus({ payload: { connector: 'discord', target: '#news' } }), { text: '/jose post it to Discord #news' });
    expect(got).toEqual({ ok: false, outcome: 'fix', reason: 'Too long for Discord #news: 2,413 characters; the limit is 2,000.', sourceStepId: 'write' });
    expect(tooLongReason('Discord #news', 2413, 2000)).toBe('Too long for Discord #news: 2,413 characters; the limit is 2,000.');
  });

  it('not set up → setup', async () => {
    const got = await prepareMarcusSend('c1', marcus({ payload: { connector: 'telegram', target: 'team' } }), { text: '/jose tell my team on Telegram' });
    expect(got).toEqual({ ok: false, outcome: 'setup', reason: "Telegram isn't set up: add the bot token in Settings → Connectors → Telegram." });
  });

  it('nothing to send → failed with NOTHING_TO_SEND', async () => {
    const got = await prepareMarcusSend('c1', marcus({ needs: [] }), REQ);
    expect(got).toEqual({ ok: false, outcome: 'failed', reason: NOTHING_TO_SEND });
  });

  it('exact checks on the final text', async () => {
    setStepOutput('c1', 'write', 'alphonso', { summary: 'Log in with your password at our site.' } as never);
    const got = await prepareMarcusSend('c1', marcus({ payload: { connector: 'slack', target: '#news' } }), REQ);
    expect(got.ok).toBe(true);
    const p = (got as unknown as { preview: { exactFacts: string[] } }).preview;
    expect(p.exactFacts.length).toBeGreaterThan(0);
    expect(describeSend(p as never)).toMatch(/ Sentinel's checks found: It asks for a password or payment details\.$/);
  });
});

describe('describeSend', () => {
  it('keeps 200 characters', () => {
    const line = describeSend(preview({ text: 'a'.repeat(450) }));
    expect(line).toBe(`Send to Slack #news: “${'a'.repeat(199)}…”`);
  });

  it('other kinds', () => {
    expect(describeSend(preview({ connector: 'github', target: 'acme/shop', kind: 'release', title: 'v1.2.0', label: 'GitHub acme/shop', text: 'Fixed login.' })))
      .toBe('Make a draft release v1.2.0 on GitHub acme/shop: “Fixed login.”');
    expect(describeSend(preview({ connector: 'github', target: 'acme/shop', kind: 'issue', title: 'Login', label: 'GitHub acme/shop', text: 'Fails.' })))
      .toBe('Open an issue on GitHub acme/shop: “Fails.”');
    expect(describeSend(preview({ connector: 'notion', target: '', kind: 'page', label: 'Notion', text: 'Notes.' }))).toBe('Make a Notion page: “Notes.”');
    expect(describeSend(preview({ connector: 'clickup', target: '', kind: 'task', label: 'ClickUp', text: 'Do it.' }))).toBe('Make a ClickUp task: “Do it.”');
    expect(describeSend(preview({ connector: 'n8n', target: 'Team notes', kind: 'trigger', label: 'n8n workflow Team notes', text: 'Hi.' })))
      .toBe('Start your n8n workflow Team notes with: “Hi.”');
    expect(describeSend(preview({ connector: 'composio', target: 'anna@example.com', kind: 'composio_action', label: 'Composio, Gmail', composio: { toolkit: 'Gmail', tool: 'GMAIL_SEND_EMAIL', args: {} }, text: 'Hello.' })))
      .toBe('Composio, Gmail: send email to anna@example.com: “Hello.”');
  });
});
