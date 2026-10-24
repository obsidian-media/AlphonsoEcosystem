// Work that changed owner on 2026-10-24 (agent roles Part A). A step saved
// before then (a request, a user template, a waiting plan) is moved to the new
// owner when it next runs, with a line in the change log; nothing is refused.
import type { PlanStep } from './stepGraph';
import { rewireNeeds } from './josePlanEdits';
import { agentName } from './agentNames';

export const MOVED_TASK_TYPES: Record<string, { agent: string; actionType: string }> = {
  runtime_assemble_video: { agent: 'miya', actionType: 'creative_assemble_video' },
  orchestration_review: { agent: 'alphonso', actionType: 'assistant_answer' },
  external_publish_handoff: { agent: 'marcus', actionType: 'distribution_readiness' },
  creative_ui_design: { agent: 'miya', actionType: 'design_ui' },
};

/** Jose's own summary step: the closing summary replaces it. */
export const RETIRED_TASK_TYPES = new Set(['orchestration_summary']);

/** The step with its agent and task type moved to the new owner, and the line that says so. */
export function moveToOwner<T extends PlanStep>(step: T): { step: T; moved: string | null } {
  const to = Object.prototype.hasOwnProperty.call(MOVED_TASK_TYPES, step.actionType) ? MOVED_TASK_TYPES[step.actionType] : null;
  if (!to) return { step, moved: null };
  const moved = `Moved ${step.actionType} from ${agentName(step.agent)} to ${agentName(to.agent)}: ${agentName(to.agent)} owns it now.`;
  return { step: { ...step, agent: to.agent, actionType: to.actionType }, moved };
}

/** Steps without the retired ones; a step that needed one needs what it needed instead. */
export function dropRetiredSteps<T extends PlanStep>(steps: T[]): { steps: T[]; dropped: string[] } {
  let kept = steps;
  const dropped: string[] = [];
  for (const retired of steps.filter((s) => RETIRED_TASK_TYPES.has(s.actionType))) {
    kept = rewireNeeds(kept.filter((s) => s.stepId !== retired.stepId), [retired.stepId], retired.needs) as T[];
    dropped.push(`Left out ${agentName(retired.agent)}'s ${retired.actionType} step: the closing summary replaces it.`);
  }
  return { steps: kept, dropped };
}

/** Both at once, for a plan about to be checked. */
export function toCurrentOwners<T extends PlanStep>(steps: T[]): { steps: T[]; notes: string[] } {
  const notes: string[] = [];
  const movedSteps = steps.map((s) => {
    const { step, moved } = moveToOwner(s);
    if (moved) notes.push(moved);
    return step;
  });
  const { steps: kept, dropped } = dropRetiredSteps(movedSteps);
  return { steps: kept, notes: [...notes, ...dropped] };
}
