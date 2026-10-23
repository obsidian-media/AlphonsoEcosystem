// What Jose changes in a plan while it runs (phase 4): after each wave of
// steps he may add steps (a review round, a help request) and move later
// steps to wait for them. The runner checks every change with checkPlan()
// and the limits before applying it, and logs the reason.
// Design: docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md §2.6–2.8
import type { PlanStep } from './stepGraph';
import { judgeReview, planReviewRound } from './joseReviewLoop';
import { findHelpRequest, chooseHelper, planHelp } from './joseHelp';

export interface PlanChange {
  add: PlanStep[];
  /** Later steps that need any of `from` need all of `to` instead. */
  rewire?: { from: string[]; to: string[] };
  reason: string;
}

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
  return changes;
}
