// Maria's step (agent phase 3, owner 2026-10-25): a review of the work when her step reviews
// one, else a review of the plan; from her model only, with one memory note.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const llm = vi.fn();
const pushMemoryItem = vi.fn(() => ({ id: 'mem-1' }));
const appendSessionEvent = vi.fn();
vi.mock('../lib/ollama', () => ({ generateAgentLlmResponse: (...a) => llm(...a) }));
vi.mock('../services/memoryService', () => ({ pushMemoryItem: (...a) => pushMemoryItem(...a) }));
vi.mock('../services/sessionIntelligenceService', () => ({ appendSessionEvent: (...a) => appendSessionEvent(...a) }));
vi.mock('../services/memoryGraphService', () => ({
  addNode: vi.fn((type, ref) => Promise.resolve(`${type}:${ref}`)),
  addEdge: vi.fn().mockResolvedValue('edge'),
}));

import * as maria from '../services/mariaAuditService';
import { runMariaGovernanceAudit } from '../services/mariaAuditService';

const json = (v) => ({ response: JSON.stringify(v) });
const POST = 'Bees beat their wings 11,400 times a minute.';
const reviewInput = { instruction: 'Check it.', request: 'Write and check a post', needs: [], others: [], memory: '', review: { stepId: 'write', agent: 'alphonso', text: POST, files: [], sources: [], cut: 0, main: POST } };
const planInput = { instruction: '', request: 'Audit this plan: email 500 customers a discount code.', needs: [], others: [], memory: '', review: null };

beforeEach(() => { llm.mockReset(); pushMemoryItem.mockClear(); appendSessionEvent.mockClear(); });

describe("Maria's step", () => {
  it('a review step goes to the work review', async () => {
    llm.mockResolvedValueOnce(json({ verdict: 'pass', summary: 'Correct.', findings: [] }));
    const out = await runMariaGovernanceAudit('x', { agent: 'maria', actionType: 'audit_quality', reviewOf: 'write', packetId: 'p1' }, { stepInput: reviewInput, commandId: 'c1' });
    expect(out.schema.kind).toBe('work');
    expect(out.summary.startsWith('Pass.')).toBe(true);
  });

  it('a step without reviewOf is a plan review', async () => {
    llm.mockResolvedValueOnce(json({ risk: 'medium', why: 'It emails customers.', rules: [], points: ['No permission to email them is shown.'], needsApproval: false, approvalReasons: [], offer: '' }));
    const out = await runMariaGovernanceAudit('x', { agent: 'maria', actionType: 'governance_audit', packetId: 'p2' }, { stepInput: planInput });
    expect(out.schema).toMatchObject({ kind: 'plan', riskLevel: 'medium', approvalRequired: false });
  });

  // draftDisabled only says Ollama at the Settings address didn't answer; her model may be
  // another provider or the step's paid model, so she still asks it.
  it('an unreachable Ollama does not stop her asking her own model', async () => {
    llm.mockResolvedValueOnce(json({ risk: 'low', why: 'Nothing is sent.', rules: [], points: ['Nothing leaves this computer.'], needsApproval: false, approvalReasons: [], offer: '' }));
    const out = await runMariaGovernanceAudit('x', { agent: 'maria', actionType: 'governance_audit' }, { draftDisabled: true, stepInput: planInput });
    expect(llm).toHaveBeenCalled();
    expect(out.resultState).toBe('completed');
  });

  it('no fallback export', () => {
    expect(maria).not.toHaveProperty('buildMariaFallbackAudit');
    expect(maria).not.toHaveProperty('parseMariaAuditResponse');
  });

  it('one memory note, confidence inferred, no session event', async () => {
    llm.mockResolvedValueOnce(json({ verdict: 'fix', summary: 'One change.', findings: [{ quote: 'beat their wings', problem: 'p', change: 'c' }] }));
    await runMariaGovernanceAudit('x', { agent: 'maria', actionType: 'audit_quality', reviewOf: 'write', packetId: 'p3' }, { stepInput: reviewInput });
    expect(pushMemoryItem).toHaveBeenCalledTimes(1);
    expect(pushMemoryItem.mock.calls[0][0]).toMatchObject({ title: 'Maria: Write and check a post — Fix', confidence: 'inferred' });
    expect(appendSessionEvent).not.toHaveBeenCalled();
  });

  it('no artifacts dump', async () => {
    llm.mockResolvedValueOnce(json({ verdict: 'pass', summary: 'Correct.', findings: [] }));
    const out = await runMariaGovernanceAudit('x', { agent: 'maria', actionType: 'audit_quality', reviewOf: 'write' }, { stepInput: reviewInput });
    expect(out.artifacts).toEqual([]);
  });

  it('a failed review writes no memory note', async () => {
    llm.mockResolvedValue({ response: 'fine' });
    const out = await runMariaGovernanceAudit('x', { agent: 'maria', actionType: 'governance_audit' }, { stepInput: planInput });
    expect(out.resultState).toBe('failed');
    expect(pushMemoryItem).not.toHaveBeenCalled();
  });
});
