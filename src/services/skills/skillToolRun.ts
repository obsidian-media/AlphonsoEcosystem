// What each skill tool does (agent roles Part B). Every tool wraps a function
// an agent already uses; none is a new connector. Tools that make or send
// something (ACTION_TOOLS) never run here: they are the step's own action,
// run after its approval. Nothing here throws: a refusal or failure is text
// the agent reads.
import { SKILL_TOOLS, ACTION_TOOLS } from './skillTools';
import { effectsNeedingApproval } from '../jose/joseEffects';
import { agentName } from '../jose/agentNames';
import type { StepInput } from '../jose/stepInput';

export interface ToolContext {
  agent: string;
  stepInput: StepInput | null;
  commandId?: string;
  workspaceRoot?: string;
}

export interface ToolResult { ok: boolean; text: string }

const MAX_TOOL_TEXT = 4000;
export const ACTION_TOOL_REFUSAL = "This tool runs as the step's own action, after its approval.";

function cut(text: string): string {
  return text.length > MAX_TOOL_TEXT ? `${text.slice(0, MAX_TOOL_TEXT)}\n(cut)` : text;
}

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Notes whose title or text shares words with the query, best first. */
function matchMemory(query: string, items: any[]): any[] {
  const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  if (!words.length) return [];
  return items
    .map((item) => {
      const hay = `${String(item?.title || '')} ${typeof item?.content === 'string' ? item.content : ''}`.toLowerCase();
      return { item, score: words.filter((w) => hay.includes(w)).length };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((row) => row.item);
}

async function run(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const input = ctx.stepInput;
  switch (name) {
    case 'read_step_output': {
      const needs = input?.needs || [];
      const wanted = str(args.stepId);
      const need = wanted ? needs.find((n) => n.stepId === wanted) : needs[0];
      if (!need) return { ok: false, text: needs.length ? `No step "${wanted}". Steps you can read: ${needs.map((n) => n.stepId).join(', ')}.` : 'No earlier step to read.' };
      return { ok: true, text: `${agentName(need.agent)}'s step (${need.stepId}):\n${need.text || '(nothing saved)'}` };
    }
    case 'read_sources': {
      const sources = [...new Set((input?.needs || []).flatMap((n) => n.sources))];
      return sources.length ? { ok: true, text: sources.join('\n') } : { ok: false, text: 'Earlier steps used no sources.' };
    }
    case 'read_memory': {
      const { listMemoryItems } = await import('../unifiedMemoryService');
      const found = matchMemory(str(args.query) || input?.request || '', listMemoryItems() || []);
      if (!found.length) return { ok: true, text: 'Memory holds nothing about this.' };
      return { ok: true, text: found.map((item) => `- ${String(item.title || 'Note')}: ${typeof item.content === 'string' ? item.content : ''}`).join('\n') };
    }
    case 'save_note': {
      const title = str(args.title) || 'Note';
      const text = str(args.text);
      if (!text) return { ok: false, text: 'A note needs text.' };
      const { addMemoryItem } = await import('../unifiedMemoryService');
      addMemoryItem({ title, content: text, agentId: ctx.agent, type: 'agent_note', tags: ['agent_note'] });
      return { ok: true, text: `Saved the note "${title}".` };
    }
    case 'web_search': {
      const query = str(args.query) || input?.instruction || input?.request || '';
      const { runMultiSourceResearch } = await import('../hectorResearchService');
      const result: any = await runMultiSourceResearch(query);
      const sources = Array.isArray(result?.sources) ? result.sources : [];
      if (!sources.length) return { ok: false, text: result?.error ? `No results: ${result.error}` : 'No results.' };
      return { ok: true, text: sources.slice(0, 8).map((s: any) => `- ${s.title || s.url} (${s.url})${s.snippet ? `: ${s.snippet}` : ''}`).join('\n') };
    }
    case 'fetch_source': {
      const url = str(args.url);
      if (!/^https:\/\//i.test(url)) return { ok: false, text: 'fetch_source needs an https address.' };
      const { fetchUrlContent } = await import('../browserAutomationService');
      const page: any = await fetchUrlContent(url);
      const text = typeof page === 'string' ? page : str(page?.content) || str(page?.text);
      return text ? { ok: true, text } : { ok: false, text: 'The page had no text.' };
    }
    case 'stock_search': {
      const { searchStockClips } = await import('../connectors/stockFootageConnector');
      const clips = await searchStockClips(str(args.query) || input?.instruction || '', {
        orientation: args.orientation === 'portrait' ? 'portrait' : 'landscape',
        minSeconds: Number(args.minSeconds) > 0 ? Number(args.minSeconds) : 3,
      });
      if (!clips.length) return { ok: false, text: 'No clips found (or no stock source is set up).' };
      return { ok: true, text: clips.slice(0, 8).map((c) => `- ${c.source} ${c.id}: ${c.durationSec}s, ${c.width}x${c.height}, ${c.pageUrl}`).join('\n') };
    }
    case 'read_project_file': {
      if (!ctx.workspaceRoot) return { ok: false, text: 'No project folder is set.' };
      const relativePath = str(args.path);
      if (!relativePath) return { ok: false, text: 'read_project_file needs a path.' };
      const { readWorkspaceFile } = await import('../workspaceFileService');
      return { ok: true, text: await readWorkspaceFile({ workspaceRoot: ctx.workspaceRoot, relativePath }) };
    }
    case 'organise_memory': {
      const { listMemoryItems } = await import('../unifiedMemoryService');
      const byTitle = new Map<string, number>();
      for (const item of listMemoryItems() || []) {
        const key = String(item?.title || '').trim().toLowerCase();
        if (key) byTitle.set(key, (byTitle.get(key) || 0) + 1);
      }
      const dupes = [...byTitle].filter(([, n]) => n > 1);
      return { ok: true, text: dupes.length ? dupes.map(([t, n]) => `- "${t}": ${n} notes`).join('\n') : 'No notes share a title.' };
    }
    default:
      return { ok: false, text: `Unknown tool: ${name}.` };
  }
}

export async function runSkillTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const tool = SKILL_TOOLS[name];
  if (!tool) return { ok: false, text: `Unknown tool: ${name}.` };
  if (!tool.agents.includes(ctx.agent)) return { ok: false, text: `${agentName(ctx.agent)} can't use ${name}.` };
  if (ACTION_TOOLS.has(name) || effectsNeedingApproval(tool.effects).length > 0) return { ok: false, text: ACTION_TOOL_REFUSAL };
  try {
    const result = await run(name, args && typeof args === 'object' ? args : {}, ctx);
    return { ok: result.ok, text: cut(result.text) };
  } catch (error) {
    return { ok: false, text: `${name} failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}
