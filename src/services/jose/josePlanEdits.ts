// Editing a plan before it runs (owner, Q5; phase 3): remove or add a step,
// change its agent, what it needs or its instruction. Every function returns
// a new list. A change that breaks the rules is not refused here: the caller
// runs checkPlan() and shows the problems, and an invalid plan cannot run.
import { inferEffects } from './joseEffects';
import type { PlanStep } from './stepGraph';

export function removeStep(steps: PlanStep[], stepId: string): PlanStep[] {
  return steps
    .filter((s) => s.stepId !== stepId)
    .map((s) => ({ ...s, needs: s.needs.filter((need) => need !== stepId) }));
}

export function addStep(steps: PlanStep[], input: { agent: string; actionType: string; instruction: string; needs: string[] }): PlanStep[] {
  const ids = new Set(steps.map((s) => s.stepId));
  let n = steps.filter((s) => s.agent === input.agent).length + 1;
  while (ids.has(`${input.agent}-${n}`)) n += 1;
  return [...steps, {
    stepId: `${input.agent}-${n}`,
    agent: input.agent,
    actionType: input.actionType,
    instruction: input.instruction,
    effects: inferEffects(input.actionType),
    needs: input.needs.filter((need) => ids.has(need)),
  }];
}

const replace = (steps: PlanStep[], stepId: string, change: (s: PlanStep) => PlanStep): PlanStep[] =>
  steps.map((s) => (s.stepId === stepId ? change({ ...s }) : s));

export function changeStepAgent(steps: PlanStep[], stepId: string, agent: string): PlanStep[] {
  return replace(steps, stepId, (s) => ({ ...s, agent }));
}

export function setStepNeeds(steps: PlanStep[], stepId: string, needs: string[]): PlanStep[] {
  return replace(steps, stepId, (s) => ({ ...s, needs: [...needs] }));
}

export function setStepInstruction(steps: PlanStep[], stepId: string, instruction: string): PlanStep[] {
  return replace(steps, stepId, (s) => ({ ...s, instruction }));
}

/**
 * Steps that need any id in `from` need all of `to` instead (phase 4: a
 * review round or a help request). Steps in `except` (already run) and the
 * `to` steps themselves are left alone.
 */
export function rewireNeeds(steps: PlanStep[], from: string[], to: string[], except: string[] = []): PlanStep[] {
  const skip = new Set([...except, ...to]);
  return steps.map((s) => {
    if (skip.has(s.stepId) || !s.needs.some((need) => from.includes(need))) return s;
    const kept = s.needs.filter((need) => !from.includes(need));
    return { ...s, needs: [...new Set([...kept, ...to])] };
  });
}
