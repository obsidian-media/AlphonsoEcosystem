// The agents' content-factory work, run by Jose (executeAssignment) for any
// assignment that carries a `contentStep`. Each agent answers with its own
// model (per-agent providers in Settings apply).
import { generateAgentLlmResponse } from '../../lib/ollama';
import { runMultiSourceResearch } from '../hectorResearchService';
import { buildStepPrompt, parseStepAnswer, CONTENT_ACTION_KEYS } from './contentStepPrompts';
import { hasOwnKey, type ContentStepPayload } from './contentTypes';

export const UNREADABLE_ANSWER = "The model's answer could not be read. Small models often cannot follow this format: choose a larger model for this agent in Settings → Connectors → Agent Providers, then Retry.";

export const NO_SEARCH_RESULTS = 'Hector found no web results for this idea. Check the internet connection, or add a Brave Search or Tavily key in Connectors, then Retry.';

/** Research steps work from a real web search, not from what a model remembers. */
const SEARCH_ACTIONS = new Set(['research_virality', 'analysis_market']);
type Sources = NonNullable<ContentStepPayload['sources']>;
const searches = new Map<string, { atMs: number; result: Promise<Sources> }>();
const SEARCH_REUSE_MS = 10 * 60 * 1000;

/** One search per research run: Hector and Nova read the same results. */
function searchOnce(payload: ContentStepPayload): Promise<Sources> {
  const query = [payload.brief.idea, ...payload.brief.platforms].join(' ').trim().slice(0, 200);
  const key = `${payload.projectId}:${query}`;
  const cached = searches.get(key);
  if (cached && Date.now() - cached.atMs < SEARCH_REUSE_MS) return cached.result;
  const result = runMultiSourceResearch(query)
    .then((r: { sources?: { url?: string; title?: string; snippet?: string }[] }) => (r?.sources || [])
      .filter((s) => s?.url)
      .slice(0, 12)
      .map((s) => ({ url: String(s.url), title: String(s.title || ''), snippet: String(s.snippet || '') })))
    .catch(() => [] as Sources);
  searches.set(key, { atMs: Date.now(), result });
  // An empty search is not kept: Retry must search again.
  result.then((sources) => { if (sources.length === 0) searches.delete(key); });
  return result;
}

/** Forget earlier searches (used by tests). */
export function clearContentSearches(): void {
  searches.clear();
}

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
  const { agent, actionType } = assignment;
  let contentStep = assignment.contentStep;
  let allowedUrls: string[] | undefined;
  if (SEARCH_ACTIONS.has(actionType)) {
    const sources = await searchOnce(contentStep);
    if (sources.length === 0) return failed(assignment, NO_SEARCH_RESULTS, '');
    contentStep = { ...contentStep, sources };
    allowedUrls = sources.map((s) => s.url);
  }
  const { system, prompt } = buildStepPrompt(contentStep, agent, actionType);
  const sessionId = `content:${contentStep.projectId}:${contentStep.step}`;
  const ask = async (text: string) => {
    const reply = await generateAgentLlmResponse(agent, { prompt: text, format: 'json', sessionId });
    return String(reply?.response || '');
  };

  let raw = '';
  try {
    raw = await ask(`${system}\n\n${prompt}`);
    let data = parseStepAnswer(actionType, raw, { allowedUrls });
    if (data === null) {
      raw = await ask(`${system}\n\n${prompt}\n\nYour last answer could not be read; return only JSON with keys ${(hasOwnKey(CONTENT_ACTION_KEYS, actionType) && CONTENT_ACTION_KEYS[actionType]) || '{}'}.`);
      data = parseStepAnswer(actionType, raw, { allowedUrls });
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
