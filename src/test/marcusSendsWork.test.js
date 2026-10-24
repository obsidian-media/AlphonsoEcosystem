// Marcus sends what the earlier step wrote, never the instruction (agent roles Part A).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMessage = vi.fn(async () => ({ ts: '1.2' }));
vi.mock('../services/connectors/slackConnector', () => ({ sendMessage: (...a) => sendMessage(...a) }));
vi.mock('../services/memoryService', () => ({ pushMemoryItem: vi.fn() }));
vi.mock('../services/contentFactory/postMetrics', () => ({ readDueMetrics: vi.fn(async () => 0) }));
vi.mock('../services/sessionIntelligenceService', () => ({ appendSessionEvent: vi.fn() }));
vi.mock('../services/orchestrationReceiptService', () => ({ appendOrchestrationReceipt: vi.fn() }));
vi.mock('../services/audit/marcusAuditService', () => ({ generateRiskScore: vi.fn(() => ({ level: 'low', score: 1, factors: [] })) }));
vi.mock('../services/connectors/connectorAuth', () => ({
  getConnectorCredential: vi.fn((id, key) => (id === 'slack' && key === 'SLACK_BOT_TOKEN' ? 'xoxb-fake' : null)),
}));
vi.mock('../services/connectorRegistryService', () => ({ isConnectorAuthenticated: vi.fn(() => ({ ok: true })), appendConnectorAudit: vi.fn() }));

import { runMarcusDistribution, textToSend } from '../services/marcusExecutionService';
import { setStepOutput } from '../services/jose/joseStepOutputs';

const stepInput = (text) => ({
  instruction: 'Send the post to the team channel.',
  request: 'Write a post about bees and send it to Slack',
  needs: text === null ? [] : [{ stepId: 'miya', agent: 'miya', text, files: [], sources: [], cut: 0 }],
  others: [], memory: '', review: null,
});
const maria = { maria: { summary: 'ok', schema: { riskLevel: 'low', approvalRequired: false } } };

describe('Marcus sends the work', () => {
  beforeEach(() => { sendMessage.mockClear(); localStorage.clear(); });

  it("posts Miya's text, not the instruction or the request", async () => {
    await runMarcusDistribution('Send the post to the team channel.\n\nThe request: …', { actionType: 'slack_message_send' }, maria, { stepInput: stepInput('Bees pollinate a third of our food.') });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][2]).toBe('Bees pollinate a third of our food.');
  });

  it('uses the needed text when the given text is blank', () => {
    expect(textToSend({ payload: { text: '   ' } }, stepInput('The post'))).toBe('The post');
    expect(textToSend({ payload: { text: 'Given text' } }, stepInput('The post'))).toBe('Given text');
    expect(textToSend({}, stepInput(null))).toBeNull();
  });

  it('sends nothing when no earlier step wrote the text', async () => {
    const result = await runMarcusDistribution('Send it', { actionType: 'slack_message_send' }, maria, { stepInput: stepInput(null) });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(result.resultState).toBe('failed');
    expect(result.summary).toBe('Nothing to send: no earlier step wrote the text.');
  });

  it("still blocks on Maria's high-risk verdict found in the same request", async () => {
    setStepOutput('c9', 'maria', 'maria', { summary: 'Risky', schema: { riskLevel: 'high', approvalRequired: true } });
    const result = await runMarcusDistribution('Send it', { actionType: 'slack_message_send' }, {}, { stepInput: stepInput('The post'), commandId: 'c9' });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(result.summary).toMatch(/Maria governance audit requires approval/);
  });
});
