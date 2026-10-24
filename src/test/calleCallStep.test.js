// Placing a call is Marcus's step, asked like every send (agent roles Part A, 2026-10-24).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const submit = vi.fn(async () => ({ ok: true, pendingApprovalCount: 1 }));
vi.mock('../services/jose/submitToJose', () => ({ submitStepsToJose: (...a) => submit(...a) }));
const runOutreachCall = vi.fn(async () => ({ id: 'r1', status: 'queued' }));
vi.mock('../services/calleOutreachService', () => ({ runOutreachCall: (...a) => runOutreachCall(...a) }));
const confirmMcp = vi.fn(async () => 'Calling now.');
vi.mock('../services/calleMcpOutreachService', () => ({ confirmMcpOutreachCall: (...a) => confirmMcp(...a) }));

import { askMarcusToCall, executeOutreachCall } from '../services/calleCallStep';

describe('calls are Marcus\'s outreach', () => {
  beforeEach(() => { submit.mockClear(); runOutreachCall.mockClear(); confirmMcp.mockClear(); });

  it('asks Marcus with one step that publishes and spends, and places no call yet', async () => {
    await askMarcusToCall({ kind: 'rest', recordId: 'r1' }, 'Call the bakery about the order');
    const args = submit.mock.calls[0][0];
    expect(args.label).toBe('Call set up in CALL-E.');
    expect(args.steps).toEqual([expect.objectContaining({ agent: 'marcus', actionType: 'outreach_call', effects: ['publish_or_send', 'spend'], payload: { kind: 'rest', recordId: 'r1' } })]);
    expect(runOutreachCall).not.toHaveBeenCalled();
    expect(confirmMcp).not.toHaveBeenCalled();
  });

  it('places the call once the step was approved', async () => {
    const rest = await executeOutreachCall({ actionType: 'outreach_call', effects: ['publish_or_send', 'spend'], payload: { kind: 'rest', recordId: 'r1' } });
    expect(runOutreachCall).toHaveBeenCalledWith('r1', { approved: true });
    expect(rest.resultState).toBe('completed');
    const mcp = await executeOutreachCall({ actionType: 'outreach_call', effects: ['publish_or_send', 'spend'], payload: { kind: 'mcp', chatId: 'chat-1' } });
    expect(confirmMcp).toHaveBeenCalledWith('chat-1');
    expect(mcp.summary).toBe('Calling now.');
  });

  it('refuses without both effects and calls nobody', async () => {
    const result = await executeOutreachCall({ actionType: 'outreach_call', effects: ['publish_or_send'], payload: { kind: 'rest', recordId: 'r1' } });
    expect(result.resultState).toBe('failed');
    expect(runOutreachCall).not.toHaveBeenCalled();
  });

  it('leaves the escalation calls alone (they call you about an approval)', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../services/escalationCallService.ts'), 'utf-8');
    expect(source).not.toContain('calleCallStep');
  });
});
