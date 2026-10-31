// A Hermes-backed agent is told its role (agent roles Part A, 2026-10-24).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const runHermes = vi.fn(async () => ({ ok: true, text: 'answer' }));
vi.mock('../services/hermes/hermesRun', () => ({ runHermesStep: (...a) => runHermes(...a) }));
vi.mock('../services/modelSelectionService', () => ({ getAgentProvider: () => ({ provider: 'hermes', model: 'm' }) }));

import { generateAgentLlmResponse } from '../lib/ollama';
import { describeResponsibility } from '../services/jose/agentPermissionTable';

describe('Hermes-backed agents', () => {
  beforeEach(() => runHermes.mockClear());

  it('get their role first: what they own, never do, and may do', async () => {
    await generateAgentLlmResponse('hector', { prompt: 'Find sources on bees' });
    const [agent, input, opts] = runHermes.mock.calls[0];
    expect(agent).toBe('hector');
    expect(opts.instructions).toContain(describeResponsibility('hector').owns);
    expect(opts.instructions).toContain(describeResponsibility('hector').never);
    expect(opts.instructions).toMatch(/You may: /);
    expect(input).toBe('Find sources on bees');
  });
});
