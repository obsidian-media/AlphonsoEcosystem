// Jose phase 7: an agent that, partway through its step, wants an action it doesn't own asks for
// it with an ACTION line; Jose adds a step for the owner, which waits for approval by its effect.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/ollama', () => ({
  generateAgentLlmResponse: vi.fn(async () => ({ response: JSON.stringify({ verdict: 'pass', findings: [] }) })),
}));

import { ACTION_INSTRUCTION, findActionRequest, handoffSteps } from '../../../services/jose/joseHandoff';
import { adaptPlan } from '../../../services/jose/joseAdapt';
import { stepCommandText } from '../../../services/joseExecutionEngineService';
import { checkPlan, type PlanStep } from '../../../services/jose/stepGraph';
import { effectsNeedingApproval } from '../../../services/jose/joseEffects';

const hector: PlanStep = { stepId: 'facts', agent: 'hector', actionType: 'research_report', effects: ['read'], needs: [], instruction: 'Find the facts.' };
const out = (summary: string) => ({ status: 'executed', output: { summary } });

beforeEach(() => localStorage.clear());

describe('findActionRequest', () => {
  it('reads the first ACTION line', () => {
    expect(findActionRequest({ summary: 'Found it.\nACTION: send the summary to Slack #news\nACTION: code fix x' })).toEqual({ kind: 'send', what: 'the summary to Slack #news' });
    expect(findActionRequest({ summary: 'ACTION: code add a test for parse()' })).toEqual({ kind: 'code', what: 'add a test for parse()' });
    expect(findActionRequest({ summary: 'Action: send it' })).toBeNull();
    expect(findActionRequest({ summary: 'nothing here' })).toBeNull();
  });
});

describe('handoffSteps', () => {
  it('a send goes to Marcus and a code change to Alphonso, after the asking step', () => {
    const [send] = handoffSteps(hector, { kind: 'send', what: 'post the facts to Slack #news' }, [hector]);
    expect(send).toMatchObject({ stepId: 'facts-send', agent: 'marcus', actionType: 'distribution_execution', effects: ['publish_or_send'], needs: ['facts'], instruction: 'post the facts to Slack #news' });
    const [code] = handoffSteps(hector, { kind: 'code', what: 'add the numbers to stats.json' }, [hector]);
    expect(code).toMatchObject({ stepId: 'facts-code', agent: 'alphonso', actionType: 'local_operation', needs: ['facts'] });
    expect(effectsNeedingApproval(send.effects)).toContain('publish_or_send');
    expect(checkPlan([hector, send, code], { taskTypes: true }).ok).toBe(true);
  });

  it('nothing for the agent who owns the action, a second time, or on a help round', () => {
    const marcus: PlanStep = { stepId: 'm', agent: 'marcus', actionType: 'distribution_readiness', effects: ['read'], needs: [] };
    expect(handoffSteps(marcus, { kind: 'send', what: 'x' }, [marcus])).toEqual([]);
    const alphonso: PlanStep = { stepId: 'a', agent: 'alphonso', actionType: 'assistant_write', effects: ['write_own_work'], needs: [] };
    expect(handoffSteps(alphonso, { kind: 'code', what: 'x' }, [alphonso])).toEqual([]);
    const existing = { ...hector, stepId: 'facts-send' };
    expect(handoffSteps(hector, { kind: 'send', what: 'x' }, [hector, existing])).toEqual([]);
    expect(handoffSteps({ ...hector, helpRound: 1 }, { kind: 'send', what: 'x' }, [hector])).toEqual([]);
  });
});

describe('hand-offs in adaptPlan', () => {
  it("Hector asking to send adds one Marcus step, with Hector's request as the reason", async () => {
    const changes = await adaptPlan({ steps: [hector], done: { facts: out('Done.\nACTION: send the facts to Slack #news') }, justRan: ['facts'], requestText: 'Research bees' });
    const added = changes.flatMap((c) => c.add || []);
    expect(added.filter((s) => s.agent === 'marcus').map((s) => s.stepId)).toEqual(['facts-send']);
    expect(changes.find((c) => c.add?.length)?.reason).toBe('Hector asked for this: the facts to Slack #news');
  });

  it("a hand-off send gets Sentinel's check before it, like every send", async () => {
    const changes = await adaptPlan({ steps: [hector], done: { facts: out('Done.\nACTION: send the facts to Slack #news') }, justRan: ['facts'], requestText: 'Research bees' });
    const added = changes.flatMap((c) => c.add || []);
    const sentinel = added.find((s) => s.agent === 'sentinel');
    expect(sentinel).toBeTruthy();
    expect(added.find((s) => s.agent === 'marcus')!.needs).toContain(sentinel!.stepId);
  });

  it('a review step asking to send still adds a step that waits', async () => {
    const draft: PlanStep = { stepId: 'draft', agent: 'alphonso', actionType: 'assistant_write', effects: ['write_own_work'], needs: [] };
    const review: PlanStep = { stepId: 'check', agent: 'maria', actionType: 'audit_quality', effects: ['read'], needs: ['draft'], reviewOf: 'draft' };
    const changes = await adaptPlan({ steps: [draft, review], done: { draft: out('A post.'), check: out('Pass.\nACTION: send it to Slack #news') }, justRan: ['check'], requestText: 'Write and check a post' });
    const added = changes.flatMap((c) => c.add || []);
    expect(added.some((s) => s.agent === 'marcus' && s.effects.includes('publish_or_send'))).toBe(true);
  });
});

describe('agents are told about ACTION lines', () => {
  it('a planned step is told, unless it is a help round', () => {
    const step = { agent: 'hector', actionType: 'research_report', instruction: 'Find the facts.' };
    expect(stepCommandText(step, 'Research bees')).toContain(ACTION_INSTRUCTION);
    expect(stepCommandText({ ...step, helpRound: 1 }, 'Research bees')).not.toContain(ACTION_INSTRUCTION);
  });
});
