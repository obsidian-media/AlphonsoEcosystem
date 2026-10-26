// Composio as one of Marcus's channels (agent phase 5): the send tools of the toolkits you
// switched on. A tool's content parameters always take the written text, never his model's words.
import { enabledComposioToolkits, isReadOnlyTool, listToolkitTools, type ComposioTool } from '../composioService';
import { isAllowedTarget } from './destinations';
import type { Destination } from './types';

/** Parameters that carry what is said; they take the written text. */
const CONTENT_PARAMS = new Set(['body', 'description', 'message', 'text', 'content', 'comment', 'note', 'markdown_text']);

/** The send tools (not read-only) of the toolkits you switched on. */
export async function composioSendTools(): Promise<ComposioTool[]> {
  const out: ComposioTool[] = [];
  for (const toolkit of enabledComposioToolkits()) {
    const { tools } = await listToolkitTools(toolkit);
    for (const tool of tools) if (tool.enabled !== false && !isReadOnlyTool(tool)) out.push(tool);
  }
  return out;
}

function paramNames(tool: ComposioTool): string[] {
  const props = (tool.parameters as { properties?: Record<string, unknown> })?.properties;
  return props && typeof props === 'object' ? Object.keys(props) : [];
}

/** One line per tool for Marcus's prompt. */
export function describeComposioTools(tools: ComposioTool[]): string {
  return tools.slice(0, 20).map((t) => `- composio tool ${t.name} (${t.toolkit}): ${t.description.slice(0, 120)}; arguments: ${paramNames(t).join(', ') || 'none'}`).join('\n');
}

/** Checks a Composio answer from Marcus's model; the destination, or a problem sentence. */
export function checkComposioAnswer(
  answer: { tool?: unknown; target?: unknown; arguments?: unknown },
  tools: ComposioTool[],
  request: string,
  text: string,
): { destination: Destination } | { problem: string } {
  const name = String(answer.tool || '').trim();
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { problem: `"${name || 'no tool'}" is not a send tool of a toolkit you switched on.` };
  const target = String(answer.target || '').trim();
  if (!isAllowedTarget('composio', target, request)) return { problem: `"${target || 'no recipient'}" was not named in the request.` };
  const given = answer.arguments && typeof answer.arguments === 'object' ? answer.arguments as Record<string, unknown> : {};
  const args: Record<string, unknown> = {};
  for (const key of paramNames(tool)) {
    if (CONTENT_PARAMS.has(key.toLowerCase())) args[key] = text;
    else if (key in given) args[key] = given[key];
  }
  return {
    destination: { connector: 'composio', target, kind: 'composio_action', label: `Composio, ${tool.toolkit}`, composio: { toolkit: tool.toolkit, tool: tool.name, args } },
  };
}
