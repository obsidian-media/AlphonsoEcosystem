// When a request finishes: Echo writes down what was decided (agent phase 7), from wherever the
// request came, so every agent can follow it later. Skipped when the plan had Echo's own save
// step. Never changes the request's status; a failure is only noted, and nothing is made up.
// Design: docs/superpowers/specs/2026-10-26-agent-phase-echo-design.md §2
import { extractDecisions } from '../echo/echoSteps';
import { surfaceOf } from '../echo/decisions';
import { agentName } from './agentNames';
import { appendRequestNote, type JoseRequest } from './joseRequestStore';

export const NOTHING_NEW = 'Echo found nothing new to remember.';

const NOT_A_SAVE = new Set(['memory_recall', 'memory_forget', 'memory_cleanup', 'knowledge_curation']);

export async function saveRequestDecisions(
  request: JoseRequest,
  outputs: Record<string, { summary?: string; sources?: unknown[] }>,
  _options: { draftDisabled?: boolean; endpoint?: string } = {},
): Promise<{ saved: boolean; note: string }> {
  if (request.steps.some((step) => step.agent === 'echo' && !NOT_A_SAVE.has(String(step.actionType)))) {
    return { saved: false, note: 'The plan had its own Echo step.' };
  }
  const stepIds = Object.keys(outputs || {});
  const agentOf = (stepId: string) => request.steps.find((s) => s.stepId === stepId)?.agent || '';
  const work = stepIds
    .map((id) => `${agentName(agentOf(id))}: ${String(outputs[id]?.summary || '').trim()}`)
    .filter((line) => !line.endsWith(': '))
    .join('\n\n');
  const sources = [...new Set(stepIds.flatMap((id) => (outputs[id]?.sources || []).map((s: any) => String(typeof s === 'string' ? s : s?.url || '')).filter(Boolean)))];
  let notes: string[];
  let result: { saved: boolean; note: string };
  try {
    const out = await extractDecisions({
      request: request.text,
      work,
      changeLog: (request.changeLog || []).map((c) => c.text),
      surface: surfaceOf(request.source),
      requestId: request.id,
      stepIds,
      sources,
      packetId: request.id,
    });
    if (out.ok === false) {
      notes = [`Echo couldn't save what was decided: ${out.reason}`];
      result = { saved: false, note: notes[0] };
    } else {
      notes = out.saved.length ? out.saved.map((d) => `Echo remembered: ${d.text}`) : [NOTHING_NEW];
      result = { saved: true, note: notes.join('\n') };
    }
  } catch (err) {
    notes = [`Echo couldn't save what was decided: ${String((err as Error)?.message || err)}`];
    result = { saved: false, note: notes[0] };
  }
  for (const note of notes) {
    try { appendRequestNote(request.id, note); } catch { /* display aid only */ }
  }
  return result;
}
