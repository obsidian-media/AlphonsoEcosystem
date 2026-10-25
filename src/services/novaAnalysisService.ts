// Nova's step (agent phase 2, owner 2026-10-25): she judges what she was given (the
// request, and the steps she needs, usually Hector's findings) and answers with a ranked
// verdict from her model. No keyword scores and no fallback numbers: an unreadable answer
// fails the step and says why. With nothing to judge she asks for research through the
// help line, once. Each verdict is saved (for /nova and Settings) with one memory note.
import type { StepInput } from './jose/stepInput';
import { TRUST_STATES } from './trustModel';
import { generateAgentLlmResponse } from '../lib/ollama';
import { pushMemoryItem } from './memoryService';
import { resolveSecureSessionId } from './connectors/hermesAgentConnector';
import { findHelpRequest } from './jose/joseHelp';
import { findRequestByPacket } from './jose/joseRequestStore';
import { missingOptions, namedOptions, novaVerdictPrompt, parseNovaVerdict, verdictText, withNotJudged, type NovaVerdict } from './nova/novaVerdict';
import { saveVerdict } from './nova/novaVerdicts';

export const NOVA_NO_VERDICT = "Nova's model didn't give a readable verdict.";

interface Assignment {
  commandId?: string;
  packetId?: string;
  stepId?: string;
  actionType?: string;
  helpRound?: number;
  [key: string]: unknown;
}

export interface NovaResult {
  summary: string;
  resultState: 'completed' | 'failed';
  resultUrl: null;
  artifacts: [];
  sources: string[];
  contractAction: string;
  schema: NovaVerdict | null;
  failureReason?: string;
}

function emptyInput(request: string): StepInput {
  return { instruction: '', request, needs: [], others: [], memory: '', review: null };
}

/** The request's own words, for what a verdict was about. */
function aboutOf(request: string): string {
  const line = String(request || '').replace(/^\s*\/jose\s+/i, '').split('\n')[0].trim();
  if (line.length <= 80) return line;
  const cut = line.slice(0, 80);
  return cut.slice(0, cut.lastIndexOf(' ') > 48 ? cut.lastIndexOf(' ') : 80).trim();
}

async function ask(prompt: string, assignment: Assignment | null, signal?: AbortSignal): Promise<string> {
  try {
    // No model or address: the model Jose picked for this step (or the agent's own) is used.
    const reply = await generateAgentLlmResponse('nova', {
      prompt,
      format: 'json',
      signal,
      sessionId: assignment?.packetId ? resolveSecureSessionId(assignment.packetId) : undefined,
    } as never) as { response?: string } | null;
    return String(reply?.response || '');
  } catch {
    return '';
  }
}

export async function runNovaAnalysis(
  commandText: string,
  assignment: Assignment | null,
  _priorOutputs: unknown,
  options: { stepInput?: StepInput | null; signal?: AbortSignal } = {},
): Promise<NovaResult> {
  const input = options.stepInput || emptyInput(String(commandText || ''));
  const contractAction = String(assignment?.actionType || 'opportunity_analysis');
  const usableNeeds = input.needs.filter((n) => !(n as { failed?: boolean }).failed && n.text.trim() && n.text.trim() !== '(nothing saved)');
  const named = namedOptions(input.request);
  const nothingToJudge = !usableNeeds.length && !input.review && !named.length;
  const sourceCount = Math.max(0, ...usableNeeds.map((n) => n.sources.length));
  const sources = usableNeeds.flatMap((n) => n.sources);
  const base = { resultUrl: null, artifacts: [] as [], sources, contractAction };

  let leftOut: string[] = [];
  let verdict: NovaVerdict | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const text = await ask(novaVerdictPrompt(input, { sourceCount, mayAskForHelp: nothingToJudge && !assignment?.helpRound, leftOut }), assignment, options.signal);
    // Nothing to judge: she asks for research, and Jose's help loop adds a Hector step.
    const help = nothingToJudge && !assignment?.helpRound ? findHelpRequest({ summary: text }) : null;
    if (help) return { ...base, summary: `HELP: ${help}`, resultState: 'completed', schema: null };
    const parsed = parseNovaVerdict(text, { sourceCount, fromRequestOnly: !usableNeeds.length && !input.review });
    if (!parsed) continue;
    verdict = parsed;
    leftOut = missingOptions(parsed, named);
    if (!leftOut.length) break;
  }
  if (!verdict) return { ...base, summary: NOVA_NO_VERDICT, resultState: 'failed', schema: null, failureReason: NOVA_NO_VERDICT };
  if (leftOut.length) verdict = withNotJudged(verdict, leftOut);

  const summary = verdictText(verdict);
  const about = aboutOf(input.request);
  const request = assignment?.packetId ? findRequestByPacket(assignment.packetId) : null;
  saveVerdict({ about, doFirst: verdict.doFirst, requestId: request?.id || null, commandId: assignment?.commandId || null, atMs: Date.now(), text: summary });
  pushMemoryItem({
    title: `Nova: ${about} — do first: ${verdict.doFirst}`,
    category: 'research_memory',
    content: { verdict },
    source: 'nova-analysis-service',
    sourceAgent: 'nova',
    confidence: TRUST_STATES.INFERRED,
    verificationState: TRUST_STATES.INFERRED,
  });
  return { ...base, summary, resultState: 'completed', schema: verdict };
}
