// A serious Sentinel finding holds the steps after his (agent phase 4, owner 2026-10-25), the
// same way Maria's approval does (`holdStepsAfter()` in maria/mariaHolds.ts); so does a "fix"
// left after the review rounds.

/** Why Publish waits when Sentinel's check of a content factory campaign found issues. */
export const SECURITY_WAIT = (issues: string[]) => `Sentinel found issues in the campaign: ${issues.join(' ')} Approve to post anyway, or fix the campaign.`;

/** Why the steps after this Sentinel step should wait, or null. */
export function sentinelHoldFor(assignment: { agent?: string; round?: number; actionType?: string }, result: any, maxRounds = 2): string | null {
  if (assignment?.agent !== 'sentinel' || result?.resultState !== 'completed') return null;
  // The content factory's campaign check: any issue keeps Publish waiting.
  if (assignment.actionType === 'security_content_check') {
    const data = (result.artifacts || []).find((a: any) => a?.type === 'content_step_output')?.data;
    const issues = (Array.isArray(data?.issues) ? data.issues : []).map((i: any) => (typeof i === 'string' ? i : `${i?.where ? `${i.where}: ` : ''}${i?.what || ''}${i?.fix ? ` → ${i.fix}` : ''}`)).filter(Boolean);
    return data && (data.ok === false || issues.length) ? SECURITY_WAIT(issues) : null;
  }
  const schema = result.schema || {};
  if (schema.kind !== 'security') return null;
  const findings = (schema.findings || []).join(' ');
  if (schema.requiresApproval) return `Sentinel asks for your approval: ${findings}`.trim();
  if (schema.reviewVerdict === 'fix' && Number(assignment.round || 0) >= maxRounds) return `Sentinel asked for changes: ${findings}`.trim();
  return null;
}
