// A skill may give its agent only work it owns and tools it may use (agent
// roles Part B). Built-in skills are checked by a test; your own skills on
// save and on load. Every problem is a plain sentence; nothing is fixed silently.
import { AGENT_PERMISSION_TABLE, isEffectAllowed, ownerOf } from '../jose/agentPermissionTable';
import { agentName } from '../jose/agentNames';
import { CONTENT_ACTION_KEYS } from '../contentFactory/contentStepPrompts';
import { SKILL_TOOLS } from './skillTools';
import type { Skill } from './skillFile';

/** Output shapes a skill can name: plain text, a review with a verdict, or a content step's JSON. */
export function isKnownOutput(output: string): boolean {
  if (output === 'text' || output === 'review_with_verdict') return true;
  return output.startsWith('content:') && Object.prototype.hasOwnProperty.call(CONTENT_ACTION_KEYS, output.slice('content:'.length));
}

export function checkSkill(skill: Skill): string[] {
  const agent = skill.agent;
  if (!AGENT_PERMISSION_TABLE[agent]) return [`There is no agent called ${agent}.`];
  if (agent === 'jose') return ['Jose has no skills: he plans.'];
  const problems: string[] = [];
  for (const task of skill.taskTypes) {
    const owner = ownerOf(task);
    if (!owner) problems.push(`No agent owns ${task}.`);
    else if (owner !== agent) problems.push(`${task} is ${agentName(owner)}'s work, not ${agentName(agent)}'s.`);
  }
  for (const name of skill.tools) {
    const tool = SKILL_TOOLS[name];
    if (!tool) { problems.push(`Unknown tool: ${name}.`); continue; }
    if (!tool.agents.includes(agent)) { problems.push(`${agentName(agent)} can't use ${name}.`); continue; }
    for (const effect of tool.effects) {
      if (!isEffectAllowed(agent, effect)) problems.push(`${name} needs ${effect}, which ${agentName(agent)} may not do.`);
    }
  }
  for (const step of skill.steps) {
    if (!skill.tools.includes(step)) problems.push(`The step ${step} is not one of this skill's tools.`);
  }
  if (!isKnownOutput(skill.output)) problems.push(`Unknown output: ${skill.output}.`);
  return problems;
}
