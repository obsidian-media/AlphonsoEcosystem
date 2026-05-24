import { decomposeJoseCommand, parseJoseCommand } from '../services/joseCommandRouterService';

describe('Jose zero-cost routing policy', () => {
  it('adds a policy gate assignment for paid/metered connector requests when zero-cost mode is on', () => {
    const parsed = parseJoseCommand('ask jose: use chatgpt to draft and publish this');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    const gate = assignments.find((item) => item.actionType === 'cost_policy_enforcement');
    expect(gate).toBeTruthy();
    expect(gate?.blockedByZeroCostMode).toBe(true);
  });

  it('does not add policy gate assignment when zero-cost mode is off', () => {
    const parsed = parseJoseCommand('ask jose: use chatgpt to draft and publish this');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: false });
    const gate = assignments.find((item) => item.actionType === 'cost_policy_enforcement');
    expect(gate).toBeFalsy();
  });
});

