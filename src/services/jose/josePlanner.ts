// Jose plans with his model, and the rules check every plan (owner, Q19).
// Templates are starting points he may adapt or ignore; "plan this fresh"
// skips them. A plan that fails the rules gets one fix; after that, or when
// the model is unavailable, the simple rule-based plan runs and Jose says so
// (owner, 2026-10-23).
// Design: docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md §2.3–2.4, §5
import { generateAgentLlmResponse } from '../../lib/ollama';
import { asksReadiness, decomposeJoseCommand, parseJoseCommand } from '../joseCommandRouterService';
import { toCurrentOwners } from './movedTaskTypes';
import { planningMenu } from './taskTypeMeanings';
import { EFFECT_LABELS, JOSE_EFFECTS, inferEffects, type JoseEffect } from './joseEffects';
import { TEMPLATE_FIT_THRESHOLD, getTemplate, scoreTemplateFit, type JoseTemplate } from './joseTemplates';
import { JOSE_LIMITS, checkPlan, legacyNeeds, type PlanStep } from './stepGraph';
import { listInstalledModels } from './joseModels';
import { paidModelAvailable, paidModelId, estimateCostUsd, PAID_MAX_OUTPUT_TOKENS, PAID_PROMPT_ALLOWANCE_CHARS } from './joseSpend';
import { getAgentProvider } from '../modelSelectionService';
import { CONNECTOR_NAMES } from '../marcus/destinations';
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
 * A request that asks to send needs Marcus's send step (agent phase 5): a 7B model planned only
 * the writing for "post it to Slack #news", and the reply read as if it was posted.
 */
export function missingSend(text: string, steps: Array<Pick<PlanStep, 'agent' | 'effects' | 'actionType'>>): string[] {
  if (asksReadiness(text)) {
    return steps.some((st) => st.agent === 'marcus' && st.actionType === 'distribution_readiness')
      ? [] : ['The request asks whether it is ready to send: add a marcus step with the task type distribution_readiness.'];
  }
  const sends = parseJoseCommand(text).sends;
  if (!sends) return [];
  if (steps.some((st) => st.agent === 'marcus' && (st.effects || []).includes('publish_or_send'))) return [];
  const where = sends.channels.map((c) => (c === 'team' ? 'your team' : CONNECTOR_NAMES[c as MarcusConnector] || c)).join(' and ');
  return [`The request asks to send to ${where}: add a marcus step that sends it.`];
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

function buildPrompt(text: string, template: JoseTemplate | null, history: PlanOptions['history'], problems: string[], installed: string[] = [], paidModel: string | null = null): string {
  const recent = (history || []).slice(-6).map((m) => `${m.role}: ${String(m.content).slice(0, 400)}`).join('\n');
  return [
    'You are Jose, the orchestrator. Plan the request as steps for the agents below. You never do the work yourself.',
    `Agents and the jobs each may take (use these task types):\n${agentsForPrompt()}`,
    `Effects a step can have: ${JOSE_EFFECTS.map((e) => `${e} (${EFFECT_LABELS[e]})`).join(', ')}. Only alphonso may run; only marcus may publish_or_send.`,
    `A review step names the step it reviews ("reviewOf"); if it finds problems the work goes back for at most ${JOSE_LIMITS.maxFixRounds} rounds, so plan one review, not several.`,
    `Limits: at most ${JOSE_LIMITS.maxSteps} steps. Use "kind": "project" for long work such as building an app, otherwise "normal".`,
    installed.length ? `Installed models you may choose for a step ("model"; leave it out to use the agent's own): ${installed.join(', ')}. Use a larger one only where the step needs it.` : '',
    paidModel ? `A paid model is also allowed: ${paidModel}. Use it only where no local model would do; a step given it costs money and waits for approval.` : '',
    template ? templateForPrompt(template) : '',
    recent ? `Recent conversation:\n${recent}` : '',
    `Request: ${text}`,
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
  return steps.map((step) => {
    if (step.reviewOf || !isReviewType(step.actionType)) return step;
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
  const best = options.planFresh ? null : scoreTemplateFit(text).find((s) => s.score >= TEMPLATE_FIT_THRESHOLD);
  const template = best ? getTemplate(best.templateId) : null;
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
    const unsent = missingSend(text, plan.steps);
    if (!check.ok || copied.length || unsent.length) {
      problems = [...copied, ...unsent, ...(check.ok ? [] : check.problems)];
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
