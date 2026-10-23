// What Jose changes in a plan while it runs (phase 4): after each wave of
// steps he may add steps (a review round, a help request) and move later
// steps to wait for them. The runner checks every change with checkPlan()
// and the limits before applying it, and logs the reason.
// Design: docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md §2.6–2.8
import type { PlanStep } from './stepGraph';
import { judgeReview, planReviewRound } from './joseReviewLoop';
import { findHelpRequest, chooseHelper, planHelp } from './joseHelp';
import { paidModelAvailable, paidModelId, estimateCostUsd, PAID_MAX_OUTPUT_TOKENS, PAID_PROMPT_ALLOWANCE_CHARS } from './joseSpend';
const isPaidModel = (model?: string) => typeof model === 'string' && /^(claude|chatgpt):/.test(model);

/**
 * A step that still failed after the local retries and the larger local
 * model: a paid model may try it, as a new step that asks first (it spends).
 */
function planPaidRetry(steps: PlanStep[], step: PlanStep, requestText: string): PlanChange | null {
  const paidId = `${step.stepId}-paid`;
  if (step.replaces || isPaidModel(step.model) || steps.some((s) => s.stepId === paidId)) return null;
  if (!paidModelAvailable().ok) return null;
  const model = paidModelId();
  if (!model) return null;
  const costEstimateUsd = estimateCostUsd((step.instruction || '').length + requestText.length + PAID_PROMPT_ALLOWANCE_CHARS, PAID_MAX_OUTPUT_TOKENS);
  const { reviewOf, round, revises, helpRound, instruction } = step;
  return {
    add: [{
      stepId: paidId,
      agent: step.agent,
      actionType: step.actionType,
      effects: [...new Set([...step.effects, 'spend' as const])],
      needs: [...step.needs],
      ...(instruction ? { instruction } : {}),
      ...(reviewOf ? { reviewOf } : {}),
      ...(round ? { round } : {}),
      ...(revises ? { revises } : {}),
      ...(helpRound ? { helpRound } : {}),
      model,
      replaces: step.stepId,
      costEstimateUsd,
    }],
    rewire: { from: [step.stepId], to: [paidId] },
    reason: `${step.agent} still failed with the local models, so a paid model (${model}) can try it, for about $${costEstimateUsd.toFixed(2)}, if you approve.`,
  };
}

export interface PlanChange {
  add: PlanStep[];
  /** Later steps that need any of `from` need all of `to` instead. */
  rewire?: { from: string[]; to: string[] };
  reason: string;
  /** A review's verdict, saved on its step and in the change log (not in the reply). */
  verdict?: { stepId: string; verdict: 'pass' | 'fix' };
}

const AGENT_NAMES: Record<string, string> = {
  alphonso: 'Alphonso', jose: 'Jose', miya: 'Miya', hector: 'Hector', maria: 'Maria',
  marcus: 'Marcus', echo: 'Echo', sentinel: 'Sentinel', nova: 'Nova',
};

export interface AdaptContext {
  steps: PlanStep[];
  done: Record<string, { status: string; output?: any }>;
  justRan: string[];
  requestText: string;
}

type Adapter = (ctx: AdaptContext) => Promise<PlanChange[]>;
let testAdapter: Adapter | null = null;

/** Tests replace the adapter; null restores the real one. */
export function setPlanAdapterForTests(adapter: Adapter | null): void {
  testAdapter = adapter;
}

/** A change with nothing to add is a note for the change log and the final reply. */
const note = (reason: string): PlanChange => ({ add: [], reason });

export async function adaptPlan(ctx: AdaptContext): Promise<PlanChange[]> {
  if (testAdapter) return testAdapter(ctx);
  const changes: PlanChange[] = [];

  // Review loops: judge each review that just ran, one at a time (one GPU).
  const reviews = ctx.steps.filter((s) => s.reviewOf && ctx.justRan.includes(s.stepId) && ctx.done[s.stepId]?.status === 'executed');
  if (reviews.length > 0) {
    const judged = [];
    for (const review of reviews) {
      const judgement = await judgeReview(review, ctx.done[review.stepId]?.output);
      if (judgement.note) changes.push(note(judgement.note));
      const who = AGENT_NAMES[review.agent] || review.agent;
      changes.push({
        add: [],
        reason: `${who}'s review: ${judgement.verdict === 'fix' ? 'asked for changes' : 'no changes needed'}.`,
        verdict: { stepId: review.stepId, verdict: judgement.verdict },
      });
      judged.push({ review, verdict: judgement.verdict, findings: judgement.findings });
    }
    const round = planReviewRound(ctx.steps, judged);
    changes.push(...round.changes, ...round.notes.map(note));
  }

  // Help requests: a step that just ran and ends with "HELP: ...".
  for (const step of ctx.steps) {
    if (!ctx.justRan.includes(step.stepId) || ctx.done[step.stepId]?.status !== 'executed' || step.helpRound) continue;
    const request = findHelpRequest(ctx.done[step.stepId]?.output);
    if (!request) continue;
    const helper = await chooseHelper(request, step.agent);
    const change = helper ? planHelp(ctx.steps, step, request, helper) : null;
    changes.push(change || note(`${step.agent} asked for help (${request}), but no agent can safely help with that here.`));
  }

  // Paid retries: a step that just failed, when you allow paid models.
  for (const step of ctx.steps) {
    const status = ctx.done[step.stepId]?.status;
    if (!ctx.justRan.includes(step.stepId) || (status !== 'failed' && status !== 'dead_letter')) continue;
    const change = planPaidRetry(ctx.steps, step, ctx.requestText);
    if (change) changes.push(change);
  }
  return changes;
}
