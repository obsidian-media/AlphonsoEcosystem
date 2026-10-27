// Echo's steps (agent phase 7): save what was decided, answer from it, forget on request.
// His model decides what is a decision and what it replaces; nothing is made up when it fails.
import { asksToRemember } from './memoryIntents';
import { generateAgentLlmResponse } from '../../lib/ollama';
import { extractJsonObject } from '../../lib/jsonUtils.js';
import { resolveSecureSessionId } from '../connectors/hermesAgentConnector';
import { skillSection, type StepInput } from '../jose/stepInput';
import { AGENT_PERMISSION_TABLE } from '../jose/agentPermissionTable';
import { addDecision, forgetDecision, getDecision, ECHO_LIMITS, type Decision, type DecisionKind, type Surface } from './decisions';
import { searchDecisions, indexDecision, decisionLine } from './recall';

export const NOTHING_TO_REMEMBER = 'Nothing to remember here.';
export const COULDNT_SAVE = (reason: string) => `Echo couldn't save what was decided: ${reason}`;
export const NOTHING_SAVED_ABOUT = (what: string) => `I have nothing saved about "${what}".`;
export const WHICH_TO_FORGET = 'Which one should I forget?';
const UNREADABLE = "his model didn't give an answer he could read.";
const KINDS: DecisionKind[] = ['decision', 'preference', 'instruction', 'rejection'];

export interface EchoCtx {
  commandId?: string;
  requestId?: string;
  surface: Surface;
  packetId?: string;
  /** The request step, for a pick you made (`forgetId`) or a cleanup set (`cleanupSetId`). */
  requestStep?: any;
}

export interface EchoStepResult {
  summary: string;
  resultState: 'completed' | 'failed' | 'setup_required';
  resultUrl: null;
  artifacts: Array<{ type: string; id: string }>;
  sources: string[];
  contractAction: string;
  stepFields?: Record<string, unknown>;
}

async function ask(prompt: string, packetId?: string): Promise<string> {
  const reply: any = await generateAgentLlmResponse('echo', {
    prompt,
    format: 'json',
    ...(packetId ? { sessionId: resolveSecureSessionId(packetId) } : {}),
  } as never);
  return String(reply?.response || '');
}

const result = (summary: string, state: EchoStepResult['resultState'], actionType: string, ids: string[] = [], stepFields?: Record<string, unknown>): EchoStepResult => ({
  summary, resultState: state, resultUrl: null, artifacts: ids.map((id) => ({ type: 'echo_decision', id })), sources: [], contractAction: actionType,
  ...(stepFields ? { stepFields } : {}),
});

/** What a preference may apply to: agent ids and the task-type prefixes they own. */
function appliesToChoices(): string {
  return Object.entries(AGENT_PERMISSION_TABLE).map(([agent, p]) => `${agent} (${p.taskTypes.join(', ')})`).join('; ');
}

export function echoSavePrompt(input: { request: string; work: string; changeLog?: string[] }, known: Decision[], skill = '', problem = ''): string {
  return [
    skill,
    'You are Echo. You keep the decisions of the whole ecosystem so every agent can follow them later.',
    'From the request and the work below, write down only what was actually decided or said: something settled ("decision"), how the user wants things done ("preference"), something the user told an agent to remember ("instruction"), or something the user turned down ("rejection"). Never invent a decision; questions, drafts and step chatter are not decisions. When nothing was decided, answer {"decisions": []}.',
    `Request: ${input.request}`,
    input.work ? `The work:\n${input.work}` : '',
    input.changeLog?.length ? `What the user did along the way:\n${input.changeLog.join('\n')}` : '',
    known.length ? `Decisions already saved (id: text):\n${known.map((d) => `${d.id}: ${d.text}`).join('\n')}\nWhen a new decision changes one of these, set "replaces" to its id. Do not save one that is already there.` : '',
    `For a preference, "appliesTo" lists who or what work it is for: agent ids or their task-type prefixes from: ${appliesToChoices()}; or ["all"].`,
    problem,
    'Answer with JSON only: {"decisions": [{"kind": "decision" | "preference" | "instruction" | "rejection", "text": "one plain sentence", "why": "the reason, if one was given", "topics": ["two or three words to find it again"], "appliesTo": [], "replaces": "id or omit"}]}',
  ].filter(Boolean).join('\n\n');
}

function readDecisions(raw: string): Array<Record<string, any>> | null {
  const data: any = extractJsonObject(raw);
  if (!data || !Array.isArray(data.decisions)) return null;
  return data.decisions.filter((d: any) => d && KINDS.includes(d.kind) && typeof d.text === 'string' && d.text.trim());
}

const flat = (text: string) => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}$]+/gu, ' ').trim();
/** A piece of work an agent wrote, copied as a "decision" (found in the real app: an email saved as one). */
const COPY_MIN_CHARS = 60;
const copiesWork = (text: string, work: string, request: string) => {
  const t = flat(text);
  return t.length >= COPY_MIN_CHARS && flat(work).includes(t) && !flat(request).includes(t);
};
/** "Remember that our launch …" → "Our launch …". */
export function withoutRememberWords(text: string): string {
  const t = String(text || '').trim().replace(/^(?:\/jose\s+)?(?:please\s+)?(?:remember|keep in mind|don'?t forget)(?:\s+that)?[,:]?\s+/i, '');
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}
const ASKED_TO_REMEMBER = 'The user asked you to remember something: save it as a decision, preference or instruction. When it changes a decision already saved, set "replaces" to its id.';

/** Echo's model writes down what was decided; each is saved and indexed. */
export async function extractDecisions(input: {
  request: string; work: string; changeLog?: string[]; surface: Surface; requestId?: string; stepIds?: string[]; sources?: string[]; by?: string; packetId?: string; skill?: string;
}): Promise<{ ok: true; saved: Decision[] } | { ok: false; reason: string }> {
  const known = await searchDecisions(`${input.request} ${input.work}`, { limit: ECHO_LIMITS.shownToModel });
  const shown = new Set(known.map((d) => d.id));
  const asked = asksToRemember(input.request);
  let problem = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let raw = '';
    try {
      raw = await ask(echoSavePrompt(input, known, input.skill, problem), input.packetId);
    } catch (error) {
      return { ok: false, reason: String((error as Error)?.message || error) };
    }
    const read = readDecisions(raw);
    if (!read) { problem = 'Your last answer could not be read as the JSON asked for.'; continue; }
    const already = new Set(known.filter((k) => k.status === 'active').map((k) => flat(k.text)));
    const found = read
      .map((d): Record<string, any> => ({ ...d, text: withoutRememberWords(d.text) }))
      .filter((d) => d.text && !copiesWork(d.text, input.work, input.request) && !already.has(flat(d.text)));
    if (!found.length && asked) {
      if (attempt === 0) { problem = ASKED_TO_REMEMBER; continue; }
      // You said to remember it: keep your own words rather than nothing.
      found.push({ kind: 'instruction', text: withoutRememberWords(input.request), topics: [] });
    }
    const saved = found.map((d) => {
      const decision = addDecision({
        kind: d.kind,
        text: d.text,
        ...(typeof d.why === 'string' && d.why.trim() ? { why: d.why } : {}),
        topics: Array.isArray(d.topics) ? d.topics.filter((t: unknown) => typeof t === 'string').slice(0, 5) : [],
        ...(d.kind === 'preference' && Array.isArray(d.appliesTo) && d.appliesTo.length ? { appliesTo: d.appliesTo.map(String) } : d.kind === 'preference' ? { appliesTo: ['all'] } : {}),
        ...(typeof d.replaces === 'string' && shown.has(d.replaces) ? { replaces: d.replaces } : {}),
        source: {
          surface: input.surface,
          ...(input.requestId ? { requestId: input.requestId } : {}),
          ...(input.stepIds?.length ? { stepIds: input.stepIds } : {}),
          ...(input.sources?.length ? { sources: input.sources } : {}),
          by: input.by || (input.work && !asked ? 'echo' : 'you'),
        },
      });
      indexDecision(decision);
      return decision;
    });
    return { ok: true, saved };
  }
  return { ok: false, reason: UNREADABLE };
}

const workOf = (input: StepInput | null): string => (input?.needs || []).filter((n) => !n.failed).map((n) => `[${n.agent}] ${n.text}`).join('\n\n');
const withoutJose = (text: unknown): string => String(text || '').replace(/^\s*\/jose\s+/i, '').trim();
const askedText = (input: StepInput | null): string => [withoutJose(input?.request), input?.instruction].filter(Boolean).join('\n');

async function save(assignment: any, input: StepInput | null, ctx: EchoCtx): Promise<EchoStepResult> {
  const actionType = String(assignment?.actionType || 'memory_preservation');
  const out = await extractDecisions({
    request: askedText(input), work: workOf(input), surface: ctx.surface, requestId: ctx.requestId,
    stepIds: (input?.needs || []).map((n) => n.stepId), sources: (input?.needs || []).flatMap((n) => n.sources || []),
    packetId: ctx.packetId, skill: skillSection(input),
  });
  if (out.ok === false) return result(COULDNT_SAVE(out.reason), 'failed', actionType);
  if (!out.saved.length) return result(NOTHING_TO_REMEMBER, 'completed', actionType);
  return result(out.saved.map((d) => `Remembered: ${d.text}`).join('\n'), 'completed', actionType, out.saved.map((d) => d.id));
}

function historyLine(d: Decision): string {
  const replacedBy = d.replacedBy ? getDecision(d.replacedBy) : null;
  return `${decisionLine(d)}${d.status === 'replaced' && replacedBy ? ` (replaced by: ${replacedBy.text})` : d.status === 'forgotten' ? ' (forgotten)' : ''}`;
}

async function recall(assignment: any, input: StepInput | null, ctx: EchoCtx): Promise<EchoStepResult> {
  const actionType = String(assignment?.actionType || 'memory_recall');
  const question = withoutJose(input?.request || input?.instruction);
  const found = (await searchDecisions(question, { limit: ECHO_LIMITS.recallMax, status: 'all' })).filter((d) => d.status !== 'forgotten');
  if (!found.length) return result(NOTHING_SAVED_ABOUT(question.replace(/[?.!]+$/, '')), 'completed', actionType);
  const records = found.map(historyLine).join('\n');
  try {
    const reply: any = await generateAgentLlmResponse('echo', {
      prompt: [skillSection(input), 'You are Echo. Answer the question only from the saved decisions below, each point with its date and where it was decided. When a decision was replaced, say what it was and what replaced it. Say plainly what the records do not cover. Answer in plain text.', `Saved decisions:\n${records}`, `Question: ${question}`].filter(Boolean).join('\n\n'),
      ...(ctx.packetId ? { sessionId: resolveSecureSessionId(ctx.packetId) } : {}),
    } as never);
    const answer = String(reply?.response || '').trim();
    if (answer) return result(answer, 'completed', actionType, found.map((d) => d.id));
  } catch { /* the records below are the answer then */ }
  return result(`Here is what I have saved:\n${records}`, 'completed', actionType, found.map((d) => d.id));
}

async function forget(assignment: any, input: StepInput | null, ctx: EchoCtx): Promise<EchoStepResult> {
  const actionType = String(assignment?.actionType || 'memory_forget');
  const picked = ctx.requestStep?.forgetId ? getDecision(String(ctx.requestStep.forgetId)) : null;
  if (picked) {
    forgetDecision(picked.id);
    return result(`Forgot: ${picked.text}`, 'completed', actionType, [picked.id]);
  }
  const asked = askedText(input);
  const candidates = await searchDecisions(asked, { limit: 6 });
  if (!candidates.length) return result(NOTHING_SAVED_ABOUT(withoutJose(input?.request).replace(/[?.!]+$/, '')), 'completed', actionType);
  let ids: string[] = [];
  let unclear = true;
  try {
    const data: any = extractJsonObject(await ask([
      'You are Echo. The user asked you to forget something. Which of these saved decisions do they mean?',
      `Saved decisions (id: text):\n${candidates.map((d) => `${d.id}: ${d.text}`).join('\n')}`,
      `Request: ${asked}`,
      'Answer with JSON only: {"forget": ["ids they clearly mean"], "unclear": true when it could be more than one of them}',
    ].join('\n\n'), ctx.packetId));
    const known = new Set(candidates.map((d) => d.id));
    ids = (Array.isArray(data?.forget) ? data.forget : []).map(String).filter((id: string) => known.has(id));
    unclear = data?.unclear === true || !ids.length;
  } catch { /* unclear: you pick */ }
  if (!unclear) {
    const gone = ids.map((id) => getDecision(id)!).filter(Boolean);
    gone.forEach((d) => forgetDecision(d.id));
    return result(gone.map((d) => `Forgot: ${d.text}`).join('\n'), 'completed', actionType, gone.map((d) => d.id));
  }
  // Unclear: every possible match is offered, the ones his model named first (found in the real app:
  // he named one and the step offered only that one).
  const choices = [...candidates.filter((d) => ids.includes(d.id)), ...candidates.filter((d) => !ids.includes(d.id))].map((d) => ({ id: d.id, text: d.text }));
  return result(WHICH_TO_FORGET, 'setup_required', actionType, [], { decisionChoices: choices });
}

/** Echo's step: recall, forget, or save, by its task type. */
export async function runEchoStep(assignment: any, input: StepInput | null, ctx: EchoCtx): Promise<EchoStepResult> {
  const type = String(assignment?.actionType || '');
  if (type === 'memory_recall') return recall(assignment, input, ctx);
  if (type === 'memory_forget') return forget(assignment, input, ctx);
  if (type === 'memory_cleanup' || type === 'knowledge_curation') {
    const { proposeCleanup } = await import('./cleanup');
    return proposeCleanup(assignment, ctx);
  }
  return save(assignment, input, ctx);
}
