// Outside tools (2026-10-30, owner): what each tool of a connected MCP server may do. A tool
// asks first until the user marks it "Reading only"; the server's own hints are suggestions.
// Reading tools are used by any agent during its step (`outside_read`); every other tool is a
// Marcus step (`distribution_outside_tool`) that asks first with the exact call.
import type { JoseEffect } from '../jose/joseEffects';
import { getRuntimePolicySettings } from '../policyEnforcementService';
import { canSpend } from '../jose/joseSpend';
import { fenced } from '../sentinel/fence';
import { redactText } from '../sentinel/exactChecks';
import { listServers, type McpServer, type McpToolEntry } from './mcpServers';
import { callTool } from './mcpConnection';

export const OUTSIDE_TASK = 'distribution_outside_tool';
export const PAID_ONLY_AS_STEP = 'Paid servers are used only as their own step.';
const MAX_NAMES = 8;

export const toolRef = (serverId: string, tool: string): string => `${serverId}/${tool}`;

export function parseToolRef(ref: string): { serverId: string; tool: string } | null {
  const at = String(ref || '').indexOf('/');
  if (at <= 0 || at === ref.length - 1) return null;
  return { serverId: ref.slice(0, at), tool: ref.slice(at + 1) };
}

export function findTool(ref: string): { server: McpServer; entry: McpToolEntry } | null {
  const parsed = parseToolRef(ref);
  if (!parsed) return null;
  const server = listServers().find((s) => s.id === parsed.serverId);
  const entry = server?.tools.find((t) => t.name === parsed.tool);
  return server && entry ? { server, entry } : null;
}

/** Only the user's "Reading only" mark makes a tool a reading tool. */
export function isReadingTool(entry: McpToolEntry): boolean {
  return entry.mark === 'reading_only' && !entry.off;
}

export function effectsForCall(server: McpServer, entry: McpToolEntry): JoseEffect[] {
  const effects: JoseEffect[] = isReadingTool(entry) ? ['read'] : ['publish_or_send'];
  if (!isReadingTool(entry) && (entry.mark === 'deletes' || entry.hintDestructive === true)) effects.push('delete');
  if (server.cost !== 'free') effects.push('spend');
  return effects;
}

/** Whether a server may be called now: on, signed in, and (when paid) Zero-Cost Mode off and under the cap. */
export function serverAllowed(server: McpServer): { ok: true } | { ok: false; reason: string } {
  if (!server.enabled) return { ok: false, reason: `${server.name} is switched off in Settings → Connectors.` };
  if (server.needsSignIn) return { ok: false, reason: `Sign in to ${server.name} again in Settings → Connectors.` };
  if (server.cost !== 'free') {
    if (getRuntimePolicySettings().zeroCostMode) return { ok: false, reason: `${server.name} is a paid server and Zero-Cost Mode is on.` };
    const cap = canSpend(server.pricePerCallUsd ?? 0);
    if (!cap.ok) return { ok: false, reason: cap.reason || 'This month’s spending cap is reached.' };
  }
  return { ok: true };
}

function names(list: string[]): string {
  const shown = list.slice(0, MAX_NAMES).join(', ');
  return list.length > MAX_NAMES ? `${shown} and ${list.length - MAX_NAMES} more` : shown;
}

/** One line per switched-on server for Jose's planner. */
export function outsideToolsLines(): string[] {
  return listServers()
    .filter((s) => s.enabled && s.tools.some((t) => !t.off))
    .map((s) => {
      const usable = s.tools.filter((t) => !t.off);
      const reads = usable.filter(isReadingTool).map((t) => t.name);
      const changes = usable.filter((t) => !isReadingTool(t)).map((t) => t.name);
      const parts = [
        reads.length ? `reads ${names(reads)}` : '',
        changes.length ? `changes (Marcus, ${OUTSIDE_TASK}, asks first) ${names(changes)}` : '',
      ].filter(Boolean);
      return `${s.name}: ${parts.join('; ')}`;
    });
}

/** The planner's block, or '' when no server is connected. */
export function outsideToolsForPlanner(): string {
  const lines = outsideToolsLines();
  if (!lines.length) return '';
  return [
    'Outside tools (MCP servers the user added). Reading tools are used by whichever agent needs the facts, during its step; a change is its own Marcus step with task type distribution_outside_tool:',
    ...lines.map((l) => `- ${l}`),
  ].join('\n');
}

/** Reading tools any agent may use during its step (free servers only). */
export function readingTools(): Array<{ ref: string; server: McpServer; entry: McpToolEntry }> {
  return listServers()
    .filter((s) => s.enabled && !s.needsSignIn && s.cost === 'free')
    .flatMap((s) => s.tools.filter(isReadingTool).map((entry) => ({ ref: toolRef(s.id, entry.name), server: s, entry })));
}

function inputFields(schema: Record<string, unknown>): string {
  const props = schema?.properties && typeof schema.properties === 'object' ? Object.keys(schema.properties as object) : [];
  return props.length ? ` (fields: ${props.slice(0, 12).join(', ')})` : '';
}

/** The reading tools as prompt lines for an agent choosing one. */
export function readingToolsForPrompt(): string[] {
  return readingTools().map(({ ref, entry }) => `- ${ref}: ${(entry.title || entry.description || entry.name).replace(/\s+/g, ' ').slice(0, 200)}${inputFields(entry.inputSchema)}`);
}

/** Connected servers a text names (whole words, any capitals). */
export function serversNamedIn(text: string): McpServer[] {
  const lower = String(text || '').toLowerCase();
  return listServers().filter((s) => {
    if (!s.enabled) return false;
    const name = s.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return name.length > 1 && new RegExp(`(^|[^a-z0-9])${name}([^a-z0-9]|$)`).test(lower);
  });
}

/** The `outside_read` skill tool: one reading tool call, its answer fenced and keys hidden. */
export async function runOutsideRead(args: Record<string, unknown>): Promise<{ ok: boolean; text: string }> {
  const ref = String(args.tool || '');
  const found = findTool(ref);
  if (!found) return { ok: false, text: `No outside tool called ${ref || '(none)'}.` };
  const { server, entry } = found;
  if (!isReadingTool(entry)) return { ok: false, text: `${entry.name} changes something, so it is Marcus’s step.` };
  if (server.cost !== 'free') return { ok: false, text: PAID_ONLY_AS_STEP };
  const allowed = serverAllowed(server);
  if (!allowed.ok) return { ok: false, text: (allowed as { reason: string }).reason };
  const callArgs = args.args && typeof args.args === 'object' ? (args.args as Record<string, unknown>) : {};
  const result = await callTool(server.id, entry.name, callArgs);
  if (!result.ok) return { ok: false, text: redactText(result.reason || `${server.name} didn’t answer.`) };
  return { ok: true, text: fenced(`${server.name} ${entry.name}`, redactText(result.text)) };
}
