// What Jose changes in a plan while it runs (phase 4): after each wave of
// steps he may add steps (a review round, a help request) and move later
// steps to wait for them. The runner checks every change with checkPlan()
// and the limits before applying it, and logs the reason.
// Design: docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md §2.6–2.8
import type { PlanStep } from './stepGraph';

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

export async function adaptPlan(ctx: AdaptContext): Promise<PlanChange[]> {
  if (testAdapter) return testAdapter(ctx);
  return [];
}
