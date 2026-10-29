// Jose plans with his model, and the rules check every plan (owner, Q19).
// Templates are starting points he may adapt or ignore; "plan this fresh"
// skips them. A plan that fails the rules gets one fix; after that, or when
// the model is unavailable, the simple rule-based plan runs and Jose says so
// (owner, 2026-10-23).
// Design: docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md §2.3–2.4, §5
import { memoryOnlyTask } from '../echo/memoryIntents';
import { generateAgentLlmResponse } from '../../lib/ollama';
import { asksPlanReview, asksReadiness, asksToCleanUpMemory, asksToForget, asksToRemember, decomposeJoseCommand, parseJoseCommand } from '../joseCommandRouterService';
import { toCurrentOwners } from './movedTaskTypes';
import { CODE_TASK_PREFIXES, isCodeRequest, needsFacts, planningMenu } from './taskTypeMeanings';
import { isPlainQuestion } from '../../lib/chatUtils';
import { EFFECT_LABELS, JOSE_EFFECTS, inferEffects, type JoseEffect } from './joseEffects';
import { TEMPLATE_FIT_THRESHOLD, getTemplate, scoreTemplateFit, type JoseTemplate } from './joseTemplates';
import { JOSE_LIMITS, checkPlan, legacyNeeds, type PlanStep } from './stepGraph';
import { listInstalledModels } from './joseModels';
import { paidModelAvailable, paidModelId, estimateCostUsd, PAID_MAX_OUTPUT_TOKENS, PAID_PROMPT_ALLOWANCE_CHARS } from './joseSpend';
import { getAgentProvider } from '../modelSelectionService';
import { CONNECTOR_NAMES } from '../marcus/destinations';
import { asksForProjectWork, listProjects } from '../alphonso/projects';
import type { MarcusConnector } from '../marcus/types';

export interface JosePlan {
  steps: PlanStep[];
  /** 'given': the caller set the steps (Boardroom, a workflow); the note says who (phase 6a). */
  source: 'template' | 'adapted' | 'fresh' | 'rules' | 'given';
  templateId: string | null;
  kind: 'normal' | 'project';
  /** Why the simple plan (or a template unchanged) was used; empty when Jose's plan passed. */
  note: string;
}

interface PlanOptions {
  planFresh?: boolean;
  /** This template is the starting point, whatever else fits (agent roles Part C1: Projects). */
  templateId?: string;
  /** False for a caller that may never spend (a schedule); paid models are then not offered (phase 6a). */
  allowPaidModels?: boolean;
  history?: { role: string; content: string }[];
  signal?: AbortSignal;
}

/** Each agent with its jobs and their meanings (agent phase 1): a small model picks from these, not from bare prefixes. */
function agentsForPrompt(): string {
  return planningMenu();
}

function templateForPrompt(template: JoseTemplate): string {
  const steps = template.steps.map((s) => ({ id: s.stepId, agent: s.agent, taskType: s.actionType, instruction: s.instruction, effects: s.effects, needs: s.needs }));
  return `Starting point: ${template.name} (template "${template.id}"). Adapt it to the request, or ignore it if it does not fit:\n${JSON.stringify(steps, null, 2)}`;
}

/** The example plan in the prompt (agent phase 5): real values, since a small model copied placeholders. */
export const PLAN_EXAMPLE = JSON.stringify({
  basedOnTemplate: null,
  kind: 'normal',
  steps: [
    { id: 'research', agent: 'hector', taskType: 'research_report', instruction: 'Find three facts about honeybees, with sources.', effects: ['read'], needs: [] },
    { id: 'write', agent: 'alphonso', taskType: 'assistant_write', instruction: 'Write a short post from the research.', effects: ['write_own_work'], needs: ['research'] },
  ],
});

const PLACEHOLDER_IDS = new Set(['short_id', 'step_id', 'id']);
const PLACEHOLDER_AGENTS = new Set(['none', 'agent', 'null', '']);
const PLACEHOLDER_TASKS = new Set(['normal', 'project', 'task type', 'tasktype']);

/** Values a model copied from an example or a schema instead of planning (agent phase 5). */
/**
 * What a request explicitly asks for must be in the plan (agent phase 5): a 7B model planned only
 * the writing for "post it to Slack #news", and once plans stopped falling back it also left out
 * the accuracy check asked for. The same words the simple plan reads: a send, a readiness check, a
 * check of the writing, a review of a plan.
 */
/** A request asking which option to choose, do first or is worth it (QA batch 0); "the value of" is not one. */
const ASKS_WHICH_FIRST = /\bprioriti[sz]e\b|\bwhich\b[^.?!]*\b(?:first|best|should|worth)\b|\bworth\s+(?:going\s+after|pursuing|doing)\b|\brank\s+(?:them|these|the\s+options)\b/i;

export function missingAsked(text: string, steps: Array<Pick<PlanStep, 'agent' | 'effects' | 'actionType'>>): string[] {
  const has = (agent: string, test: (st: Pick<PlanStep, 'agent' | 'effects' | 'actionType'>) => boolean = () => true) =>
    steps.some((st) => st.agent === agent && test(st));
  if (asksPlanReview(text)) {
    return has('maria') ? [] : ['The request asks for a review of a plan: add a maria step with the task type audit_governance.'];
  }
  if (asksReadiness(text)) {
    return has('marcus', (st) => st.actionType === 'distribution_readiness')
      ? [] : ['The request asks whether it is ready to send: add a marcus step with the task type distribution_readiness.'];
  }
  const parsed = parseJoseCommand(text);
  const problems: string[] = [];
  if (parsed.intents.check && parsed.intents.writing && !has('maria')) {
    problems.push('The request asks for the writing to be checked: add a maria step with the task type audit_quality that reviews it.');
  }
  // QA batch 0: asking which option to choose or do first is Nova's judgment.
  if (ASKS_WHICH_FIRST.test(text) && !has('nova')) {
    problems.push('The request asks which option to choose: add a nova step with the task type opportunity_analysis.');
  }
  // Agent phase 7: remembering, forgetting and tidying memory are Echo's steps.
  const echoDoes = (types: string[]) => has('echo', (st) => types.includes(String(st.actionType)));
  if (asksToRemember(text) && !echoDoes(['memory_preservation', 'memory_workflow_step'])) {
    problems.push('The request asks to remember something: add an echo step with the task type memory_preservation.');
  }
  if (asksToForget(text) && !echoDoes(['memory_forget'])) {
    problems.push('The request asks to forget something: add an echo step with the task type memory_forget.');
  }
  if (asksToCleanUpMemory(text) && !echoDoes(['memory_cleanup', 'knowledge_curation'])) {
    problems.push('The request asks to clean up memory: add an echo step with the task type memory_cleanup.');
  }
  // Found in the real app: "Clean up my memory" got a forget step too. Echo forgets or tidies only when asked.
  if (!asksToForget(text) && echoDoes(['memory_forget'])) {
    problems.push('The request does not ask to forget anything: remove the memory_forget step.');
  }
  if (!asksToCleanUpMemory(text) && echoDoes(['memory_cleanup', 'knowledge_curation'])) {
    problems.push('The request does not ask to clean up memory: remove the memory_cleanup step.');
  }
  // Agent phase 6: a code request needs Alphonso's code step; plain writing needs no research.
  const codeStep = (st: Pick<PlanStep, 'agent' | 'effects' | 'actionType'>) =>
    CODE_TASK_PREFIXES.some((prefix) => String(st.actionType || '').startsWith(prefix));
  // QA batch 0: changing a file in a saved project is code work too, whatever the file type.
  if ((isCodeRequest(text) || asksForProjectWork(text)) && !isPlainQuestion(text) && !has('alphonso', codeStep)) {
    problems.push('The request asks for code: add an alphonso step with the task type local_operation.');
  }
  // Writing or code that needs no facts gets no research step (agent phase 6).
  if ((parsed.intents.writing || isCodeRequest(text)) && !needsFacts(text) && has('hector')) {
    problems.push("The request doesn't need research: remove the hector step.");
  }
  const sends = parsed.sends;
  if (sends && !has('marcus', (st) => (st.effects || []).includes('publish_or_send'))) {
    const where = sends.channels.map((c) => (c === 'team' ? 'your team' : CONNECTOR_NAMES[c as MarcusConnector] || c)).join(' and ');
    problems.push(`The request asks to send to ${where}: add a marcus step that sends it.`);
  }
  return problems;
}

export function copiedPlaceholders(steps: Array<{ id?: string; agent?: string; taskType?: string }>): string[] {
  const problems: string[] = [];
  for (const step of steps) {
    const id = String(step.id ?? '').trim().toLowerCase();
    const agent = String(step.agent ?? '').trim().toLowerCase();
    const task = String(step.taskType ?? '').trim().toLowerCase();
    if (PLACEHOLDER_IDS.has(id) || id.includes('<')) problems.push(`Step id "${step.id}" is the example's placeholder: use your own ids.`);
    if (PLACEHOLDER_AGENTS.has(agent) || agent.includes('<')) problems.push(`Agent "${step.agent}" is not one of the agents.`);
    if (PLACEHOLDER_TASKS.has(task) || task.includes('<')) problems.push(`Task type "${step.taskType}" is not a task type.`);
  }
  return [...new Set(problems)];
}

export const HISTORY_HEADING = 'Earlier in this chat (background only; where it differs from the request, the request wins):';

const lower = (value: string) => String(value || '').toLowerCase();
const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const names = (haystack: string, needle: string) => new RegExp(`(^|[^\\w#-])${escapeRe(needle)}($|[^\\w-])`, 'i').test(haystack);

/** Destinations (a #channel, a connector, one of your projects) a step names that only the chat's
 *  history named, not the request (Jose phase 7). One problem line each, for the fix round. */
export function historyOnlyDestinations(steps: PlanStep[], text: string, history: PlanOptions['history']): string[] {
  const past = lower((history || []).map((m) => m.content).join('\n'));
  if (!past) return [];
  const asked = lower(text);
  const known = [
    ...Object.values(CONNECTOR_NAMES).map((n) => n.toLowerCase()),
    ...listProjects().map((p) => p.name.toLowerCase()),
  ];
  const problems: string[] = [];
  for (const step of steps) {
    const said = lower(`${step.instruction || ''} ${JSON.stringify((step as { payload?: unknown }).payload || '')}`);
    const channels = said.match(/#[\w-]+/g) || [];
    for (const dest of [...new Set([...channels, ...known.filter((n) => names(said, n))])]) {
      if (names(past, dest) && !names(asked, dest)) problems.push(`Step ${step.stepId} uses "${dest}" from earlier in the chat: use what the request names.`);
    }
  }
  return [...new Set(problems)];
}

function buildPrompt(text: string, template: JoseTemplate | null, history: PlanOptions['history'], problems: string[], installed: string[] = [], paidModel: string | null = null): string {
  const recent = (history || []).slice(-6).map((m) => `${m.role}: ${String(m.content).slice(0, 400)}`).join('\n');
  return [
    'You are Jose, the orchestrator. Plan the request as steps for the agents below. You never do the work yourself.',
    `Agents and the jobs each may take (use these task types):\n${agentsForPrompt()}`,
    `Effects a step can have: ${JOSE_EFFECTS.map((e) => `${e} (${EFFECT_LABELS[e]})`).join(', ')}. Only alphonso may run; only marcus may publish_or_send.`,
    `A review step names the step it reviews ("reviewOf"); if it finds problems the work goes back for at most ${JOSE_LIMITS.maxFixRounds} rounds, so plan one review, not several.`,
    `Limits: at most ${JOSE_LIMITS.maxSteps} steps. Use "kind": "project" for long work such as building an app, otherwise "normal".`,
    "When the request names several of the user's projects, plan one alphonso local_operation step per project.",
    installed.length ? `Installed models you may choose for a step ("model"; leave it out to use the agent's own): ${installed.join(', ')}. Use a larger one only where the step needs it.` : '',
    paidModel ? `A paid model is also allowed: ${paidModel}. Use it only where no local model would do; a step given it costs money and waits for approval.` : '',
    // The request first; the chat is background (Jose phase 7: a destination named two messages
    // earlier was planned over the one the request named).
    `Request: ${text}`,
    template ? templateForPrompt(template) : '',
    recent ? `${HISTORY_HEADING}\n${recent}` : '',
    problems.length ? `Your last plan did not pass the checks:\n- ${problems.join('\n- ')}\nFix these problems.` : '',
    'Answer with JSON only, in this shape. This is an example for a different request; use your own steps, ids and agents:',
    PLAN_EXAMPLE,
    'Give each step a short id of your own. "basedOnTemplate" is the id of the starting point when you used it, else null. Add "model" to a step only to choose an installed model, and "reviewOf" only to a step that reviews another step.',
  ].filter(Boolean).join('\n\n');
}

interface ModelPlan {
  basedOnTemplate: string | null;
  kind: 'normal' | 'project' | null;
  steps: PlanStep[];
}

function extractJson(raw: string): unknown {
  const text = String(raw || '');
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/** The model's answer as steps, or null when it is not a usable plan. */
function readModelPlan(raw: string, installed: string[] = [], paidModel: string | null = null): ModelPlan | null {
  const parsed = extractJson(raw) as { basedOnTemplate?: unknown; kind?: unknown; steps?: unknown } | null;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.steps) || parsed.steps.length === 0) return null;
  const steps: PlanStep[] = [];
  for (const item of parsed.steps as Record<string, unknown>[]) {
    if (!item || typeof item.id !== 'string' || typeof item.agent !== 'string' || typeof item.taskType !== 'string') return null;
    const declared = Array.isArray(item.effects) ? item.effects.filter((e): e is JoseEffect => JOSE_EFFECTS.includes(e as JoseEffect)) : [];
    // The union with the inferred effects: a step cannot dodge approval by under-declaring.
    const effects = [...new Set([...declared, ...inferEffects(item.taskType)])];
    // A model only if it is installed and the agent runs on Ollama (phase 4).
    const agent = item.agent.toLowerCase();
    const localModel = typeof item.model === 'string' && installed.includes(item.model) && getAgentProvider(agent)?.provider === 'ollama' ? item.model : undefined;
    // The paid model only when you allow it; such a step spends, so it asks (phase 4).
    const paid = Boolean(paidModel) && item.model === paidModel;
    const model = localModel || (paid ? paidModel! : undefined);
    const instruction = typeof item.instruction === 'string' ? item.instruction : '';
    if (paid && !effects.includes('spend')) effects.push('spend');
    steps.push({
      ...(model ? { model } : {}),
      ...(paid ? { costEstimateUsd: estimateCostUsd(instruction.length + PAID_PROMPT_ALLOWANCE_CHARS, PAID_MAX_OUTPUT_TOKENS) } : {}),
      stepId: item.id,
      agent,
      actionType: item.taskType,
      instruction,
      effects,
      needs: Array.isArray(item.needs) ? item.needs.filter((n): n is string => typeof n === 'string') : [],
      ...(typeof item.reviewOf === 'string' && item.reviewOf ? { reviewOf: item.reviewOf } : {}),
    });
  }
  return {
    basedOnTemplate: typeof parsed.basedOnTemplate === 'string' ? parsed.basedOnTemplate : null,
    kind: parsed.kind === 'project' || parsed.kind === 'normal' ? parsed.kind : null,
    steps,
  };
}

/**
 * A plan based on a template: a step with a template step's id keeps the
 * template's needs and review when the model left them out (a small model
 * often does, and then every step runs at once). Only ids in the plan.
 */
function fillFromTemplate(steps: PlanStep[], template: JoseTemplate): PlanStep[] {
  const ids = new Set(steps.map((s) => s.stepId));
  return steps.map((step) => {
    const source = template.steps.find((t) => t.stepId === step.stepId);
    if (!source) return step;
    const needs = step.needs.length === 0 ? source.needs.filter((n) => ids.has(n)) : step.needs;
    const reviewOf = step.reviewOf || (source.reviewOf && ids.has(source.reviewOf) ? source.reviewOf : undefined);
    return { ...step, needs, ...(reviewOf ? { reviewOf } : {}) };
  });
}

const isReviewType = (actionType: string) => actionType.startsWith('audit_') || actionType.includes('review');

/**
 * A review step the model did not mark: if its task is a review and it needs
 * exactly one step that is not itself a review, it reviews that step (so its
 * findings can send the work back).
 */
function inferReviewOf(steps: PlanStep[]): PlanStep[] {
  const byId = new Map(steps.map((s) => [s.stepId, s]));
  // The one piece of work in the plan (Alphonso's or Miya's), for a review that names nothing (agent phase 5).
  const work = steps.filter((s) => (s.agent === 'alphonso' || s.agent === 'miya') && !isReviewType(s.actionType));
  return steps.map((step) => {
    if (step.reviewOf || !isReviewType(step.actionType)) return step;
    if (!step.needs.length && work.length === 1) return { ...step, needs: [work[0].stepId], reviewOf: work[0].stepId };
    const reviewed = step.needs.filter((n) => byId.has(n) && !isReviewType(byId.get(n)!.actionType));
    return reviewed.length === 1 ? { ...step, reviewOf: reviewed[0] } : step;
  });
}

function sameShape(steps: PlanStep[], template: JoseTemplate): boolean {
  return steps.length === template.steps.length
    && steps.every((s, i) => s.agent === template.steps[i].agent && s.actionType === template.steps[i].actionType);
}

function rulesPlan(text: string): PlanStep[] {
  const assignments = decomposeJoseCommand(parseJoseCommand(text));
  const seen: Record<string, number> = {};
  // The simple plan's own links are kept (agent phase 3): until then this dropped every
  // step's stepId, needs and reviewOf, so the writing didn't read the research and the
  // check wasn't a review of the writing. The fixed order fills in only missing needs.
  const steps = assignments.map((a: any) => {
    seen[a.agent] = (seen[a.agent] || 0) + 1;
    return {
      stepId: a.stepId || (seen[a.agent] === 1 ? a.agent : `${a.agent}-${seen[a.agent]}`),
      agent: a.agent,
      actionType: a.actionType,
      instruction: a.instruction || a.title,
      effects: inferEffects(a.actionType),
      needs: Array.isArray(a.needs) ? a.needs as string[] : null,
      ...(a.reviewOf ? { reviewOf: a.reviewOf as string } : {}),
      // Where Marcus sends (agent phase 5).
      ...(a.payload ? { payload: a.payload } : {}),
    };
  });
  const order = legacyNeeds(steps.map((s) => ({ agent: s.agent, stepId: s.stepId })));
  return steps.map((s) => ({ ...s, needs: s.needs ?? order[s.stepId] ?? [] })) as PlanStep[];
}

function fallback(text: string, template: JoseTemplate | null, note: string): JosePlan {
  if (template) {
    return { steps: template.steps.map((s) => ({ ...s })), source: 'template', templateId: template.id, kind: template.kind, note };
  }
  return { steps: rulesPlan(text), source: 'rules', templateId: null, kind: 'normal', note };
}

/** Plan `text`: Jose's model, checked by the rules, one fix, then the fallback. */
export async function planJoseRequest(text: string, options: PlanOptions = {}): Promise<JosePlan> {
  // Agent phase 7: a request that only asks to remember, forget or tidy is one Echo step (found in the
  // real app: "Remember that the launch moved" got research, writing and a check from the model).
  const memoryTask = memoryOnlyTask(text);
  if (memoryTask) {
    return {
      steps: [{ stepId: 'echo', agent: 'echo', actionType: memoryTask, effects: inferEffects(memoryTask), needs: [], instruction: 'Do what the request asks with memory.' }],
      source: 'rules', templateId: null, kind: 'normal', note: 'Echo does this.',
    };
  }
  const best = options.planFresh || options.templateId ? null : scoreTemplateFit(text).find((s) => s.score >= TEMPLATE_FIT_THRESHOLD);
  const template = options.templateId ? getTemplate(options.templateId) : best ? getTemplate(best.templateId) : null;
  let problems: string[] = [];
  const installed = await listInstalledModels();
  const paidModel = options.allowPaidModels !== false && paidModelAvailable().ok ? paidModelId() : null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let raw: string;
    try {
      const result = await generateAgentLlmResponse('jose', { prompt: buildPrompt(text, template, options.history, problems, installed, paidModel), format: 'json', signal: options.signal });
      raw = String(result?.response || '');
    } catch {
      return fallback(text, template, "Jose's model isn't available, so I used the simple plan.");
    }
    const plan = readModelPlan(raw, installed, paidModel);
    if (!plan) {
      problems = ['The answer could not be read as a plan with at least one step.'];
      continue;
    }
    const basedOn = template && plan.basedOnTemplate === template.id ? template : null;
    if (basedOn) plan.steps = fillFromTemplate(plan.steps, basedOn);
    plan.steps = toCurrentOwners(inferReviewOf(plan.steps)).steps;
    // Each step only to the agent who owns its kind of work (owner, 2026-10-24),
    // and no code step for a request that isn't about code (agent phase 1).
    const check = checkPlan(plan.steps, { taskTypes: true, request: text });
    const copied = copiedPlaceholders(plan.steps.map((st) => ({ id: st.stepId, agent: st.agent, taskType: st.actionType })));
    const unsent = missingAsked(text, plan.steps);
    const fromHistory = historyOnlyDestinations(plan.steps, text, options.history);
    if (!check.ok || copied.length || unsent.length || fromHistory.length) {
      problems = [...copied, ...unsent, ...fromHistory, ...(check.ok ? [] : check.problems)];
      continue;
    }
    const offered = template && plan.basedOnTemplate === template.id ? template : null;
    return {
      steps: plan.steps,
      source: offered ? (sameShape(plan.steps, offered) ? 'template' : 'adapted') : 'fresh',
      templateId: offered ? offered.id : null,
      kind: plan.kind || offered?.kind || 'normal',
      note: '',
    };
  }
  return fallback(text, template, `My plan didn't pass the checks (${problems[0]}), so I used the simple plan.`);
}

/** How the plan was made, for Chat and the map. */
export function describePlanSource(plan: JosePlan): string {
  const name = plan.templateId ? getTemplate(plan.templateId)?.name || plan.templateId : '';
  const label = plan.source === 'fresh' ? 'Planned fresh.'
    : plan.source === 'template' ? `Based on template ${name}.`
      : plan.source === 'adapted' ? `Based on template ${name} (adapted).`
        : '';
  return [label, plan.note].filter(Boolean).join(' ');
}

/** For tests: the planner's prompt for a request and its chat history. */
export function buildPromptForTests(text: string, history: PlanOptions['history']): string {
  return buildPrompt(text, null, history, []);
}

// A batch planned in one call (Jose phase 7, owner 2026-10-27).
export const BATCH_LABEL = 'Steps planned for a batch.';
const BATCH_SIZE = 20;

function batchPrompt(texts: string[], installed: string[]): string {
  return [
    'You are Jose, the orchestrator. Plan each task below as steps for the agents. You never do the work yourself.',
    `Agents and the jobs each may take (use these task types):\n${agentsForPrompt()}`,
    `Effects a step can have: ${JOSE_EFFECTS.map((e) => `${e} (${EFFECT_LABELS[e]})`).join(', ')}. Only alphonso may run; only marcus may publish_or_send.`,
    installed.length ? `Installed models you may choose for a step ("model"): ${installed.join(', ')}.` : '',
    `Tasks:\n${texts.map((t, i) => `${i + 1}. ${t}`).join('\n')}`,
    'Answer with JSON only: {"plans": [{"task": <the task number>, "steps": [ ...steps as in this example... ]}]}. One plan per task. The example is for a different request; use your own steps, ids and agents:',
    PLAN_EXAMPLE,
  ].filter(Boolean).join('\n\n');
}

async function planBatchChunk(texts: string[], installed: string[], signal?: AbortSignal): Promise<Array<PlanStep[] | null>> {
  const out: Array<PlanStep[] | null> = texts.map(() => null);
  let raw = '';
  try {
    const result = await generateAgentLlmResponse('jose', { prompt: batchPrompt(texts, installed), format: 'json', signal });
    raw = String(result?.response || '');
  } catch {
    return out;
  }
  const parsed = extractJson(raw) as { plans?: unknown } | null;
  if (!parsed || !Array.isArray(parsed.plans)) return out;
  for (const item of parsed.plans as { task?: unknown; steps?: unknown }[]) {
    const index = Number(item?.task) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= texts.length || out[index]) continue;
    const plan = readModelPlan(JSON.stringify({ steps: item.steps }), installed, null);
    if (!plan) continue;
    const steps = toCurrentOwners(inferReviewOf(plan.steps)).steps;
    if (checkPlan(steps, { taskTypes: true, request: texts[index] }).ok) out[index] = steps;
  }
  return out;
}

/** Each task's checked plan, or null (left to be planned on its own as before). One call per 20 tasks. */
export async function planBatch(texts: string[], opts: { signal?: AbortSignal } = {}): Promise<Array<PlanStep[] | null>> {
  const installed = await listInstalledModels();
  const out: Array<PlanStep[] | null> = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    out.push(...await planBatchChunk(texts.slice(i, i + BATCH_SIZE), installed, opts.signal));
  }
  return out;
}
