// Marcus's readiness check (agent phase 5): read-only, asks nothing, sends nothing. Is the text
// there, was it reviewed, where would it go, does the connector answer, does it fit.
import { checkConnectorHealth } from '../connectorHealthCheckService';
import { buildStepInput } from '../jose/stepInput';
import { requestForCommand } from '../jose/joseRequestStore';
import { getStepOutput } from '../jose/joseStepOutputs';
import { agentName } from '../jose/agentNames';
import { CHANNEL_LIMITS, CONNECTOR_NAMES } from './destinations';
import { hintFromTaskType, pickDestination } from './pickDestination';
import { tooLongReason } from './prepareSend';
import { NOTHING_TO_SEND, textToSend } from './sendText';
import type { Destination } from './types';

interface ReadinessAssignment {
  stepId?: string;
  agent?: string;
  actionType?: string;
  needs?: string[];
  payload?: Record<string, unknown>;
}

const count = (n: number) => n.toLocaleString('en-US');

/** The Sentinel and Maria verdicts on the work, from the request's review steps. */
function reviewsOf(commandId: string, sourceStepId: string | null): Array<{ agent: string; verdict: string }> {
  const request = requestForCommand(commandId);
  if (!request || !sourceStepId) return [];
  return request.steps
    .filter((s) => (s.agent === 'sentinel' || s.agent === 'maria') && s.reviewOf === sourceStepId)
    .map((s) => {
      const schema = (getStepOutput(commandId, s.stepId) as { schema?: { verdict?: string } } | null)?.schema;
      return { agent: s.agent, verdict: String(schema?.verdict || '') };
    })
    .filter((r) => r.verdict);
}

export async function checkReadiness(commandId: string, assignment: ReadinessAssignment, request: { text: string } | null): Promise<{ ready: boolean; text: string }> {
  const requestText = String(request?.text || '');
  const points: Array<{ ok: boolean; line: string }> = [];
  const input = buildStepInput(commandId, assignment as never, requestText);
  const picked = textToSend(assignment, input);
  if (picked) {
    const from = picked.sourceStepId ? input.needs.find((n) => n.stepId === picked.sourceStepId)?.agent : null;
    points.push({ ok: true, line: `The text is there${from ? ` (from ${agentName(from)})` : ''}.` });
    const reviews = reviewsOf(commandId, picked.sourceStepId);
    if (!reviews.length) points.push({ ok: false, line: 'Nobody reviewed it yet.' });
    for (const r of reviews) {
      const bad = r.verdict === 'unsafe' || r.verdict === 'risky' || r.verdict === 'fix';
      const who = agentName(r.agent);
      points.push({ ok: !bad, line: bad ? `${who} found problems: ${r.verdict}.` : `${who} checked it: ${r.verdict}.` });
    }
  } else {
    points.push({ ok: false, line: NOTHING_TO_SEND });
  }

  const payload = assignment.payload || {};
  const given: Partial<Destination> | undefined = payload.connector
    ? { connector: payload.connector as Destination['connector'], ...(payload.target ? { target: String(payload.target) } : {}) }
    : undefined;
  const where = await pickDestination(requestText, picked?.text || '', { given, hint: hintFromTaskType(assignment.actionType), actionType: assignment.actionType });
  if (where.ok === false) {
    points.push({ ok: false, line: where.reason });
  } else {
    const d = where.destination;
    points.push({ ok: true, line: `It would go to ${d.label}.` });
    const name = CONNECTOR_NAMES[d.connector];
    try {
      const health = await checkConnectorHealth(d.connector);
      points.push(health.ok ? { ok: true, line: `${name} answers.` } : { ok: false, line: `${name} didn't answer: ${String(health.message || 'no answer').replace(/\.$/, '')}.` });
    } catch (error) {
      points.push({ ok: false, line: `${name} didn't answer: ${String((error as Error)?.message || error).replace(/\.$/, '')}.` });
    }
    const limit = CHANNEL_LIMITS[`${d.connector}:${d.kind}`];
    if (picked && limit) {
      const n = picked.text.length;
      points.push(n > limit ? { ok: false, line: tooLongReason(d.label, n, limit) } : { ok: true, line: `It fits: ${count(n)} of ${count(limit)} characters.` });
    }
  }

  const ready = points.every((p) => p.ok);
  return { ready, text: [ready ? 'Ready.' : 'Not ready:', ...points.map((p) => `- ${p.line}`)].join('\n') };
}
