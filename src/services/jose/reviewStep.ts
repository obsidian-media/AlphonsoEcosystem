// A review step judges the work it reviews, and gives its verdict in the same
// answer (agent roles Part A, 2026-10-24). Until then a reviewer saw only the
// request, and the review loop then asked it whether its own review asked for
// changes. Content-factory reviews keep their own executor: they read the
// draft from the project.
import { generateAgentLlmResponse } from '../../lib/ollama';
import { describeResponsibility } from './agentPermissionTable';
import { agentName } from './agentNames';
import type { StepInput } from './stepInput';

export interface ReviewStepResult {
  summary: string;
  resultState: 'completed' | 'failed';
  artifacts: unknown[];
  sources: string[];
  contractAction: string;
  schema?: { verdict?: 'pass' | 'fix'; findings?: string[] };
}

function readAnswer(text: string): { review?: string; verdict?: 'pass' | 'fix'; findings?: string[] } | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!parsed || typeof parsed !== 'object') return null;
    const verdict = parsed.verdict === 'pass' || parsed.verdict === 'fix' ? parsed.verdict : undefined;
    const findings = Array.isArray(parsed.findings)
      ? parsed.findings.filter((f: unknown) => typeof f === 'string' && f.trim()).map((f: string) => f.trim())
      : undefined;
    return { review: typeof parsed.review === 'string' ? parsed.review.trim() : undefined, verdict, findings };
  } catch {
    return null;
  }
}

export async function runReviewStep(agent: string, input: StepInput | null | undefined, actionType: string): Promise<ReviewStepResult> {
  const base = { artifacts: [] as unknown[], sources: [] as string[], contractAction: actionType };
  const work = input?.review;
  if (!work || !work.text.trim()) {
    const whose = work ? `${agentName(work.agent)}'s step` : 'the step to review';
    return { ...base, summary: `Nothing to review: ${whose} saved no work.`, resultState: 'failed' };
  }
  const role = describeResponsibility(agent);
  const prompt = [
    `You are ${agentName(agent)}. You own: ${role?.owns || ''} You never: ${role?.never || ''}`,
    input?.instruction ? `Your task: ${input.instruction}` : '',
    `The request: ${input?.request || ''}`,
    `The work to review (${agentName(work.agent)}'s step):\n${work.text}`,
    'Review it. Say what is good and what must change.',
    'Answer with JSON only: {"review": "your review in a few sentences", "verdict": "pass" or "fix", "findings": ["each change needed, in a short sentence"]}',
  ].filter(Boolean).join('\n\n');
  const reply: any = await generateAgentLlmResponse(agent, { prompt, format: 'json' });
  const text = String(reply?.response || '').trim();
  const answer = readAnswer(text);
  const review = answer?.review || text;
  if (!review) return { ...base, summary: `${agentName(agent)}'s model gave no review.`, resultState: 'failed' };
  const schema: ReviewStepResult['schema'] = {};
  if (answer?.verdict) schema.verdict = answer.verdict;
  if (answer?.findings) schema.findings = answer.findings;
  return { ...base, summary: review, resultState: 'completed', schema };
}
