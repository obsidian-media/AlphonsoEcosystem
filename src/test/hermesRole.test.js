// A Hermes-backed agent is told its role (agent roles Part A, 2026-10-24).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendHermes = vi.fn(async () => ({ ok: true, content: 'answer', model: 'm' }));
vi.mock('../services/connectors/hermesAgentConnector', () => ({ sendHermesAgentMessage: (...a) => sendHermes(...a) }));
vi.mock('../services/modelSelectionService', () => ({ getAgentProvider: () => ({ provider: 'hermes', model: 'm' }) }));

import { generateAgentLlmResponse } from '../lib/ollama';
import { describeResponsibility } from '../services/jose/agentPermissionTable';

describe('Hermes-backed agents', () => {
  beforeEach(() => sendHermes.mockClear());

  it('get their role first: what they own, never do, and may do', async () => {
    await generateAgentLlmResponse('hector', { prompt: 'Find sources on bees' });
    const messages = sendHermes.mock.calls[0][1];
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain(describeResponsibility('hector').owns);
    expect(messages[0].content).toContain(describeResponsibility('hector').never);
    expect(messages[0].content).toMatch(/You may: /);
    expect(messages[1]).toEqual({ role: 'user', content: 'Find sources on bees' });
  });
});
