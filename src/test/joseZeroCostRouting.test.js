import { decomposeJoseCommand, parseJoseCommand, createJoseCommandRoute } from '../services/joseCommandRouterService';
import { getPacketById } from '../services/agentBusService';

describe('Jose zero-cost routing policy', () => {
  beforeEach(() => localStorage.clear());

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

  // QA batch 1 (live Notion check, 2026-10-29): naming Notion stamped the whole request "paid", so
  // Alphonso's local writing step waited for approval too. Only Jose's gate step is held here; the
  // send itself always asks, and the connector gate refuses a paid call that wasn't approved.
  it('only the gate step is held, not the other steps of the request', () => {
    const parsed = parseJoseCommand('/jose Write a one-line note that the check ran, and save it to Notion');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    const others = assignments.filter((a) => a.actionType !== 'cost_policy_enforcement');
    expect(others.length).toBeGreaterThan(0);
    for (const a of others) {
      expect(a.blockedByZeroCostMode).toBeFalsy();
      expect(a.costClass).not.toBe('paid_or_metered');
    }
  });

  it("a planned step doesn't take the request's paid tag", async () => {
    const route = await createJoseCommandRoute({
      commandText: '/jose Write a one-line note that the check ran, and save it to Notion',
      zeroCostMode: true,
      assignments: [
        { agent: 'alphonso', stepId: 'write', actionType: 'assistant_write', effects: ['write_own_work'], needs: [], title: 'Alphonso assistant_write', rationale: '', riskLevel: 'low', requiresApproval: false, commandPreview: '', fragments: [] },
      ],
    });
    const packet = getPacketById(route.assignments[0].packetId);
    expect(packet.payload.policy.blockedByZeroCostMode).toBe(false);
    expect(packet.payload.policy.costClass).not.toBe('paid_or_metered');
  });
});
