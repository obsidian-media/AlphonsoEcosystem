import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/modelSelectionService', () => ({
  getAgentProvider: vi.fn(() => ({ provider: 'ollama' })),
}));
vi.mock('../../services/connectors/connectorAuth', () => ({
  isConnectorAuthenticated: vi.fn(() => ({ ok: true })),
}));
const sendClaudeMessage = vi.fn();
vi.mock('../../services/claudeService', () => ({ sendClaudeMessage }));
const sendChatGPTMessage = vi.fn();
vi.mock('../../services/chatgptService', () => ({ sendChatGPTMessage }));

const { generateAgentLlmResponse, withAgentModel } = await import('../../lib/ollama');
const { monthSpendUsd } = await import('../../services/jose/joseSpend');

const allowPaid = (paid: Record<string, unknown> = {}) => localStorage.setItem('alphonso_settings', JSON.stringify({
  zeroCostMode: false,
  paidModels: { allowed: true, provider: 'claude', model: 'claude-haiku-5-5', inputPerMillionUsd: 3, outputPerMillionUsd: 15, monthlyCapUsd: 5, ...paid },
}));

beforeEach(() => {
  localStorage.clear();
  sendClaudeMessage.mockReset();
  sendChatGPTMessage.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

describe('a paid model chosen for a step', () => {
  it('calls Claude with that model and records what it cost', async () => {
    allowPaid();
    sendClaudeMessage.mockResolvedValueOnce({ ok: true, success: true, text: 'Fixed it.', model: 'claude-haiku-5-5', usage: { input_tokens: 1_000_000, output_tokens: 0 } });
    const result = await withAgentModel('miya', 'claude:claude-haiku-5-5', () => generateAgentLlmResponse('miya', { prompt: 'Write the script.' }));
    expect(result).toMatchObject({ response: 'Fixed it.', backend: 'claude', model: 'claude-haiku-5-5' });
    expect(sendClaudeMessage).toHaveBeenCalledWith('Write the script.', expect.objectContaining({ model: 'claude-haiku-5-5' }));
    expect(fetch).not.toHaveBeenCalled();
    expect(monthSpendUsd()).toBeCloseTo(3, 10);
  });

  it('calls ChatGPT for a chatgpt: model, using the connector model when none is named', async () => {
    allowPaid({ provider: 'chatgpt', model: null });
    sendChatGPTMessage.mockResolvedValueOnce({ ok: true, success: true, text: 'Done.', model: 'gpt-6-luna', usage: { prompt_tokens: 10, completion_tokens: 10 } });
    const result = await generateAgentLlmResponse('nova', { prompt: 'Judge it.', model: 'chatgpt:' });
    expect(result).toMatchObject({ response: 'Done.', backend: 'chatgpt' });
    expect(sendChatGPTMessage.mock.calls[0][1].model).toBeUndefined();
  });

  it('refuses without calling when it would pass the monthly cap', async () => {
    allowPaid({ monthlyCapUsd: 0 });
    await expect(generateAgentLlmResponse('miya', { prompt: 'Write the script.', model: 'claude:claude-haiku-5-5' }))
      .rejects.toThrow(/monthly cap/);
    expect(sendClaudeMessage).not.toHaveBeenCalled();
  });

  it('refuses without calling when paid models are not allowed', async () => {
    allowPaid({ allowed: false });
    await expect(generateAgentLlmResponse('miya', { prompt: 'x', model: 'claude:claude-haiku-5-5' }))
      .rejects.toThrow('Paid models are off in Settings.');
    expect(sendClaudeMessage).not.toHaveBeenCalled();
  });

  it('reports a failed paid call as an error', async () => {
    allowPaid();
    sendClaudeMessage.mockResolvedValueOnce({ ok: false, success: false, error: 'Rate limited.' });
    await expect(generateAgentLlmResponse('miya', { prompt: 'x', model: 'claude:claude-haiku-5-5' })).rejects.toThrow('Rate limited.');
    expect(monthSpendUsd()).toBe(0);
  });
});
