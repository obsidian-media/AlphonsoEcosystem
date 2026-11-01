// 2.11.0 QA (owner, 2026-11-01): an agent can use the paid model as its everyday model. Each
// request asks once with the cost (its steps carry the spend effect), never from a schedule.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../services/modelSelectionService', () => ({ getAgentProvider: vi.fn() }));
vi.mock('../../../services/jose/joseSpend', () => ({
  paidModelAvailable: vi.fn(() => ({ ok: true })),
  paidModelId: vi.fn(() => 'claude:claude-sonnet-5'),
  estimateCostUsd: vi.fn(() => 0.12),
  PAID_MAX_OUTPUT_TOKENS: 4096,
  PAID_PROMPT_ALLOWANCE_CHARS: 4000,
}));

import { getAgentProvider } from '../../../services/modelSelectionService';
import { paidModelAvailable } from '../../../services/jose/joseSpend';
import { withAgentPaidModels } from '../../../services/jose/agentPaidModels';

const step = (agent: string, extra: Record<string, unknown> = {}) => ({ stepId: agent, agent, actionType: 'x', effects: ['read' as const], needs: [], instruction: 'do it', ...extra });

beforeEach(() => {
  vi.mocked(getAgentProvider).mockImplementation((agent: string) => ({ provider: agent === 'hector' ? 'paid' : 'ollama' }) as never);
  vi.mocked(paidModelAvailable).mockReturnValue({ ok: true });
});

describe('agents that use the paid model', () => {
  it("gives their steps the paid model, the spend effect and a cost; others are left alone", () => {
    const { steps, notes } = withAgentPaidModels([step('hector'), step('maria')], { requestText: 'research x' });
    expect(steps[0]).toMatchObject({ model: 'claude:claude-sonnet-5', effects: ['read', 'spend'], costEstimateUsd: 0.12 });
    expect(steps[1]).toEqual(step('maria'));
    expect(notes).toEqual([]);
  });

  it("keeps a model Jose already chose, and never gives Jose's own steps one", () => {
    vi.mocked(getAgentProvider).mockReturnValue({ provider: 'paid' } as never);
    const { steps } = withAgentPaidModels([step('hector', { model: 'qwen3:8b' }), step('jose')], { requestText: '' });
    expect(steps[0].model).toBe('qwen3:8b');
    expect(steps[1]).toEqual(step('jose'));
  });

  it('uses this computer when paid models are off, or for a schedule, and says why once', () => {
    vi.mocked(paidModelAvailable).mockReturnValue({ ok: false, reason: 'Zero-Cost Mode is on.' });
    const off = withAgentPaidModels([step('hector'), step('hector', { stepId: 'hector-2' })], { requestText: '' });
    expect(off.steps.every((s) => !s.model)).toBe(true);
    expect(off.notes).toEqual(["Hector is set to the paid model, but Zero-Cost Mode is on. Hector used this computer's model."]);
    vi.mocked(paidModelAvailable).mockReturnValue({ ok: true });
    const scheduled = withAgentPaidModels([step('hector')], { requestText: '', allowPaidModels: false });
    expect(scheduled.steps[0].model).toBeUndefined();
    expect(scheduled.notes).toEqual(["Hector is set to the paid model, but a schedule never spends. Hector used this computer's model."]);
  });
});
