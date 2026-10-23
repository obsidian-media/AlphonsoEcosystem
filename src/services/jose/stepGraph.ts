// A Jose plan as a graph of steps, and the rules every plan must pass before
// anything runs. Design: docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md §5
// Before 2026-10-23 a request could give each agent only one task, in a fixed
// order (AGENT_DEPENDENCIES); now an agent can have several steps, and each
// step waits only for the steps it needs.
import { AGENT_DEPENDENCIES } from '../agentOutputStoreService';
import { AGENT_PERMISSION_TABLE, isEffectAllowed, isTaskTypeAllowed } from './agentPermissionTable';
import { EFFECT_LABELS, type JoseEffect } from './joseEffects';

export const JOSE_LIMITS = {
  maxSteps: 50,
  normalMs: 30 * 60 * 1000,
  projectMs: 2 * 60 * 60 * 1000,
  maxFixRounds: 2,
} as const;

export interface PlanStep {
  stepId: string;
  agent: string;
  actionType: string;
  effects: JoseEffect[];
  needs: string[];
}

const NAMES: Record<string, string> = {
  alphonso: 'Alphonso', jose: 'Jose', miya: 'Miya', hector: 'Hector', maria: 'Maria',
  marcus: 'Marcus', echo: 'Echo', sentinel: 'Sentinel', nova: 'Nova',
};

/** Steps on a cycle (steps that end up waiting for themselves). */
function findCycle(steps: PlanStep[]): string[] {
  const byId = new Map(steps.map((s) => [s.stepId, s]));
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  let cycle: string[] = [];
  const visit = (id: string): boolean => {
    if (state.get(id) === 'done') return false;
    if (state.get(id) === 'visiting') {
      cycle = stack.slice(stack.indexOf(id));
      return true;
    }
    state.set(id, 'visiting');
    stack.push(id);
    for (const need of byId.get(id)?.needs || []) {
      if (byId.has(need) && visit(need)) return true;
    }
    stack.pop();
    state.set(id, 'done');
    return false;
  };
  for (const s of steps) if (visit(s.stepId)) break;
  return cycle;
}

/** Every rule a plan must pass before it runs; problems in plain words. */
export function checkPlan(steps: PlanStep[]): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (steps.length > JOSE_LIMITS.maxSteps) {
    problems.push(`The plan has ${steps.length} steps; the limit is ${JOSE_LIMITS.maxSteps}.`);
  }
  const ids = new Set<string>();
  for (const s of steps) {
    if (ids.has(s.stepId)) problems.push(`Step "${s.stepId}" appears twice.`);
    ids.add(s.stepId);
  }
  for (const s of steps) {
    const name = NAMES[s.agent] || s.agent;
    if (!Object.prototype.hasOwnProperty.call(AGENT_PERMISSION_TABLE, s.agent)) {
      problems.push(`Step "${s.stepId}" is for an unknown agent "${s.agent}".`);
      continue;
    }
    if (!isTaskTypeAllowed(s.agent, s.actionType)) problems.push(`${name} may not do "${s.actionType}" (step "${s.stepId}").`);
    for (const effect of s.effects) {
      if (effect === 'run' && s.agent !== 'alphonso') problems.push(`Step "${s.stepId}": only Alphonso may run code and commands.`);
      else if (effect === 'publish_or_send' && s.agent !== 'marcus') problems.push(`Step "${s.stepId}": only Marcus may publish or send anything outside.`);
      else if (!isEffectAllowed(s.agent, effect)) problems.push(`Step "${s.stepId}": ${name} may not ${EFFECT_LABELS[effect].toLowerCase()}.`);
    }
    for (const need of s.needs) {
      if (!ids.has(need) && !steps.some((other) => other.stepId === need)) problems.push(`Step "${s.stepId}" needs "${need}", which is not in the plan.`);
    }
  }
  const cycle = findCycle(steps);
  if (cycle.length > 0) problems.push(`These steps wait for each other in a cycle: ${cycle.join(' → ')}.`);
  return { ok: problems.length === 0, problems };
}

/** Step ids in waves: each step runs after every step it needs. Run checkPlan first. */
export function buildStepWaves(steps: PlanStep[]): string[][] {
  const done = new Set<string>();
  const waves: string[][] = [];
  const known = new Set(steps.map((s) => s.stepId));
  while (done.size < steps.length) {
    const wave = steps
      .filter((s) => !done.has(s.stepId) && s.needs.every((need) => done.has(need) || !known.has(need)))
      .map((s) => s.stepId);
    if (wave.length === 0) throw new Error('The plan has steps that wait for each other.');
    for (const id of wave) done.add(id);
    waves.push(wave);
  }
  return waves;
}

/** Today's fixed agent order as `needs`, so requests from the rule-based splitter keep their order. */
export function legacyNeeds(assignments: { agent: string; stepId: string }[]): Record<string, string[]> {
  const needs: Record<string, string[]> = {};
  for (const a of assignments) {
    const deps = AGENT_DEPENDENCIES[a.agent] || [];
    needs[a.stepId] = assignments.filter((other) => other !== a && deps.includes(other.agent)).map((other) => other.stepId);
  }
  return needs;
}
