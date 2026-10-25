// The agent picks the skill for its step, with a short reason (agent roles
// Part B). Only skills for the step's task are offered; with one, no model is
// asked. A content-factory step needs its fixed format, so it uses its own skill.
import { generateAgentLlmResponse } from '../../lib/ollama';
import { agentName } from '../jose/agentNames';
import { skillsForTask, listSkills } from './skillLibrary';
import type { Skill } from './skillFile';
import type { StepInput } from '../jose/stepInput';

export interface PickedSkill { skill: Skill | null; reason: string }

export const NO_SKILL = 'No skill for this task.';
const MAX_REASON = 160;

/** A skill's name as offered: yours gets "(yours)" when a built-in one has the same name. */
export function skillLabel(skill: Skill): string {
  if (skill.source !== 'user') return skill.name;
  const clash = listSkills(skill.agent).some((s) => s.source === 'built_in' && s.name.toLowerCase() === skill.name.toLowerCase());
  return clash ? `${skill.name} (yours)` : skill.name;
}

function readChoice(text: string): { skill?: string; reason?: string } | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export async function pickSkill(agent: string, actionType: string, stepInput: StepInput | null, opts: { contentStep: boolean }): Promise<PickedSkill> {
  const fitting = skillsForTask(agent, actionType);
  if (!fitting.length) return { skill: null, reason: NO_SKILL };
  if (opts.contentStep) return { skill: fitting.find((s) => s.output.startsWith('content:')) || fitting[0], reason: "This step's format needs it." };
  if (fitting.length === 1) return { skill: fitting[0], reason: 'The only skill for this task.' };
  const fallback: PickedSkill = { skill: fitting.find((s) => s.source === 'built_in') || fitting[0], reason: "Matches this step's task." };
  const prompt = [
    `You are ${agentName(agent)}. Pick the skill that fits this step best.`,
    stepInput?.instruction ? `The step: ${stepInput.instruction}` : '',
    stepInput?.request ? `The request: ${stepInput.request.slice(0, 1000)}` : '',
    'Your skills:',
    ...fitting.map((s) => `- ${skillLabel(s)}: ${s.useWhen}`),
    'Answer with JSON only: {"skill": "the skill\'s name, exactly as above", "reason": "why, in one short sentence"}',
  ].filter(Boolean).join('\n');
  try {
    const reply: any = await generateAgentLlmResponse(agent, { prompt, format: 'json' });
    const choice = readChoice(String(reply?.response || ''));
    const wanted = String(choice?.skill || '').trim().toLowerCase();
    const skill = fitting.find((s) => skillLabel(s).toLowerCase() === wanted);
    if (!skill) return fallback;
    const reason = String(choice?.reason || '').replace(/\s+/g, ' ').trim().slice(0, MAX_REASON);
    return { skill, reason: reason || fallback.reason };
  } catch {
    return fallback;
  }
}
