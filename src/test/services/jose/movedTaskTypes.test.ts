import { describe, it, expect } from 'vitest';
import { moveToOwner, dropRetiredSteps, toCurrentOwners } from '../../../services/jose/movedTaskTypes';
import { JOSE_TEMPLATES } from '../../../services/jose/joseTemplates';
import { STEP_AGENTS } from '../../../services/contentFactory/contentStepAgents';
import { checkPlan } from '../../../services/jose/stepGraph';
import type { PlanStep } from '../../../services/jose/stepGraph';
import { decomposeJoseCommand, parseJoseCommand } from '../../../services/joseCommandRouterService';

const s = (stepId: string, agent: string, actionType: string, needs: string[] = []): PlanStep =>
  ({ stepId, agent, actionType, needs, effects: ['read'] });

describe('work that changed owner', () => {
  it('moves an old assembly step to Miya with a note', () => {
    const { step, moved } = moveToOwner(s('assemble', 'alphonso', 'runtime_assemble_video'));
    expect(step.agent).toBe('miya');
    expect(step.actionType).toBe('creative_assemble_video');
    expect(moved).toBe('Moved runtime_assemble_video from Alphonso to Miya: Miya owns it now.');
  });

  it('leaves a step that did not move alone', () => {
    expect(moveToOwner(s('r', 'hector', 'research_report')).moved).toBeNull();
  });

  it("drops Jose's old summary step and rewires what needed it", () => {
    const old = [s('build', 'alphonso', 'local_operation'), s('summary', 'jose', 'orchestration_summary', ['build']), s('after', 'maria', 'audit_quality', ['summary'])];
    const { steps, dropped } = dropRetiredSteps(old);
    expect(steps.map((x) => x.stepId)).toEqual(['build', 'after']);
    expect(steps[1].needs).toEqual(['build']);
    expect(dropped).toHaveLength(1);
  });

  it('turns an old saved plan into one that passes the checks', () => {
    const old = [s('a', 'hector', 'research_report'), s('b', 'jose', 'orchestration_review', ['a']), s('c', 'jose', 'orchestration_summary', ['b'])];
    const { steps, notes } = toCurrentOwners(old);
    expect(checkPlan(steps, { taskTypes: true }).ok).toBe(true);
    expect(notes).toHaveLength(2);
  });
});

describe('templates and splitter follow the owners', () => {
  it('no template has a Jose summary step, and every template passes the checks', () => {
    for (const t of JOSE_TEMPLATES) {
      expect(t.steps.some((x) => x.actionType === 'orchestration_summary'), t.id).toBe(false);
      expect(checkPlan(t.steps, { taskTypes: true }).ok, t.id).toBe(true);
    }
  });

  it("Nova's market step judges Hector's research", () => {
    const steps = JOSE_TEMPLATES.find((t) => t.id === 'content_video')!.steps;
    expect(steps.find((x) => x.stepId === 'research_market')!.needs).toContain('research_trends');
  });

  it("the finished video is Miya's", () => {
    expect(STEP_AGENTS.assemble[0]).toMatchObject({ agent: 'miya', actionType: 'creative_assemble_video' });
  });

  it('Miya designs the app; she does not write its code', () => {
    const design = JOSE_TEMPLATES.find((t) => t.id === 'build_app')!.steps.find((x) => x.stepId === 'design')!;
    expect(design.actionType).toBe('design_ui');
    expect(design.instruction).toMatch(/No code/);
  });

  it('a request no specialist takes goes to Alphonso', () => {
    const plan = decomposeJoseCommand(parseJoseCommand('write a note to my landlord about the heating'));
    expect(plan.map((a: { agent: string; actionType: string }) => [a.agent, a.actionType])).toEqual([['alphonso', 'assistant_answer']]);
  });

  it('a publishing check is Marcus\'s, and publishes nothing', () => {
    const plan = decomposeJoseCommand(parseJoseCommand('upload the video to youtube'));
    const check = plan.find((a: { actionType: string }) => a.actionType === 'distribution_readiness');
    expect(check?.agent).toBe('marcus');
  });
});
