// Jose plans with his model, and the rules check every plan (owner, Q19).
// Templates are starting points he may adapt or ignore; "plan this fresh"
// skips them. A plan that fails the rules gets one fix; after that, or when
// the model is unavailable, the simple rule-based plan runs and Jose says so
// (owner, 2026-10-23).
// Design: docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md §2.3–2.4, §5
import { generateAgentLlmResponse } from '../../lib/ollama';
import { decomposeJoseCommand, parseJoseCommand } from '../joseCommandRouterService';
import { AGENT_PERMISSION_TABLE, describeAgentPermissions } from './agentPermissionTable';
import { EFFECT_LABELS, JOSE_EFFECTS, inferEffects, type JoseEffect } from './joseEffects';
import { TEMPLATE_FIT_THRESHOLD, getTemplate, scoreTemplateFit, type JoseTemplate } from './joseTemplates';
import { JOSE_LIMITS, checkPlan, legacyNeeds, type PlanStep } from './stepGraph';

export interface JosePlan {
  steps: PlanStep[];
  source: 'template' | 'adapted' | 'fresh' | 'rules';
  templateId: string | null;
  kind: 'normal' | 'project';
  /** Why the simple plan (or a template unchanged) was used; empty when Jose's plan passed. */
  note: string;
}

interface PlanOptions {
  planFresh?: boolean;
  history?: { role: string; content: string }[];
  signal?: AbortSignal;
}

function agentsForPrompt(): string {
  return Object.entries(AGENT_PERMISSION_TABLE)
    .map(([agent, p]) => `- ${agent} (${p.role}): task types starting with ${p.taskTypes.join(', ')}; may: ${describeAgentPermissions(agent).allowed.join('; ')}`)
    .join('\n');
}

function templateForPrompt(template: JoseTemplate): string {
  const steps = template.steps.map((s) => ({ id: s.stepId, agent: s.agent, taskType: s.actionType, instruction: s.instruction, effects: s.effects, needs: s.needs }));
  return `Starting point: ${template.name} (template "${template.id}"). Adapt it to the request, or ignore it if it does not fit:\n${JSON.stringify(steps, null, 2)}`;
}

function buildPrompt(text: string, template: JoseTemplate | null, history: PlanOptions['history'], problems: string[]): string {
  const recent = (history || []).slice(-6).map((m) => `${m.role}: ${String(m.content).slice(0, 400)}`).join('\n');
  return [
    'You are Jose, the orchestrator. Plan the request as steps for the agents below. You never do the work yourself.',
    `Agents:\n${agentsForPrompt()}`,
    `Effects a step can have: ${JOSE_EFFECTS.map((e) => `${e} (${EFFECT_LABELS[e]})`).join(', ')}. Only alphonso may run; only marcus may publish_or_send.`,
    `Limits: at most ${JOSE_LIMITS.maxSteps} steps. Use "kind": "project" for long work such as building an app, otherwise "normal".`,
    template ? templateForPrompt(template) : '',
    recent ? `Recent conversation:\n${recent}` : '',
    `Request: ${text}`,
    problems.length ? `Your last plan did not pass the checks:\n- ${problems.join('\n- ')}\nFix these problems.` : '',
    'Answer with JSON only: {"basedOnTemplate": "<template id>" or null, "kind": "normal" or "project", "steps": [{"id": "short_id", "agent": "<agent>", "taskType": "<task type>", "instruction": "<what to do>", "effects": ["<effect>"], "needs": ["<step id>"]}]}',
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
function readModelPlan(raw: string): ModelPlan | null {
  const parsed = extractJson(raw) as { basedOnTemplate?: unknown; kind?: unknown; steps?: unknown } | null;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.steps) || parsed.steps.length === 0) return null;
  const steps: PlanStep[] = [];
  for (const item of parsed.steps as Record<string, unknown>[]) {
    if (!item || typeof item.id !== 'string' || typeof item.agent !== 'string' || typeof item.taskType !== 'string') return null;
    const declared = Array.isArray(item.effects) ? item.effects.filter((e): e is JoseEffect => JOSE_EFFECTS.includes(e as JoseEffect)) : [];
    // The union with the inferred effects: a step cannot dodge approval by under-declaring.
    const effects = [...new Set([...declared, ...inferEffects(item.taskType)])];
    steps.push({
      stepId: item.id,
      agent: item.agent.toLowerCase(),
      actionType: item.taskType,
      instruction: typeof item.instruction === 'string' ? item.instruction : '',
      effects,
      needs: Array.isArray(item.needs) ? item.needs.filter((n): n is string => typeof n === 'string') : [],
    });
  }
  return {
    basedOnTemplate: typeof parsed.basedOnTemplate === 'string' ? parsed.basedOnTemplate : null,
    kind: parsed.kind === 'project' || parsed.kind === 'normal' ? parsed.kind : null,
    steps,
  };
}

function sameShape(steps: PlanStep[], template: JoseTemplate): boolean {
  return steps.length === template.steps.length
    && steps.every((s, i) => s.agent === template.steps[i].agent && s.actionType === template.steps[i].actionType);
}

function rulesPlan(text: string): PlanStep[] {
  const assignments = decomposeJoseCommand(parseJoseCommand(text));
  const seen: Record<string, number> = {};
  const steps = assignments.map((a) => {
    seen[a.agent] = (seen[a.agent] || 0) + 1;
    return {
      stepId: seen[a.agent] === 1 ? a.agent : `${a.agent}-${seen[a.agent]}`,
      agent: a.agent,
      actionType: a.actionType,
      instruction: a.title,
      effects: inferEffects(a.actionType),
      needs: [] as string[],
    };
  });
  const needs = legacyNeeds(steps);
  return steps.map((s) => ({ ...s, needs: needs[s.stepId] || [] }));
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
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let raw: string;
    try {
      const result = await generateAgentLlmResponse('jose', { prompt: buildPrompt(text, template, options.history, problems), format: 'json', signal: options.signal });
      raw = String(result?.response || '');
    } catch {
      return fallback(text, template, "Jose's model isn't available, so I used the simple plan.");
    }
    const plan = readModelPlan(raw);
    if (!plan) {
      problems = ['The answer could not be read as a plan with at least one step.'];
      continue;
    }
    const check = checkPlan(plan.steps);
    if (!check.ok) {
      problems = check.problems;
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
