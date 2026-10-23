// What each step of a Jose plan produced, by step id (2026-10-23). The output
// store (agentOutputStoreService) keeps each agent's latest step as before, so
// callers that read by agent keep working; this keeps every step, so an agent
// with two steps loses neither.
import { durableGet, durableSet } from '../../lib/durableStore.js';

const STEP_OUTPUTS_KEY = 'alphonso_jose_step_outputs_v1';
const MAX_COMMANDS = 50;

interface StepOutput {
  [key: string]: unknown;
  stepId: string;
  agent: string;
  storedAtMs: number;
}

type AllStepOutputs = Record<string, { savedAtMs: number; steps: Record<string, StepOutput> }>;

function readAll(): AllStepOutputs {
  try {
    const parsed = JSON.parse(durableGet(STEP_OUTPUTS_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function setStepOutput(commandId: string, stepId: string, agent: string, output: Record<string, unknown>): void {
  if (!commandId || !stepId || !output) return;
  const all = readAll();
  const entry = Object.prototype.hasOwnProperty.call(all, commandId) ? all[commandId] : { savedAtMs: Date.now(), steps: {} };
  entry.steps[stepId] = { ...output, stepId, agent, storedAtMs: Date.now() };
  entry.savedAtMs = Date.now();
  all[commandId] = entry;
  const kept = Object.entries(all)
    .sort((a, b) => b[1].savedAtMs - a[1].savedAtMs)
    .slice(0, MAX_COMMANDS);
  durableSet(STEP_OUTPUTS_KEY, JSON.stringify(Object.fromEntries(kept)));
}

export function getStepOutput(commandId: string, stepId: string): StepOutput | null {
  const all = readAll();
  if (!Object.prototype.hasOwnProperty.call(all, commandId)) return null;
  const steps = all[commandId].steps;
  return Object.prototype.hasOwnProperty.call(steps, stepId) ? steps[stepId] : null;
}

/** The outputs of the steps a step needs, keyed by agent (an agent's later step wins), as agents read them today. */
export function priorOutputsForNeeds(commandId: string, needs: string[]): Record<string, StepOutput> {
  const prior: Record<string, StepOutput> = {};
  for (const need of needs || []) {
    const output = getStepOutput(commandId, need);
    if (output) prior[output.agent] = output;
  }
  return prior;
}
