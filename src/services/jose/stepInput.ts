// One input for every step (agent roles Part A, owner 2026-10-24). Until then
// six of the nine agents got only the request text: reviews reviewed the
// request instead of the draft, and Marcus sent the instruction instead of the
// post. Built by step id, so two steps by one agent never hide each other.
// Spec: docs/superpowers/specs/2026-10-24-agent-roles-skills-handover-design.md
import type { PlanStep } from './stepGraph';
import { getStepOutput, listStepOutputs, type StepOutput } from './joseStepOutputs';
import { toReadableText } from '../../lib/readableValue';
import { agentName } from './agentNames';

export interface NeededWork {
  stepId: string;
  agent: string;
  text: string;
  files: string[];
  sources: string[];
  /** Characters left out; the whole output is on the board. */
  cut: number;
}

export interface StepInput {
  instruction: string;
  request: string;
  needs: NeededWork[];
  /** One line for each other finished step of the request, newest first. */
  others: string[];
  memory: string;
  /** The work a review step reviews (its reviewOf step), else null. */
  review: NeededWork | null;
}

export const STEP_INPUT_LIMITS = { localChars: 6000, largeChars: 20000, otherLines: 12, otherLineChars: 160 };

function filesOf(output: StepOutput): string[] {
  const artifacts = Array.isArray(output.artifacts) ? output.artifacts : [];
  return artifacts
    .map((a: any) => a?.path || a?.relativePath || a?.filePath)
    .filter((p: unknown): p is string => typeof p === 'string' && p.length > 0);
}

/** An output as text: its summary, then its structured result, then any artifact text. */
export function readableOutput(output: StepOutput): string {
  const parts: string[] = [];
  if (typeof output.summary === 'string' && output.summary.trim()) parts.push(output.summary.trim());
  if (output.schema && typeof output.schema === 'object') {
    const schemaText = toReadableText(output.schema).trim();
    if (schemaText && !parts.includes(schemaText)) parts.push(schemaText);
  }
  const artifacts = Array.isArray(output.artifacts) ? output.artifacts : [];
  for (const artifact of artifacts as any[]) {
    const text = typeof artifact?.raw === 'string' ? artifact.raw : artifact?.data !== undefined ? toReadableText(artifact.data) : '';
    if (text && text.trim() && !parts.includes(text.trim())) parts.push(text.trim());
  }
  return parts.join('\n\n');
}

function neededWork(output: StepOutput, limit: number): NeededWork {
  const full = readableOutput(output);
  const cut = Math.max(0, full.length - limit);
  const text = cut > 0 ? `${full.slice(0, limit)}\n(cut: ${cut} more characters on the board)` : full;
  return {
    stepId: output.stepId,
    agent: output.agent,
    text,
    files: filesOf(output),
    sources: (Array.isArray(output.sources) ? output.sources : []).map(String),
    cut,
  };
}

function oneLine(output: StepOutput): string {
  const summary = String(output.summary || readableOutput(output) || 'done').replace(/\s+/g, ' ').trim();
  const line = `${agentName(output.agent)}: ${summary}`;
  return line.length > STEP_INPUT_LIMITS.otherLineChars ? `${line.slice(0, STEP_INPUT_LIMITS.otherLineChars - 1)}…` : line;
}

export function buildStepInput(
  commandId: string,
  assignment: PlanStep & { instruction?: string },
  request: string,
  opts: { memory?: string; large?: boolean } = {},
): StepInput {
  const limit = opts.large ? STEP_INPUT_LIMITS.largeChars : STEP_INPUT_LIMITS.localChars;
  const needs = (assignment.needs || [])
    .map((id) => getStepOutput(commandId, id))
    .filter((o): o is StepOutput => Boolean(o))
    .map((o) => neededWork(o, limit));
  const reviewed = assignment.reviewOf ? getStepOutput(commandId, assignment.reviewOf) : null;
  const skip = new Set([assignment.stepId, ...(assignment.needs || [])]);
  const others = listStepOutputs(commandId)
    .filter((o) => !skip.has(o.stepId))
    .sort((a, b) => b.storedAtMs - a.storedAtMs)
    .slice(0, STEP_INPUT_LIMITS.otherLines)
    .map(oneLine);
  return {
    instruction: String(assignment.instruction || '').trim(),
    request: String(request || ''),
    needs,
    others,
    memory: String(opts.memory || '').trim(),
    review: reviewed ? neededWork(reviewed, limit) : null,
  };
}

/** The block an agent's prompt includes: the work it needs, the rest in one line each, memory. */
export function stepInputText(input: StepInput): string {
  const parts: string[] = [];
  if (input.review) parts.push(`The work to review (${agentName(input.review.agent)}'s step):\n${input.review.text || '(empty)'}`);
  for (const need of input.needs) {
    if (input.review && need.stepId === input.review.stepId) continue;
    const extra = [need.files.length ? `Files: ${need.files.join(', ')}` : '', need.sources.length ? `Sources: ${need.sources.join(', ')}` : ''].filter(Boolean).join('\n');
    parts.push(`From ${agentName(need.agent)}'s step (${need.stepId}):\n${need.text || '(nothing saved)'}${extra ? `\n${extra}` : ''}`);
  }
  if (input.others.length) parts.push(`Other steps done so far:\n${input.others.map((l) => `- ${l}`).join('\n')}`);
  if (input.memory) parts.push(`From memory:\n${input.memory}`);
  return parts.join('\n\n');
}
