// Marcus sends what the earlier step wrote, never the instruction (agent roles Part A). Since
// agent phase 5 the text and the destination are prepared first (marcus/prepareSend.ts).
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Marcus sends to Slack through the backend (QA batch 1: Slack refuses a bot token from the app window).
const sendMessage = vi.fn(async () => ({ ok: true, ts: '1.2' }));
vi.mock('../services/connectors/connectorOutbound', async (importOriginal) => ({ ...(await importOriginal()), sendSlackMessage: (...a) => sendMessage(...a) }));
vi.mock('../services/memoryService', () => ({ pushMemoryItem: vi.fn() }));
vi.mock('../services/contentFactory/postMetrics', () => ({ readDueMetrics: vi.fn(async () => 0) }));
vi.mock('../services/orchestrationReceiptService', () => ({ appendOrchestrationReceipt: vi.fn() }));
vi.mock('../lib/ollama', () => ({ generateAgentLlmResponse: vi.fn() }));

import { runMarcusDistribution } from '../services/marcusExecutionService';
import { textToSend } from '../services/marcus/sendText';
import { saveConnectorCredential } from '../services/connectors/connectorAuth';
import { createJoseRequest } from '../services/jose/joseRequestStore';
import { setStepOutput } from '../services/jose/joseStepOutputs';

const marcus = { stepId: 'marcus', agent: 'marcus', actionType: 'distribution_slack', effects: ['publish_or_send'], needs: ['miya'], payload: { channel: '#team' } };

function request(text) {
  createJoseRequest({ commandId: 'w1', source: 'user', text: 'Write a post about bees and send it to Slack #team', kind: 'normal', steps: [
    { stepId: 'miya', agent: 'miya', actionType: 'creative_brief', effects: ['write_own_work'], needs: [] },
    marcus,
  ] });
  if (text !== null) setStepOutput('w1', 'miya', 'miya', { summary: text });
}

describe('Marcus sends the work', () => {
  beforeEach(() => {
    sendMessage.mockClear();
    localStorage.clear();
    saveConnectorCredential('slack', 'SLACK_BOT_TOKEN', 'xoxb-fake');
  });

  it("posts Miya's text, not the instruction or the request", async () => {
    request('Bees pollinate a third of our food.');
    await runMarcusDistribution('Send the post to the team channel.', marcus, null, { commandId: 'w1' });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][1]).toBe('Bees pollinate a third of our food.');
  });

  it('sends nothing when no earlier step wrote the text', async () => {
    request(null);
    const result = await runMarcusDistribution('Send it', marcus, null, { commandId: 'w1' });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(result.resultState).toBe('failed');
    expect(result.summary).toBe('Nothing to send: no earlier step wrote the text.');
  });

  it('uses the needed text when the given text is blank', () => {
    const input = { instruction: '', request: '', others: [], memory: '', review: null, needs: [{ stepId: 'miya', agent: 'miya', text: 'The post', main: 'The post', files: [], sources: [], cut: 0 }] };
    expect(textToSend({ payload: { text: '   ' } }, input)?.text).toBe('The post');
    expect(textToSend({ payload: { text: 'Given text' } }, input)?.text).toBe('Given text');
  });
});

describe('Marcus sends the main text of the step he needs (final review)', () => {
  it('prefers the main text over the readable dump', () => {
    const input = { instruction: '', request: '', others: [], memory: '', review: null,
      needs: [{ stepId: 'miya', agent: 'miya', text: 'Miya generated a package.\n\nscript: The post', main: 'The post', files: [], sources: [], cut: 0 }] };
    expect(textToSend({}, input)?.text).toBe('The post');
  });
});
