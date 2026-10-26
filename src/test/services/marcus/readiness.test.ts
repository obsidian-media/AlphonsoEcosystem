// Agent phase 5: Marcus's readiness check is real, read-only, and asks nothing: is there text,
// was it reviewed, where would it go, does the connector answer, does it fit.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../lib/ollama', () => ({ generateAgentLlmResponse: vi.fn() }));
vi.mock('../../../services/connectorHealthCheckService', () => ({ checkConnectorHealth: vi.fn() }));
vi.mock('../../../services/connectors/slackConnector', () => ({ sendMessage: vi.fn() }));

import { checkConnectorHealth } from '../../../services/connectorHealthCheckService';
import * as slack from '../../../services/connectors/slackConnector';
import { saveConnectorCredential } from '../../../services/connectors/connectorAuth';
import { createJoseRequest } from '../../../services/jose/joseRequestStore';
import { setStepOutput } from '../../../services/jose/joseStepOutputs';
import { checkReadiness } from '../../../services/marcus/readiness';

const health = vi.mocked(checkConnectorHealth);
const step = (stepId: string, agent: string, actionType: string, extra: Record<string, unknown> = {}) =>
  ({ stepId, agent, actionType, effects: ['read'], needs: [], ...extra });
const ready = { stepId: 'marcus', agent: 'marcus', actionType: 'distribution_readiness', effects: ['read'], needs: ['write', 'sentinel-send-marcus'], payload: { connector: 'slack', target: '#news' } };
const REQ = { text: '/jose Is my announcement ready to post on Slack #news?' };

function setUp(reviewVerdict: 'safe' | 'unsafe' | null, text = 'Open Saturday.') {
  createJoseRequest({ commandId: 'r1', source: 'user', text: REQ.text, kind: 'normal', steps: [
    step('write', 'alphonso', 'assistant_write'),
    step('sentinel-send-marcus', 'sentinel', 'security_review', { needs: ['write'], reviewOf: 'write' }),
    ready,
  ] as never });
  setStepOutput('r1', 'write', 'alphonso', { summary: text } as never);
  if (reviewVerdict) setStepOutput('r1', 'sentinel-send-marcus', 'sentinel', { summary: 'Safe.', schema: { kind: 'security', verdict: reviewVerdict } } as never);
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  saveConnectorCredential('slack', 'SLACK_BOT_TOKEN', 'xoxb-1');
  health.mockResolvedValue({ ok: true, message: 'ok', latency: 1, details: {}, checked: 'live' });
});

describe('checkReadiness', () => {
  it('Ready. with each point', async () => {
    setUp('safe');
    const got = await checkReadiness('r1', ready as never, REQ);
    expect(got.ready).toBe(true);
    expect(got.text).toBe([
      'Ready.',
      '- The text is there (from Alphonso).',
      '- Sentinel checked it: safe.',
      '- It would go to Slack #news.',
      '- Slack answers.',
      '- It fits: 14 of 40,000 characters.',
    ].join('\n'));
  });

  it('Not ready: missing text', async () => {
    createJoseRequest({ commandId: 'r1', source: 'user', text: REQ.text, kind: 'normal', steps: [ready] as never });
    const got = await checkReadiness('r1', { ...ready, needs: [] } as never, REQ);
    expect(got.ready).toBe(false);
    expect(got.text).toMatch(/^Not ready:\n- Nothing to send: no earlier step wrote the text\./);
  });

  it('Not ready: unreviewed, or Sentinel found problems', async () => {
    setUp(null);
    expect((await checkReadiness('r1', ready as never, REQ)).text).toContain('- Nobody reviewed it yet.');
    setUp('unsafe');
    expect((await checkReadiness('r1', ready as never, REQ)).text).toContain('- Sentinel found problems: unsafe.');
  });

  it('Not ready: not set up, or not answering, or too long', async () => {
    setUp('safe');
    health.mockResolvedValueOnce({ ok: false, message: 'invalid_auth', latency: 1, details: {}, checked: 'live' });
    expect((await checkReadiness('r1', ready as never, REQ)).text).toContain("- Slack didn't answer: invalid_auth.");
    setUp('safe', 'x'.repeat(40001));
    expect((await checkReadiness('r1', ready as never, REQ)).text).toContain('- Too long for Slack #news: 40,001 characters; the limit is 40,000.');
    saveConnectorCredential('slack', 'SLACK_BOT_TOKEN', '');
    setUp('safe');
    expect((await checkReadiness('r1', ready as never, REQ)).text).toContain("- Slack isn't set up: add the bot token in Settings → Connectors → Slack.");
  });

  it('never asks and sends nothing', async () => {
    setUp('safe');
    await checkReadiness('r1', ready as never, REQ);
    expect(slack.sendMessage).not.toHaveBeenCalled();
  });
});
