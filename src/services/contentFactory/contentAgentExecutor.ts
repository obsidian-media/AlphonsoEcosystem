// The agents' content-factory work, run by Jose (executeAssignment) for any
// assignment that carries a `contentStep`. Each agent answers with its own
// model (per-agent providers in Settings apply).
import { generateAgentLlmResponse } from '../../lib/ollama';
import { buildStepPrompt, parseStepAnswer, CONTENT_ACTION_KEYS } from './contentStepPrompts';
import type { ContentStepPayload } from './contentTypes';

export const UNREADABLE_ANSWER = "The model's answer could not be read.";

interface ContentAssignment {
  agent: string;
  actionType: string;
  contentStep: ContentStepPayload;
}

export interface ContentStepResult {
  summary: string;
  resultState: 'completed' | 'failed';
  artifacts: { type: 'content_step_output'; actionType: string; data: unknown; raw: string }[];
  sources: string[];
  contractAction: string;
  failureReason?: string;
}

function failed(assignment: ContentAssignment, reason: string, raw: string): ContentStepResult {
  return {
    summary: `${assignment.agent}: ${reason}`,
    resultState: 'failed',
    artifacts: [{ type: 'content_step_output', actionType: assignment.actionType, data: null, raw }],
    sources: [],
    contractAction: assignment.actionType,
    failureReason: reason,
  };
}

export async function executeContentStepAssignment(assignment: ContentAssignment, _options: unknown = {}): Promise<ContentStepResult> {
  const { agent, actionType, contentStep } = assignment;
  const { system, prompt } = buildStepPrompt(contentStep, agent, actionType);
  const sessionId = `content:${contentStep.projectId}:${contentStep.step}`;
  const ask = async (text: string) => {
    const reply = await generateAgentLlmResponse(agent, { prompt: text, format: 'json', sessionId });
    return String(reply?.response || '');
  };

  let raw = '';
  try {
    raw = await ask(`${system}\n\n${prompt}`);
    let data = parseStepAnswer(actionType, raw);
    if (data === null) {
      raw = await ask(`${system}\n\n${prompt}\n\nYour last answer could not be read; return only JSON with keys ${CONTENT_ACTION_KEYS[actionType] || '{}'}.`);
      data = parseStepAnswer(actionType, raw);
    }
    if (data === null) return failed(assignment, UNREADABLE_ANSWER, raw);
    const references = (data as { references?: { url?: string }[] }).references;
    return {
      summary: `${agent} finished ${actionType.replace(/_/g, ' ')}.`,
      resultState: 'completed',
      artifacts: [{ type: 'content_step_output', actionType, data, raw }],
      sources: Array.isArray(references) ? references.map((r) => String(r?.url || '')).filter(Boolean) : [],
      contractAction: actionType,
    };
  } catch (error) {
    return failed(assignment, `The model could not be reached: ${error instanceof Error ? error.message : String(error)}`, raw);
  }
}
