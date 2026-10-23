// Review loops (owner: Q8; phase 4): when a review step finds problems, the
// work goes back to its author with the findings and is reviewed again, up
// to JOSE_LIMITS.maxFixRounds rounds; then Jose asks the user.
// Design: docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md §2.8
import { generateAgentLlmResponse } from '../../lib/ollama';
import { JOSE_LIMITS, type PlanStep } from './stepGraph';
import type { PlanChange } from './joseAdapt';

export interface ReviewJudgement {
  verdict: 'pass' | 'fix';
  findings: string[];
  note?: string;
}

const UNREADABLE = "Couldn't read the review's verdict; carried on.";

function outputText(output: any): string {
  if (!output) return '';
  const parts = [String(output.summary || '')];
  for (const artifact of output.artifacts || []) {
    parts.push(typeof artifact?.raw === 'string' ? artifact.raw : JSON.stringify(artifact?.data ?? artifact ?? ''));
  }
  return parts.filter(Boolean).join('\n').slice(0, 3000);
}

/** Ask the reviewer's own model whether its review asked for changes. Unreadable → pass, with a note. */
export async function judgeReview(review: PlanStep, output: any): Promise<ReviewJudgement> {
  const prompt = [
    'You wrote the review below.',
    `Your review:\n${outputText(output) || '(empty)'}`,
    'Did your review ask for changes before this work can be used?',
    'Answer with JSON only: {"verdict": "pass" or "fix", "findings": ["<each change needed, in a short sentence>"]}',
  ].join('\n\n');
  try {
    const result = await generateAgentLlmResponse(review.agent, { prompt, format: 'json' });
    const text = String(result?.response || '');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    const parsed = start >= 0 && end > start ? JSON.parse(text.slice(start, end + 1)) : null;
    if (parsed?.verdict === 'pass') return { verdict: 'pass', findings: [] };
    if (parsed?.verdict === 'fix') {
      const findings = Array.isArray(parsed.findings) ? parsed.findings.filter((f: unknown) => typeof f === 'string' && f.trim()).map((f: string) => f.trim()) : [];
      return { verdict: 'fix', findings: findings.length ? findings : ['The review asked for changes.'] };
    }
  } catch { /* unreadable: carry on */ }
  return { verdict: 'pass', findings: [], note: UNREADABLE };
}

const baseReviewId = (id: string) => id.replace(/-r\d+$/, '');
const sentences = (items: string[]) => items.map((f) => (/[.!?]$/.test(f) ? f : `${f}.`)).join(' ');

/**
 * What a round of reviews changes. For each author with a `fix`: one revision
 * (same agent and task, the findings added) and a re-review per reviewer,
 * later steps moved to wait for the re-reviews. After maxRounds, a note.
 */
export function planReviewRound(
  steps: PlanStep[],
  judged: { review: PlanStep; verdict: 'pass' | 'fix'; findings: string[] }[],
  maxRounds: number = JOSE_LIMITS.maxFixRounds,
): { changes: PlanChange[]; notes: string[] } {
  const changes: PlanChange[] = [];
  const notes: string[] = [];
  const byAuthor = new Map<string, typeof judged>();
  for (const item of judged) {
    if (!item.review.reviewOf) continue;
    byAuthor.set(item.review.reviewOf, [...(byAuthor.get(item.review.reviewOf) || []), item]);
  }
  for (const [authorId, reviews] of byAuthor) {
    const fixes = reviews.filter((r) => r.verdict === 'fix');
    if (fixes.length === 0) continue;
    const findings = fixes.flatMap((r) => r.findings);
    const reviewed = steps.find((s) => s.stepId === authorId);
    if (!reviewed) continue;
    const original = steps.find((s) => s.stepId === (reviewed.revises || reviewed.stepId)) || reviewed;
    const round = Math.max(...reviews.map((r) => r.review.round || 0)) + 1;
    if (round > maxRounds) {
      notes.push(`The review still found problems after ${maxRounds} rounds: ${sentences(findings)} Tell me what to change, or use it as it is.`);
      continue;
    }
    const revisionId = `${original.stepId}-fix-${round}`;
    const reviewIds = reviews.map((r) => r.review.stepId);
    const revision: PlanStep = {
      stepId: revisionId,
      agent: original.agent,
      actionType: original.actionType,
      effects: [...original.effects],
      needs: [reviewed.stepId, ...reviewIds],
      instruction: `${original.instruction || ''}\n\nFix what the review found:\n- ${findings.join('\n- ')}`.trim(),
      revises: original.stepId,
      round,
      ...(original.model ? { model: original.model } : {}),
    };
    const reReviews: PlanStep[] = reviews.map((r) => ({
      stepId: `${baseReviewId(r.review.stepId)}-r${round}`,
      agent: r.review.agent,
      actionType: r.review.actionType,
      effects: [...r.review.effects],
      needs: [revisionId],
      instruction: r.review.instruction,
      reviewOf: revisionId,
      round,
      ...(r.review.model ? { model: r.review.model } : {}),
    }));
    changes.push({
      add: [revision, ...reReviews],
      rewire: { from: reviewIds, to: reReviews.map((r) => r.stepId) },
      reason: `The review found problems, so ${original.agent} revises (round ${round}): ${sentences(findings)}`,
    });
  }
  return { changes, notes };
}
