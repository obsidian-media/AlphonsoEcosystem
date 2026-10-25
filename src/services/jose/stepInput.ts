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
  /** The piece of work itself (a post, a script, a letter), for whoever sends or uses it. */
  main: string;
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
  /** The skill this step runs with and what its tools found (agent roles Part B), else null. */
  skill?: StepSkill | null;
}

export interface StepSkill {
  name: string;
  reason: string;
  instructions: string;
  results: { tool: string; text: string }[];
}

export const STEP_INPUT_LIMITS = { localChars: 6000, largeChars: 20000, otherLines: 12, otherLineChars: 160 };

/** Artifacts that describe how a step ran, not what it made: never handed on. */
const INTERNAL_ARTIFACTS = new Set(['comfyui_local_generation_options', 'open_runtime_hub', 'generated_images', 'orchestration_review', 'direct_answer', 'assistant_answer']);
/** Fields that hold the work itself, most specific first. */
const MAIN_FIELDS = ['post', 'text', 'body', 'message', 'letter', 'script', 'caption', 'draft', 'content', 'report'];

function mainOf(output: StepOutput): string {
  const holders = [output.schema, ...(Array.isArray(output.artifacts) ? output.artifacts : [])];
  for (const field of MAIN_FIELDS) {
    for (const holder of holders as any[]) {
      const value = holder && typeof holder === 'object' ? (holder.data && typeof holder.data === 'object' ? holder.data[field] ?? holder[field] : holder[field]) : undefined;
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return typeof output.summary === 'string' ? output.summary.trim() : '';
}

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
    if (INTERNAL_ARTIFACTS.has(String(artifact?.type || ''))) continue;
    let text = '';
    if (typeof artifact?.raw === 'string' && artifact.raw) text = artifact.raw;
    else if (artifact?.data !== undefined && artifact?.data !== null) text = toReadableText(artifact.data);
    else if (artifact && typeof artifact === 'object') {
      // A plain object is the work itself (Miya's package with its script, for example).
      const { type: _type, ...rest } = artifact;
      if (Object.keys(rest).length) text = toReadableText(rest);
    }
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
    main: mainOf(output),
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
/** The step's skill and what its tools found, for any prompt; '' without one. */
export function skillSection(input: StepInput | null | undefined): string {
  const skill = input?.skill;
  if (!skill) return '';
  const found = skill.results.length
    ? `\n\nWhat your tools found:\n${skill.results.map((r) => `- ${r.tool}: ${r.text}`).join('\n')}`
    : '';
  return `Your skill: ${skill.name}\n${skill.instructions}${found}`;
}

export function stepInputText(input: StepInput): string {
  const parts: string[] = [];
  const skill = skillSection(input);
  if (skill) parts.push(skill);
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
