// When Maria asks for your approval, or her final re-review still says "fix" after the review
// rounds (agent phase 3, owner 2026-10-25), the steps after hers wait for you, with her
// reasons. It uses the existing step wait (`waitFor`), so Approve works wherever it already
// does: the board, Telegram, Chat.

interface HoldableStep { stepId?: string; needs?: string[]; waitFor?: string; [key: string]: unknown }

/** Why the steps after this Maria step should wait, or null. */
export function mariaHoldFor(assignment: { agent?: string; stepId?: string; round?: number }, result: any, maxRounds: number): string | null {
  if (assignment?.agent !== 'maria' || result?.resultState !== 'completed') return null;
  const schema = result.schema || {};
  if (schema.kind === 'plan' && schema.needsApproval) {
    return `Maria asks for your approval: ${(schema.approvalReasons || []).join(' ')}`.trim();
  }
  if (schema.kind === 'work' && schema.verdict === 'fix' && Number(assignment.round || 0) >= maxRounds) {
    return `Maria asked for changes: ${(schema.findings || []).join(' ')}`.trim();
  }
  return null;
}

/** Gives every step that needs `stepId` the wait reason; returns the ones held. */
export function holdStepsAfter(steps: HoldableStep[], stepId: string, reason: string): string[] {
  const held: string[] = [];
  for (const step of steps) {
    if (!step || step.stepId === stepId || !(step.needs || []).includes(stepId)) continue;
    step.waitFor = step.waitFor ? `${step.waitFor} ${reason}` : reason;
    if (step.stepId) held.push(step.stepId);
  }
  return held;
}
