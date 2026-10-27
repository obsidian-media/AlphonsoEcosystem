// Mid-step hand-offs (Jose phase 7, owner 2026-10-27): an agent that, partway through its step,
// needs an action it doesn't own (a send, a code change or command) ends its answer with an
// ACTION line. Jose adds a step for the agent who owns that action, with that action's effects,
// so it waits for approval as any such step does. Agents never call each other, and Jose never
// acts himself. Same shape as the help loop (joseHelp.ts).
import type { PlanStep } from './stepGraph';
import { isEffectAllowed } from './agentPermissionTable';
import { agentName } from './agentNames';

export const ACTION_INSTRUCTION = 'If your work needs something sent, a command run or a project file changed, end with one line: ACTION: send <what and where> | ACTION: code <what to change or run>. Another agent does it, after your approval.';

const ACTION_LINE = /^\s*ACTION:\s*(send|code)\s+(.+?)\s*$/m;

export interface ActionRequest { kind: 'send' | 'code'; what: string }

function textsOf(output: any): string[] {
  const texts = [String(output?.summary || '')];
  for (const a of output?.artifacts || []) if (typeof a?.text === 'string') texts.push(a.text);
  return texts;
}

/** The first ACTION line of a step's output, or null. */
export function findActionRequest(output: any): ActionRequest | null {
  for (const text of textsOf(output)) {
    const m = text.match(ACTION_LINE);
    if (m) return { kind: m[1] as 'send' | 'code', what: m[2].slice(0, 500) };
  }
  return null;
}

const OWNER = {
  send: { agent: 'marcus', actionType: 'distribution_execution', effects: ['publish_or_send'], owns: 'publish_or_send' },
  code: { agent: 'alphonso', actionType: 'local_operation', effects: ['change_project', 'run'], owns: 'run' },
} as const;

/** The step Jose adds for an ACTION line; none when the agent owns the action, it was added already, or on a help round. */
export function handoffSteps(step: PlanStep, request: ActionRequest, existing: PlanStep[]): PlanStep[] {
  if (step.helpRound) return [];
  const owner = OWNER[request.kind];
  if (isEffectAllowed(step.agent, owner.owns)) return [];
  const stepId = `${step.stepId}-${request.kind}`;
  if (existing.some((s) => s.stepId === stepId)) return [];
  return [{
    stepId,
    agent: owner.agent,
    actionType: owner.actionType,
    effects: [...owner.effects],
    needs: [step.stepId],
    instruction: request.what,
  }];
}

export function handoffReason(step: PlanStep, request: ActionRequest): string {
  return `${agentName(step.agent)} asked for this: ${request.what}`;
}
