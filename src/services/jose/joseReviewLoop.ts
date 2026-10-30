// Review loops (owner: Q8; phase 4): when a review step finds problems, the
// work goes back to its author with the findings and is reviewed again, up
// to JOSE_LIMITS.maxFixRounds rounds; then Jose asks the user.
// Design: docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md §2.8
import { generateAgentLlmResponse } from '../../lib/ollama';
import { JOSE_LIMITS, type PlanStep } from './stepGraph';
import type { PlanChange } from './joseAdapt';
import { getProject } from '../contentFactory/contentProjectService';
import { getBrand } from '../contentFactory/contentBrandService';

export interface ReviewJudgement {
  verdict: 'pass' | 'fix';
  findings: string[];
  note?: string;
}

// An unreadable review is never a pass (agent phase 3): the work goes back, and after the
// rounds Jose asks you.
const UNREADABLE_FINDING = 'The review could not be read: check it on the board.';

/**
 * A content-factory quality review's verdict from Maria's own scores (agent phase 3): fix when
 * a piece is under the brand's threshold or she listed an honesty problem. Null when the review
 * isn't one (another agent's, or no scores).
 */
function contentQualityVerdict(review: PlanStep, output: any): ReviewJudgement | null {
  if (review.actionType !== 'audit_content_quality') return null;
  const data = (output?.artifacts || []).find((a: any) => a?.type === 'content_step_output')?.data;
  if (!data || !Array.isArray(data.pieces)) return null;
  const projectId = (review as { contentStep?: { projectId?: string } }).contentStep?.projectId;
  const project = projectId ? getProject(projectId) : null;
  const threshold = Number((project ? getBrand(project.brandId) : null)?.qualityThreshold) || 7;
  const findings: string[] = [];
  for (const piece of data.pieces) {
    const score = Number(piece?.score);
    if (Number.isFinite(score) && score < threshold) {
      const weak = (Array.isArray(piece.weakPoints) ? piece.weakPoints : []).filter(Boolean).join(' ');
      findings.push(`${piece.pieceId || 'piece'}: ${score}/10 (under ${threshold})${weak ? `: ${weak}` : ''}`);
    }
  }
  for (const issue of Array.isArray(data.honestyIssues) ? data.honestyIssues : []) {
    if (typeof issue === 'string' && issue.trim()) findings.push(`Honesty: ${issue.trim()}`);
  }
  return findings.length ? { verdict: 'fix', findings } : { verdict: 'pass', findings: [] };
}

function outputText(output: any): string {
  if (!output) return '';
  const parts = [String(output.summary || '')];
  for (const artifact of output.artifacts || []) {
    parts.push(typeof artifact?.raw === 'string' ? artifact.raw : JSON.stringify(artifact?.data ?? artifact ?? ''));
  }
  return parts.filter(Boolean).join('\n').slice(0, 3000);
}

/** The review's verdict: its own, a content review's from its scores, else its model is asked. Unreadable → fix. */
export async function judgeReview(review: PlanStep, output: any): Promise<ReviewJudgement> {
  // A review step gives its verdict in its own answer (agent roles Part A); ask only when it didn't.
  // Sentinel's verdict is safe/risky/unsafe; his pass/fix is reviewVerdict (agent phase 4).
  const saved = output?.schema?.reviewVerdict ?? output?.schema?.verdict;
  if (saved === 'pass') return { verdict: 'pass', findings: [] };
  if (saved === 'fix') {
    const findings = Array.isArray(output.schema.findings) ? output.schema.findings.filter((f: unknown) => typeof f === 'string' && f.trim()) : [];
    return { verdict: 'fix', findings: findings.length ? findings : ['The review asked for changes.'] };
  }
  const fromScores = contentQualityVerdict(review, output);
  if (fromScores) return fromScores;
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
  } catch { /* unreadable: not a pass */ }
  return { verdict: 'fix', findings: [UNREADABLE_FINDING] };
}

const baseReviewId = (id: string) => id.replace(/-r\d+$/, '');
const sentences = (items: string[]) => items.map((f) => (/[.!?]$/.test(f) ? f : `${f}.`)).join(' ');

/**
 * What a round of reviews changes. For each author with a `fix`: one revision
 * (same agent and task, the findings added) and a re-review per reviewer,
 * later steps moved to the revision and its re-reviews. After maxRounds, a note.
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
    // A late review of work already revised is out of date: the newer draft gets its own re-check
    // (QA batch 1: Marcus's check of the first draft came after it was revised, and "-fix-1" was added twice).
    if (steps.some((s) => s.revises === original.stepId && (s.round || 0) >= round)) continue;
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
      ...(original.contentStep ? { contentStep: original.contentStep } : {}),
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
      ...(r.review.contentStep ? { contentStep: r.review.contentStep } : {}),
      // A re-check keeps what the step was given, e.g. where Marcus sends (agent phase 5).
      ...((r.review as PlanStep & { payload?: unknown }).payload ? { payload: (r.review as PlanStep & { payload?: unknown }).payload } : {}),
    }));
    changes.push({
      add: [revision, ...reReviews],
      // Later steps use the revised work and wait for its re-reviews.
      rewire: { from: [reviewed.stepId, ...reviewIds], to: [revisionId, ...reReviews.map((r) => r.stepId)] },
      reason: `The review found problems, so ${original.agent} revises (round ${round}): ${sentences(findings)}`,
    });
  }
  return { changes, notes };
}
