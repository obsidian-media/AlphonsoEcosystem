// Maria reviews a plan or an action (agent phase 3, owner 2026-10-25): the risk with a
// reason, each rule that applies and why, concrete points for this plan, what needs your
// approval (only for reasons she gave), and, when the plan sends or posts something, an
// offer to have Marcus prepare it. Her model only; no "low risk, approval required".
import { generateAgentLlmResponse } from '../../lib/ollama';
import { describeResponsibility } from '../jose/agentPermissionTable';
import { skillSection, stepInputText, type StepInput } from '../jose/stepInput';
import { resolveSecureSessionId } from '../connectors/hermesAgentConnector';
import { MARIA_NO_REVIEW } from './mariaWorkReview';
import { MARIA_SECURITY_LINE, type MariaAssignment, type MariaStepResult } from './mariaTypes';

export type Risk = 'low' | 'medium' | 'high';
export interface PlanReview {
  risk: Risk;
  why: string;
  rules: { rule: string; applies: string }[];
  points: string[];
  needsApproval: boolean;
  approvalReasons: string[];
  offer: string;
}

export const LOW_WITH_APPROVAL = 'You asked for approval but said low risk: say which.';
const RISKS: Risk[] = ['low', 'medium', 'high'];
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const plain = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const sentence = (t: string) => (/[.!?]$/.test(t) ? t : `${t}.`);

function readJson(text: string): any {
  const value = String(text || '').replace(/```(?:json)?/gi, '');
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(value.slice(start, end + 1)); } catch { return null; }
}

export function planReviewPrompt(input: StepInput, opts: { ask?: string }): string {
  const role = describeResponsibility('maria');
  return [
    `You are Maria. You own: ${role?.owns || ''} You never: ${role?.never || ''}`,
    skillSection(input),
    input.instruction ? `Your task: ${input.instruction}` : '',
    `The plan or action to review: ${input.request}`,
    stepInputText({ ...input, skill: null }),
    'Say the risk (low, medium or high) and why in one sentence. Name each rule that applies to this plan and why it applies. List concrete risks or gaps in this plan, one sentence each: not general advice.',
    'Ask for approval only for a reason you listed. When the plan sends or posts something, say in "offer" what Marcus could prepare; you do not send anything.',
    MARIA_SECURITY_LINE,
    opts.ask || '',
    "Judge only what you see here; never rely on another agent's check you didn't see.",
    'Answer with JSON only: {"risk": "low", "why": "...", "rules": [{"rule": "...", "applies": "..."}], "points": ["..."], "needsApproval": false, "approvalReasons": ["..."], "offer": "", "help": ""}',
  ].filter(Boolean).join('\n\n');
}

export function parsePlanReview(text: string): (PlanReview & { help: string }) | null {
  const data = readJson(text);
  const risk = str(data?.risk).toLowerCase() as Risk;
  if (!data || !RISKS.includes(risk)) return null;
  const rules = (Array.isArray(data.rules) ? data.rules : []).map((r: any) => ({ rule: str(r?.rule), applies: str(r?.applies) })).filter((r: { rule: string }) => r.rule);
  const points: string[] = (Array.isArray(data.points) ? data.points : []).map(str).filter(Boolean);
  const said = [...points, ...rules.flatMap((r: { rule: string; applies: string }) => [r.rule, r.applies])].map(plain);
  const approvalReasons: string[] = (Array.isArray(data.approvalReasons) ? data.approvalReasons : []).map(str).filter(Boolean)
    .filter((reason: string) => said.some((s) => s && (s.includes(plain(reason)) || plain(reason).includes(s))));
  return {
    risk,
    why: str(data.why),
    rules,
    points,
    needsApproval: Boolean(data.needsApproval) && approvalReasons.length > 0,
    approvalReasons,
    offer: str(data.offer),
    help: str(data.help),
  };
}

export function contradiction(r: PlanReview): string | null {
  return r.needsApproval && r.risk === 'low' ? LOW_WITH_APPROVAL : null;
}

export function planReviewText(r: PlanReview): string {
  const lines: string[] = [`Risk: ${r.risk}.${r.why ? ` ${sentence(r.why)}` : ''}`];
  if (r.rules.length) lines.push('Rules that apply:', ...r.rules.map((x) => `- ${x.rule}${x.applies ? `: ${x.applies}` : ''}`));
  if (r.points.length) lines.push('Points:', ...r.points.map((p) => `- ${sentence(p)}`));
  if (r.needsApproval) lines.push(`Needs your approval: ${r.approvalReasons.join(' ')}`);
  if (r.offer) lines.push('', `Want me to have Marcus prepare this? (${r.offer})`);
  return lines.join('\n');
}

export async function runMariaPlanReview(
  assignment: MariaAssignment,
  input: StepInput,
  opts: { signal?: AbortSignal } = {},
): Promise<MariaStepResult> {
  const contractAction = String(assignment.actionType || 'governance_audit');
  const base = { resultUrl: null, artifacts: [] as [], sources: [] as string[], contractAction };
  let review: ReturnType<typeof parsePlanReview> = null;
  let ask = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let text = '';
    try {
      const reply: any = await generateAgentLlmResponse('maria', {
        prompt: planReviewPrompt(input, { ask }),
        format: 'json',
        signal: opts.signal,
        sessionId: assignment.packetId ? resolveSecureSessionId(assignment.packetId) : undefined,
      } as never);
      text = String(reply?.response || '');
    } catch { text = ''; }
    const next = parsePlanReview(text);
    if (!next) continue;
    review = next;
    const problem = contradiction(next);
    if (!problem) break;
    ask = problem;
  }
  if (!review) return { ...base, summary: MARIA_NO_REVIEW, resultState: 'failed', schema: null, failureReason: MARIA_NO_REVIEW };
  // Still "low" with an approval after asking: the approval stands, so the risk is medium.
  if (contradiction(review)) review = { ...review, risk: 'medium' };
  const { help, ...plan } = review;
  const summary = [planReviewText(plan), help ? `HELP: ${help}` : ''].filter(Boolean).join('\n\n');
  return {
    ...base,
    summary,
    resultState: 'completed',
    schema: { kind: 'plan', ...plan, riskLevel: plan.risk, approvalRequired: plan.needsApproval, summary: planReviewText(plan).split('\n')[0] },
  };
}
