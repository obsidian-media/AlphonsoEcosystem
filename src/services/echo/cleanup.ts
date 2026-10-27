// Echo's cleanup (agent phase 7): he proposes merges, replacements and drops, and notes worth
// keeping as decisions; nothing changes until you apply what you tick. The step waits with the
// proposals (on the board and Telegram) and reports what you chose when it is carried on.
import { generateAgentLlmResponse } from '../../lib/ollama';
import { extractJsonObject } from '../../lib/jsonUtils.js';
import { resolveSecureSessionId } from '../connectors/hermesAgentConnector';
import { listMemoryItems } from '../unifiedMemoryService';
import { addDecision, forgetDecision, listDecisions, replaceWith, ECHO_LIMITS } from './decisions';
import type { EchoCtx, EchoStepResult } from './echoSteps';
import { finishCleanup, getCleanup, saveCleanupSet, type CleanupProposal } from './cleanupStore';

export { getCleanup, openCleanup, saveCleanupSet, CLEANUP_KEY, type CleanupProposal, type CleanupSet } from './cleanupStore';

const NOTES_REVIEWED_KEY = 'alphonso_echo_notes_reviewed_v1';
export const ECHO_CLEANUP_LABEL = 'Steps set by Echo.';
const KINDS = ['merge', 'replace', 'contradiction', 'drop', 'promote'];
/** The answer format's own hints: a small model sometimes copies one as the text (found in the real app). */
const TEXT_HINT = 'for merge and promote';
const KEEP_HINT = 'for replace and contradiction';
const REASON_HINT = 'one short sentence';
const isHint = (value: unknown) => [TEXT_HINT, KEEP_HINT, REASON_HINT, 'ids from above'].includes(String(value || '').trim().toLowerCase());

const notesReviewed = () => { try { return localStorage.getItem(NOTES_REVIEWED_KEY) === '1'; } catch { return true; } };

function oldNotes(): Array<{ id: string; text: string }> {
  if (notesReviewed()) return [];
  return (listMemoryItems() || [])
    .filter((m: any) => m?.id && (m.title || m.content))
    .slice(-ECHO_LIMITS.cleanupNotes)
    .map((m: any) => ({ id: `note:${m.id}`, text: `${String(m.title || '')}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')}`.slice(0, 300) }));
}

const result = (summary: string, state: EchoStepResult['resultState'], actionType: string, stepFields?: Record<string, unknown>): EchoStepResult => ({
  summary, resultState: state, resultUrl: null, artifacts: [], sources: [], contractAction: actionType, ...(stepFields ? { stepFields } : {}),
});

/** Echo's cleanup step: propose and wait, or report what you chose. */
export async function proposeCleanup(assignment: any, ctx: EchoCtx): Promise<EchoStepResult> {
  const actionType = String(assignment?.actionType || 'memory_cleanup');
  const asked = ctx.requestStep?.cleanupSetId ? getCleanup(String(ctx.requestStep.cleanupSetId)) : null;
  if (asked?.status === 'applied') return result(`Applied ${asked.applied ?? 0} changes to memory.`, 'completed', actionType);
  if (asked?.status === 'dismissed') return result('Left memory as it is.', 'completed', actionType);
  if (asked?.status === 'open') return result(`Echo proposes ${asked.proposals.length} changes to memory: tick the ones to apply.`, 'setup_required', actionType, { cleanupSetId: asked.id });

  const decisions = listDecisions().slice(0, ECHO_LIMITS.cleanupDecisions);
  const notes = oldNotes();
  if (!decisions.length && !notes.length) return result('Memory looks tidy.', 'completed', actionType);
  const shown = new Set([...decisions.map((d) => d.id), ...notes.map((n) => n.id)]);
  let proposals: CleanupProposal[] = [];
  try {
    const reply: any = await generateAgentLlmResponse('echo', {
      prompt: [
        'You are Echo. Tidy the saved decisions: find ones that say the same thing (merge, with one text), one that a later one replaced (replace: keep is the one that stands), ones that contradict each other (contradiction: keep is the one that stands), stale ones nobody needs (drop), and old notes that record a real decision (promote, with its text). Propose nothing when memory is tidy. You change nothing: the user applies what they tick.',
        decisions.length ? `Decisions (id: text):\n${decisions.map((d) => `${d.id}: ${d.text}`).join('\n')}` : '',
        notes.length ? `Old notes (id: text):\n${notes.map((n) => `${n.id}: ${n.text}`).join('\n')}` : '',
        `Answer with JSON only: {"proposals": [{"kind": "merge" | "replace" | "contradiction" | "drop" | "promote", "ids": ["ids from above"], "text": "${TEXT_HINT}", "keep": "${KEEP_HINT}", "reason": "${REASON_HINT}"}]}`,
      ].filter(Boolean).join('\n\n'),
      format: 'json',
      ...(ctx.packetId ? { sessionId: resolveSecureSessionId(ctx.packetId) } : {}),
    } as never);
    const data: any = extractJsonObject(String(reply?.response || ''));
    proposals = (Array.isArray(data?.proposals) ? data.proposals : [])
      .filter((p: any) => p && KINDS.includes(p.kind) && Array.isArray(p.ids) && p.ids.length && p.ids.every((id: unknown) => shown.has(String(id))))
      .filter((p: any) => !isHint(p.text) && !isHint(p.keep))
      .filter((p: any) => (p.kind !== 'merge' && p.kind !== 'promote') || (typeof p.text === 'string' && p.text.trim()))
      .filter((p: any) => (p.kind !== 'replace' && p.kind !== 'contradiction') || shown.has(String(p.keep)))
      .map((p: any, i: number) => ({ id: `p${i}`, kind: p.kind, ids: p.ids.map(String), ...(p.text ? { text: String(p.text) } : {}), ...(p.keep ? { keep: String(p.keep) } : {}), reason: String(p.reason || '') }));
  } catch (error) {
    return result(`Echo couldn't look over memory: ${String((error as Error)?.message || error)}`, 'failed', actionType);
  }
  if (!proposals.length) {
    if (notes.length) { try { localStorage.setItem(NOTES_REVIEWED_KEY, '1'); } catch { /* storage full */ } }
    return result('Memory looks tidy.', 'completed', actionType);
  }
  const set = saveCleanupSet({ requestId: ctx.requestId, stepId: String(assignment?.stepId || 'echo'), proposals, withNotes: notes.length > 0 });
  return result(`Echo proposes ${proposals.length} changes to memory: tick the ones to apply.`, 'setup_required', actionType, { cleanupSetId: set.id });
}

function noteText(noteId: string): string {
  const id = noteId.replace(/^note:/, '');
  const note: any = (listMemoryItems() || []).find((m: any) => m?.id === id);
  return note ? String(note.title || '') : '';
}

/** Applies the ticked proposals of an open set; nothing else changes. */
export function applyCleanup(setId: string, proposalIds: string[]): { applied: number } {
  const set = getCleanup(setId);
  if (!set || set.status !== 'open') return { applied: 0 };
  let applied = 0;
  for (const p of set.proposals.filter((x) => proposalIds.includes(x.id))) {
    const decisionIds = p.ids.filter((id) => !id.startsWith('note:'));
    if (p.kind === 'merge' && p.text) {
      const merged = addDecision({ kind: 'decision', text: p.text, topics: [], source: { surface: 'other', by: 'you' }, ...(decisionIds[0] ? { replaces: decisionIds[0] } : {}) });
      decisionIds.slice(1).forEach((id) => replaceWith(id, merged.id));
    } else if ((p.kind === 'replace' || p.kind === 'contradiction') && p.keep) {
      decisionIds.filter((id) => id !== p.keep).forEach((id) => replaceWith(id, p.keep!));
    } else if (p.kind === 'drop') {
      decisionIds.forEach((id) => forgetDecision(id));
    } else if (p.kind === 'promote') {
      addDecision({ kind: 'decision', text: p.text || noteText(p.ids[0]), topics: [], source: { surface: 'other', by: 'you' } });
    } else {
      continue;
    }
    applied += 1;
  }
  finishCleanup(setId, { status: 'applied', applied });
  if (set.withNotes) { try { localStorage.setItem(NOTES_REVIEWED_KEY, '1'); } catch { /* storage full */ } }
  return { applied };
}

export function dismissCleanup(setId: string): void {
  const set = getCleanup(setId);
  if (set?.status === 'open') finishCleanup(setId, { status: 'dismissed' });
}

/** The weekly schedule "Echo: tidy memory": one Echo cleanup step as a request. */
export async function askEchoCleanup(): Promise<{ state: 'done' | 'failed'; summary: string }> {
  const { submitStepsToJose } = await import('../jose/submitToJose');
  const out: any = await submitStepsToJose({
    text: 'Tidy memory: propose merges, replacements and drops; change nothing until I apply them.',
    source: 'schedule',
    label: ECHO_CLEANUP_LABEL,
    allowPaidModels: false,
    steps: [{ stepId: 'echo', agent: 'echo', actionType: 'memory_cleanup', effects: ['write_own_work'], needs: [], instruction: 'Propose what to tidy in memory.' } as never],
  } as never);
  if (out?.ok === false) return { state: 'failed', summary: String(out.reason || 'Echo could not look over memory.') };
  return { state: 'done', summary: String(out?.userReport?.summary || 'Echo looked over memory: see the board.') };
}
