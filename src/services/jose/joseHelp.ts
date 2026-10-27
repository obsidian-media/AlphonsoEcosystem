// Help requests (phase 4): an agent that needs something another agent could
// provide ends its answer with "HELP: <what it needs>". Jose picks a helper,
// runs it, then runs the asking step again with the help, once per step.
// A help request is model output, so it can never lead to running code,
// changing the project, spending, publishing or deleting: helpers only read
// or write their own work.
// Design: docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md §2.7
import { generateAgentLlmResponse } from '../../lib/ollama';
import { inferEffects, type JoseEffect } from './joseEffects';
import { isTaskTypeAllowed, ownerOf, responsibilityLines } from './agentPermissionTable';
import type { PlanStep } from './stepGraph';
import type { PlanChange } from './joseAdapt';

export interface Helper {
  agent: string;
  actionType: string;
}

const SAFE_HELP_EFFECTS: JoseEffect[] = ['read', 'write_own_work'];
const HELP_LINE = /^\s*HELP:\s*(.+?)\s*$/m; // exactly "HELP:", as agents are told; "Help: …" in a script is content

/** The line every planned step is told about (see stepCommandText). */
export const HELP_INSTRUCTION = 'If you need something another agent could provide (facts, a check, an analysis), end with one line: HELP: <what you need>.';

function textsOf(output: any): string[] {
  if (!output) return [];
  const texts = [String(output.summary || '')];
  for (const artifact of output.artifacts || []) {
    if (typeof artifact?.raw === 'string') texts.push(artifact.raw);
  }
  return texts;
}

/** The help an output asks for, or null. */
export function findHelpRequest(output: any): string | null {
  for (const text of textsOf(output)) {
    const match = text.match(HELP_LINE);
    if (match && match[1]) return match[1].slice(0, 500);
  }
  return null;
}

const ALPHONSO_HELP_TYPES = ['assistant_write', 'assistant_answer'];

function safeHelper(helper: Helper, askingAgent: string): Helper | null {
  if (!helper.agent || !helper.actionType || helper.agent === askingAgent) return null;
  if (!isTaskTypeAllowed(helper.agent, helper.actionType)) return null;
  // Only the agent who owns the work helps with it (agent roles Part A).
  if (ownerOf(helper.actionType) !== helper.agent) return null;
  // Alphonso helps with writing only, never code (agent phase 6).
  if (helper.agent === 'alphonso' && !ALPHONSO_HELP_TYPES.includes(helper.actionType)) return null;
  if (!inferEffects(helper.actionType).every((effect) => SAFE_HELP_EFFECTS.includes(effect))) return null;
  return helper;
}

/** The rules' choice when Jose's model gives no usable answer. */
function ruleHelper(request: string): Helper {
  const text = request.toLowerCase();
  // Security is Sentinel's (agent phase 3: Maria hands a security matter to him).
  if (/\b(security|secret|password|token|credential|unsafe|link|permission)/.test(text)) return { agent: 'sentinel', actionType: 'security_review' };
  if (/\b(accura|correct|check|verify|quality|review|honest)/.test(text)) return { agent: 'maria', actionType: 'audit_quality' };
  // Hector finds facts (markets, competitors and trends too); Nova judges them (2026-10-24).
  if (/\b(when|timing|score|priorit|worth|judge|value)/.test(text)) return { agent: 'nova', actionType: 'analysis_findings' };
  // Something decided before is Echo's to answer (agent phase 7).
  if (/\b(decided|decision|agreed|earlier|before|last time|previous)/.test(text)) return { agent: 'echo', actionType: 'memory_recall' };
  // Wording is Alphonso's everyday writing (agent phase 6).
  if (/\b(wording|rewrite|reword|phrasing|draft|summar|explain)/.test(text)) return { agent: 'alphonso', actionType: 'assistant_write' };
  return { agent: 'hector', actionType: 'research_report' };
}

/**
 * Jose picks who helps. A choice that is not allowed or not safe is refused
 * (null), never swapped for another; an unreadable answer uses the rules.
 */
export async function chooseHelper(request: string, askingAgent: string): Promise<Helper | null> {
  const prompt = [
    `An agent (${askingAgent}) asked for help: ${request}`,
    'Which agent owns what is needed, and with which task type? Each agent helps only with its own work:',
    responsibilityLines().join('\n'),
    'Task types: hector research_, nova analysis_, maria audit_, sentinel security_, miya creative_, echo memory_, alphonso assistant_write or assistant_answer (writing only), echo memory_recall (what was decided before).',
    'Answer with JSON only: {"agent": "<agent>", "taskType": "<task type>"}',
  ].join('\n\n');
  try {
    const result = await generateAgentLlmResponse('jose', { prompt, format: 'json' });
    const text = String(result?.response || '');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    const parsed = start >= 0 && end > start ? JSON.parse(text.slice(start, end + 1)) : null;
    if (parsed && typeof parsed.agent === 'string' && typeof parsed.taskType === 'string') {
      return safeHelper({ agent: parsed.agent.trim().toLowerCase(), actionType: parsed.taskType.trim().toLowerCase() }, askingAgent);
    }
  } catch { /* unreadable: use the rules */ }
  return safeHelper(ruleHelper(request), askingAgent);
}

/** The helper step and the asking step run again with the help; later steps wait for the re-run. One help request per step. */
export function planHelp(steps: PlanStep[], step: PlanStep, request: string, helper: Helper): PlanChange | null {
  if (step.helpRound) return null;
  const helpId = `${step.stepId}-help`;
  const againId = `${step.stepId}-again`;
  if (steps.some((s) => s.stepId === helpId || s.stepId === againId)) return null;
  const help: PlanStep = {
    stepId: helpId,
    agent: helper.agent,
    actionType: helper.actionType,
    effects: inferEffects(helper.actionType),
    needs: [],
    instruction: request,
  };
  const again: PlanStep = {
    stepId: againId,
    agent: step.agent,
    actionType: step.actionType,
    effects: [...step.effects],
    needs: [step.stepId, helpId],
    instruction: `${step.instruction || ''}\n\nUse the help below.`.trim(),
    helpRound: 1,
    ...(step.model ? { model: step.model } : {}),
    ...(step.reviewOf ? { reviewOf: step.reviewOf } : {}),
  };
  return {
    add: [help, again],
    rewire: { from: [step.stepId], to: [againId] },
    reason: `${step.agent} asked for help (${request}), so ${helper.agent} helps and ${step.agent} runs again.`,
  };
}
