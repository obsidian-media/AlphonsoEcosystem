// A serious Sentinel finding holds the steps after his (agent phase 4, owner 2026-10-25), the
// same way Maria's approval does (`holdStepsAfter()` in maria/mariaHolds.ts); so does a "fix"
// left after the review rounds.

/** Why the steps after this Sentinel step should wait, or null. */
export function sentinelHoldFor(assignment: { agent?: string; round?: number }, result: any, maxRounds = 2): string | null {
  if (assignment?.agent !== 'sentinel' || result?.resultState !== 'completed') return null;
  const schema = result.schema || {};
  if (schema.kind !== 'security') return null;
  const findings = (schema.findings || []).join(' ');
  if (schema.requiresApproval) return `Sentinel asks for your approval: ${findings}`.trim();
  if (schema.reviewVerdict === 'fix' && Number(assignment.round || 0) >= maxRounds) return `Sentinel asked for changes: ${findings}`.trim();
  return null;
}
