// An agent set to "Paid" in Settings → Agents uses the paid model chosen in Settings → Approvals (Allow paid models)
// (with its prices) for its steps (2.11.0 QA, owner 2026-11-01). Each such step carries the spend
// effect, so the request asks once with the cost; a schedule never spends. Outside a request (a
// Boardroom reply) the agent uses this computer's model: nothing is spent without asking.
import { isPaidModelId, type PlanStep } from './stepGraph';
import { getAgentProvider } from '../modelSelectionService';
import { paidModelAvailable, paidModelId, estimateCostUsd, PAID_MAX_OUTPUT_TOKENS, PAID_PROMPT_ALLOWANCE_CHARS } from './joseSpend';
import { agentName } from './agentNames';

const SCHEDULE_NEVER_SPENDS = 'a schedule never spends';

/** Steps made by a tool, never by the agent's model (ComfyUI, AudioCraft, Higgsfield): the paid
 *  model would not be used, so they keep their own effects and costs (owner, 2026-11-01). */
export const STEPS_WITHOUT_AGENT_MODEL = new Set(['creative_image', 'creative_chat_video', 'creative_chat_music', 'creative_higgsfield', 'creative_character_train']);

export function withAgentPaidModels(
  steps: PlanStep[],
  options: { requestText: string; allowPaidModels?: boolean },
): { steps: PlanStep[]; notes: string[] } {
  const notes = new Map<string, string>();
  const out = steps.map((step) => {
    // A paid model Jose's planner gave a tool step goes, with its spend and cost: the tool makes it
    // (owner, 2026-11-02: a picture asked to spend).
    if (STEPS_WITHOUT_AGENT_MODEL.has(step.actionType) && isPaidModelId(step.model)) {
      const { model: _model, costEstimateUsd: _cost, ...rest } = step;
      return { ...rest, effects: step.effects.filter((e) => e !== 'spend') };
    }
    if (step.model || step.agent === 'jose' || STEPS_WITHOUT_AGENT_MODEL.has(step.actionType) || getAgentProvider(step.agent).provider !== 'paid') return step;
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
