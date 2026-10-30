// What a skill's tools find before the agent does its step (agent roles Part B).
// A small model runs the skill's steps in order; a larger one calls the tools
// itself, at most 5 times, each result going back to it. Only tools the skill
// lists are offered, and runSkillTool refuses anything that needs approval.
import { generateAgentLlmResponse } from '../../lib/ollama';
import { fenced, UNTRUSTED_RULE } from '../sentinel/fence';
import { agentName } from '../jose/agentNames';
import { stepInputText } from '../jose/stepInput';
import { ACTION_TOOLS, SKILL_TOOLS } from './skillTools';
import { runSkillTool, type ToolContext } from './skillToolRun';
import { readingTools, readingToolsForPrompt, serversNamedIn } from '../mcp/mcpTools';
import type { Skill } from './skillFile';

export interface GatheredResult { tool: string; ok: boolean; text: string }
export const MAX_TOOL_CALLS = 5;

function argsForStep(ctx: ToolContext): Record<string, unknown> {
  const input = ctx.stepInput;
  const args: Record<string, unknown> = {};
  if (input?.needs?.[0]) args.stepId = input.needs[0].stepId;
  args.query = input?.instruction || input?.request || '';
  return args;
}

function readCall(text: string): { tool?: string; args?: Record<string, unknown>; done?: boolean } | null {
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

const OUTSIDE_CALL = 'Call it as {"tool": "outside_read", "args": {"tool": "<server>/<tool>", "args": {...its fields}}}. Reading tools:';

/**
 * Outside reading tools (2026-10-30) are offered to every agent: always to a model that calls
 * tools itself, and to a small model only when the step names a connected server, with one
 * question which tool to read (an extra model call nothing else needs).
 */
async function pickOutsideRead(skill: Skill, ctx: ToolContext): Promise<GatheredResult | null> {
  const prompt = [
    `You are ${agentName(skill.agent)}. Your step may need facts from an outside tool the user connected.`,
    ctx.stepInput?.instruction ? `The step: ${ctx.stepInput.instruction}` : '',
    ctx.stepInput?.request ? `The request: ${ctx.stepInput.request.slice(0, 2000)}` : '',
    'Reading tools:',
    ...readingToolsForPrompt(),
    'Answer with JSON only: {"tool": "<server>/<tool>", "args": {...its fields}} to read one, or {"none": true} if none of them helps.',
  ].filter(Boolean).join('\n\n');
  let answer: Record<string, unknown> | null = null;
  try {
    const reply: any = await generateAgentLlmResponse(skill.agent, { prompt, format: 'json' });
    answer = readCall(String(reply?.response || ''));
  } catch {
    answer = null;
  }
  if (!answer || answer.none || typeof answer.tool !== 'string') return null;
  const args = { tool: answer.tool, args: answer.args && typeof answer.args === 'object' ? answer.args : {} };
  return { tool: 'outside_read', ...(await runSkillTool('outside_read', args, ctx)) };
}

export async function gatherForSkill(skill: Skill, ctx: ToolContext, opts: { ownCalls: boolean; maxCalls?: number }): Promise<{ results: GatheredResult[]; mode: 'fixed' | 'own' }> {
  const callable = skill.tools.filter((t) => !ACTION_TOOLS.has(t));
  const results: GatheredResult[] = [];
  const outside = readingTools().length > 0 && !callable.includes('outside_read');
  if (!opts.ownCalls) {
    for (const name of skill.steps.filter((t) => callable.includes(t))) {
      const result = await runSkillTool(name, argsForStep(ctx), ctx);
      results.push({ tool: name, ...result });
    }
    if (outside && serversNamedIn(`${ctx.stepInput?.request || ''}\n${ctx.stepInput?.instruction || ''}`).length) {
      const read = await pickOutsideRead(skill, ctx);
      if (read) results.push(read);
    }
    return { results, mode: 'fixed' };
  }
  if (outside) callable.push('outside_read');
  if (!callable.length) return { results, mode: 'own' };
  const max = opts.maxCalls ?? MAX_TOOL_CALLS;
  const context = ctx.stepInput ? stepInputText(ctx.stepInput) : '';
  for (let call = 0; call < max; call += 1) {
    const prompt = [
      `You are ${agentName(skill.agent)}, using your skill "${skill.name}".`,
      skill.instructions,
      ctx.stepInput?.instruction ? `The step: ${ctx.stepInput.instruction}` : '',
      ctx.stepInput?.request ? `The request: ${ctx.stepInput.request.slice(0, 2000)}` : '',
      context,
      'Tools you can call:',
      ...callable.map((t) => `- ${t}: ${SKILL_TOOLS[t].label}${t === 'outside_read' ? ` ${OUTSIDE_CALL}\n${readingToolsForPrompt().join('\n')}` : ''}`),
      // Tool results are page text: marked untrusted (agent phase 4).
      results.length ? `What your tools found so far:\n${UNTRUSTED_RULE}\n${fenced('TOOL RESULTS', results.map((r) => `${r.tool}: ${r.text}`).join('\n\n'))}` : '',
      `You may call ${max - call} more tool(s). Answer with JSON only: {"tool": "a tool name", "args": {"query": "...", "stepId": "...", "url": "...", "path": "..."}} to call one, or {"done": true} when you have what you need.`,
    ].filter(Boolean).join('\n\n');
    let answer: ReturnType<typeof readCall> = null;
    try {
      const reply: any = await generateAgentLlmResponse(skill.agent, { prompt, format: 'json' });
      answer = readCall(String(reply?.response || ''));
    } catch {
      answer = null;
    }
    if (!answer || answer.done || typeof answer.tool !== 'string') break;
    const name = answer.tool.trim();
    if (!callable.includes(name)) {
      results.push({ tool: name, ok: false, text: `${name} is not one of this skill's tools.` });
      continue;
    }
    const args = answer.args && typeof answer.args === 'object' ? answer.args : {};
    results.push({ tool: name, ...(await runSkillTool(name, args, ctx)) });
  }
  return { results, mode: 'own' };
}
