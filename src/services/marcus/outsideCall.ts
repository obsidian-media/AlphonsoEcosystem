// Outside tools (2026-10-30, owner): every change through an outside MCP server is Marcus's
// step (`distribution_outside_tool`). It is prepared before it asks you: which tool, and its
// exact arguments, filled in by Marcus's model from the tool's own fields and checked against
// them. The approval shows that call word for word; it runs once, after the approval.
import { generateAgentLlmResponse } from '../../lib/ollama';
import { buildStepInput, stepInputText } from '../jose/stepInput';
import { requestForCommand, updateJoseStep } from '../jose/joseRequestStore';
import type { JoseEffect } from '../jose/joseEffects';
import { recordSpendUsd } from '../jose/joseSpend';
import { fenced } from '../sentinel/fence';
import { redactText } from '../sentinel/exactChecks';
import { listServers, type McpServer, type McpToolEntry } from '../mcp/mcpServers';
import { callTool } from '../mcp/mcpConnection';
import { effectsForCall, findTool, isReadingTool, OUTSIDE_TASK, serverAllowed, serversNamedIn, toolRef } from '../mcp/mcpTools';

export interface OutsideCallPreview {
  serverId: string;
  serverName: string;
  tool: string;
  toolTitle?: string;
  arguments: Record<string, unknown>;
  effects: JoseEffect[];
  costUsd?: number;
}

export type PrepareOutside =
  | { ok: true; preview: OutsideCallPreview }
  | { ok: false; outcome: 'setup' | 'failed'; reason: string };

export const NO_OUTSIDE_TOOL = 'No outside tool can do this. Add one in Settings → Connectors → Outside tools (MCP).';
export const ALREADY_DONE = 'Already done.';

interface Assignment {
  agent?: string;
  actionType?: string;
  stepId?: string;
  effects?: string[];
  needs?: string[];
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

export function isOutsideCallStep(assignment: Assignment | null | undefined): boolean {
  return String(assignment?.agent || '').toLowerCase() === 'marcus' && assignment?.actionType === OUTSIDE_TASK;
}

/** Tools Marcus may use for a change: every tool not marked "Reading only", and a paid server's reading tools. */
function candidates(): Array<{ server: McpServer; entry: McpToolEntry }> {
  return listServers()
    .filter((s) => s.enabled)
    .flatMap((s) => s.tools.filter((t) => !t.off && (!isReadingTool(t) || s.cost !== 'free')).map((entry) => ({ server: s, entry })));
}

function typeOk(value: unknown, type: unknown): boolean {
  switch (type) {
    case 'string': return typeof value === 'string';
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'integer': return Number.isInteger(value);
    case 'boolean': return typeof value === 'boolean';
    case 'array': return Array.isArray(value);
    case 'object': return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    case 'null': return value === null;
    default: return true;
  }
}

const TYPE_WORDS: Record<string, string> = { string: 'text', number: 'a number', integer: 'a whole number', boolean: 'yes or no', array: 'a list', object: 'a group of fields' };

/** What is wrong with arguments against a tool's schema (top-level fields): required and types. */
export function argumentProblems(schema: Record<string, unknown>, args: Record<string, unknown>): string[] {
  const problems: string[] = [];
  const props = (schema?.properties && typeof schema.properties === 'object' ? schema.properties : {}) as Record<string, Record<string, unknown>>;
  for (const name of Array.isArray(schema?.required) ? (schema.required as string[]) : []) {
    if (args[name] === undefined || args[name] === null || args[name] === '') problems.push(`${name} is missing`);
  }
  for (const [name, value] of Object.entries(args)) {
    const type = props[name]?.type;
    if (value === undefined || type === undefined) continue;
    const types = Array.isArray(type) ? type : [type];
    if (!types.some((t) => typeOk(value, t))) problems.push(`${name} should be ${TYPE_WORDS[String(types[0])] || String(types[0])}`);
  }
  return problems;
}

function readJson(text: string): Record<string, unknown> | null {
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

function toolLines(list: Array<{ server: McpServer; entry: McpToolEntry }>): string {
  return list
    .map(({ server, entry }) => `- ${toolRef(server.id, entry.name)} (${server.name}): ${(entry.title || entry.description || entry.name).replace(/\s+/g, ' ').slice(0, 200)}\n  fields: ${JSON.stringify(entry.inputSchema ?? {}).slice(0, 1500)}`)
    .join('\n');
}

/** Above this many characters the full tool list would overflow a local model's context, so Marcus
 * first picks a tool from one line each, then fills in only its fields (found live, 2026-10-30:
 * GitHub's server lists 46 tools). */
export const FULL_LIST_BUDGET = 6000;

function shortLines(list: Array<{ server: McpServer; entry: McpToolEntry }>): string {
  return list
    .map(({ server, entry }) => `- ${toolRef(server.id, entry.name)}: ${(entry.title || entry.description || entry.name).replace(/\s+/g, ' ').slice(0, 120)}`)
    .join('\n');
}

/**
 * The tool a pick names: its full `<server>/<tool>`, the server's display name with the tool,
 * or the tool's name alone when only one listed tool has it (any capitals). A small model
 * often leaves the server id out (found live, 2026-10-30).
 */
function pickedTool(options: Array<{ server: McpServer; entry: McpToolEntry }>, named: string) {
  const want = named.toLowerCase();
  const exact = options.find(({ server, entry }) => toolRef(server.id, entry.name).toLowerCase() === want
    || `${server.name}/${entry.name}`.toLowerCase() === want);
  if (exact) return exact;
  const tail = want.slice(want.lastIndexOf('/') + 1);
  const byName = options.filter(({ entry }) => entry.name.toLowerCase() === tail);
  return byName.length === 1 ? byName[0] : null;
}

/** The prompt's own example for "missing", which a small model copies back (found live, 2026-10-30). */
const MISSING_EXAMPLE = "what the request doesn't say";
function isPlaceholder(text: string): boolean {
  return text.trim().replace(/[’']/g, "'").replace(/[.\s]+$/, '').toLowerCase() === MISSING_EXAMPLE;
}

/** Prepares the call before the approval: the tool, its checked arguments and its effects. */
export async function prepareOutsideCall(commandId: string, assignment: Assignment, request: { text?: string }): Promise<PrepareOutside> {
  const payload = assignment.payload || {};
  const given = typeof payload.tool === 'string' ? findTool(payload.tool) : null;
  // A server the request names narrows the choice to its tools (2026-10-30).
  const all = candidates();
  const named = new Set(serversNamedIn(String(request.text || '')).map((s) => s.id));
  const preferred = all.filter((c) => named.has(c.server.id));
  const list = given ? [given] : (preferred.length ? preferred : all);
  if (!list.length) return { ok: false, outcome: 'setup', reason: NO_OUTSIDE_TOOL };

  let chosen = given;
  let args: Record<string, unknown> | null = given && payload.arguments && typeof payload.arguments === 'object' ? (payload.arguments as Record<string, unknown>) : null;
  if (!chosen || !args) {
    const input = buildStepInput(commandId, assignment as never, String(request.text || ''));
    let options = list;
    if (options.length > 1 && toolLines(options).length > FULL_LIST_BUDGET) {
      let pick: { server: McpServer; entry: McpToolEntry } | null = null;
      let unclear = '';
      for (let attempt = 0; attempt < 2 && !pick; attempt += 1) {
        const prompt = [
          'You are Marcus. You make one change through an outside tool the user connected. Pick the one tool that does what the request asks.',
          stepInputText(input),
          'Tools:',
          shortLines(options),
          unclear ? `"${unclear}" is not one of the tools. Copy one tool's name exactly as listed.` : '',
          'Answer with JSON only: {"tool": "<server>/<tool>"}.',
        ].filter(Boolean).join('\n\n');
        let answer: Record<string, unknown> | null = null;
        try {
          const reply: any = await generateAgentLlmResponse('marcus', { prompt, format: 'json' });
          answer = readJson(String(reply?.response || ''));
        } catch {
          answer = null;
        }
        const named = answer && typeof answer.tool === 'string' ? answer.tool.trim() : '';
        pick = named ? pickedTool(options, named) : null;
        unclear = named.slice(0, 120) || 'an empty answer';
      }
      if (!pick) return { ok: false, outcome: 'failed', reason: 'Marcus couldn’t tell which outside tool does this. Name the tool in your request.' };
      options = [pick];
    }
    let problems: string[] = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const prompt = [
        'You are Marcus. You make one change through an outside tool the user connected. Use only the values the request or an earlier step gives; never invent one.',
        stepInputText(input),
        'Tools:',
        toolLines(options),
        problems.length ? `Your last answer had problems: ${problems.join('; ')}. Fix them.` : '',
        'Answer with JSON only: {"tool": "<server>/<tool>", "arguments": {...exactly the tool\'s fields}}, or {"missing": "what the request doesn\'t say"}.',
      ].filter(Boolean).join('\n\n');
      let answer: Record<string, unknown> | null = null;
      try {
        const reply: any = await generateAgentLlmResponse('marcus', { prompt, format: 'json' });
        answer = readJson(String(reply?.response || ''));
      } catch {
        answer = null;
      }
      if (answer && typeof answer.missing === 'string' && isPlaceholder(answer.missing)) {
        problems = ['you copied the example text instead of answering'];
        continue;
      }
      if (answer && typeof answer.missing === 'string' && answer.missing.trim()) {
        return { ok: false, outcome: 'failed', reason: `Marcus needs to know: ${answer.missing.trim().slice(0, 300)}` };
      }
      const pick = answer && typeof answer.tool === 'string' ? options.find(({ server, entry }) => toolRef(server.id, entry.name) === answer!.tool) : null;
      const picked = pick ?? (options.length === 1 ? options[0] : null);
      const pickedArgs = answer && answer.arguments && typeof answer.arguments === 'object' ? (answer.arguments as Record<string, unknown>) : null;
      problems = !picked ? ['pick one of the tools listed'] : !pickedArgs ? ['give the arguments'] : argumentProblems(picked.entry.inputSchema, pickedArgs);
      if (!problems.length) {
        chosen = picked;
        args = pickedArgs;
        break;
      }
      chosen = picked;
    }
    if (problems.length) {
      const what = chosen ? `${chosen.server.name}’s ${chosen.entry.name}` : 'the outside tool';
      return { ok: false, outcome: 'failed', reason: `Marcus couldn’t fill in ${what}: ${problems.join('; ')}.` };
    }
  } else {
    const problems = argumentProblems(chosen.entry.inputSchema, args);
    if (problems.length) return { ok: false, outcome: 'failed', reason: `The call to ${chosen.server.name}’s ${chosen.entry.name} isn’t complete: ${problems.join('; ')}.` };
  }
  const { server, entry } = chosen!;
  const allowed = serverAllowed(server);
  if (!allowed.ok) return { ok: false, outcome: 'setup', reason: (allowed as { reason: string }).reason };
  return {
    ok: true,
    preview: {
      serverId: server.id,
      serverName: server.name,
      tool: entry.name,
      ...(entry.title ? { toolTitle: entry.title } : {}),
      arguments: args!,
      effects: effectsForCall(server, entry),
      ...(server.cost !== 'free' && typeof server.pricePerCallUsd === 'number' ? { costUsd: server.pricePerCallUsd } : {}),
    },
  };
}

function shortValue(v: unknown): string {
  const text = typeof v === 'string' ? v : JSON.stringify(v);
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}

/** The approval line: "Shop: Update price (product: Blue mug, price: 18)". */
export function describeOutsideCall(p: OutsideCallPreview): string {
  const args = Object.entries(p.arguments || {}).map(([k, v]) => `${k}: ${shortValue(v)}`).join(', ');
  const cost = p.effects.includes('spend') ? (typeof p.costUsd === 'number' ? ` (about $${p.costUsd.toFixed(2)})` : ' (cost not known)') : '';
  return `${p.serverName}: ${p.toolTitle || p.tool}${args ? ` (${args})` : ''}${cost}`;
}

/** Runs the approved call once. A refused sign-in can be carried on; anything else is not tried again. */
export async function runOutsideCall(commandId: string, stepId: string, preview: OutsideCallPreview): Promise<{ ok: boolean; text: string; reason?: string; setup?: boolean }> {
  const request = requestForCommand(commandId);
  const step: any = request?.steps.find((s) => s.stepId === stepId);
  if (step?.ranAtMs) return { ok: false, text: '', reason: ALREADY_DONE };
  if (request) updateJoseStep(request.id, stepId, { ranAtMs: Date.now() } as never);
  const result = await callTool(preview.serverId, preview.tool, preview.arguments);
  if (result.needsSignIn) {
    if (request) updateJoseStep(request.id, stepId, { ranAtMs: undefined } as never);
    return { ok: false, text: '', reason: `Sign in to ${preview.serverName} again in Settings → Connectors → Outside tools (MCP), then Carry on.`, setup: true };
  }
  if (!result.ok) return { ok: false, text: '', reason: redactText(result.reason || `${preview.serverName} didn’t do it.`) };
  if (typeof preview.costUsd === 'number') recordSpendUsd(preview.costUsd);
  return { ok: true, text: fenced(`${preview.serverName} ${preview.tool}`, redactText(result.text)) };
}
