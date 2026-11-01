// An agent set to "Paid" in Settings → Agents uses the paid model chosen in Settings → General (Allow paid models)
// (with its prices) for its steps (2.11.0 QA, owner 2026-11-01). Each such step carries the spend
// effect, so the request asks once with the cost; a schedule never spends. Outside a request (a
// Boardroom reply) the agent uses this computer's model: nothing is spent without asking.
import type { PlanStep } from './stepGraph';
import { getAgentProvider } from '../modelSelectionService';
import { paidModelAvailable, paidModelId, estimateCostUsd, PAID_MAX_OUTPUT_TOKENS, PAID_PROMPT_ALLOWANCE_CHARS } from './joseSpend';
import { agentName } from './agentNames';

const SCHEDULE_NEVER_SPENDS = 'a schedule never spends';

export function withAgentPaidModels(
  steps: PlanStep[],
  options: { requestText: string; allowPaidModels?: boolean },
): { steps: PlanStep[]; notes: string[] } {
  const notes = new Map<string, string>();
  const out = steps.map((step) => {
    if (step.model || step.agent === 'jose' || getAgentProvider(step.agent).provider !== 'paid') return step;
    const available = paidModelAvailable();
    const model = paidModelId();
    const why = options.allowPaidModels === false ? SCHEDULE_NEVER_SPENDS : !available.ok ? String(available.reason || '').replace(/\.$/, '') : !model ? 'no paid model is chosen' : null;
    if (why) {
      const name = agentName(step.agent);
      notes.set(step.agent, `${name} is set to the paid model, but ${why}. ${name} used this computer's model.`);
      return step;
    }
    const costEstimateUsd = estimateCostUsd((step.instruction || '').length + options.requestText.length + PAID_PROMPT_ALLOWANCE_CHARS, PAID_MAX_OUTPUT_TOKENS);
    return { ...step, model: model as string, effects: [...new Set([...step.effects, 'spend' as const])], costEstimateUsd };
  });
  return { steps: out, notes: [...notes.values()] };
}
