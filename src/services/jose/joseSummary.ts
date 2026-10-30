// The closing summary of a request (agent roles Part A, owner 2026-10-24):
// one line per step and the full work on the board. No model call. Until then
// requests ended with "Jose merged N agent report(s)…".
import type { JoseRequest, JoseRequestStep } from './joseRequestStore';
import { getStepOutput } from './joseStepOutputs';
import { readableOutput } from './stepInput';
import { agentName } from './agentNames';

const LINE_CHARS = 160;

function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const match = flat.match(/^.+?[.!?](\s|$)/);
  const sentence = (match ? match[0] : flat).trim();
  return sentence.length > LINE_CHARS ? `${sentence.slice(0, LINE_CHARS - 1)}…` : sentence;
}

function stepLine(request: JoseRequest, step: JoseRequestStep): string {
  const name = agentName(step.agent);
  const reason = String((step as any).error || '').trim();
  // Held back by the resource gate (2026-10-30): "Waiting for memory: X is busy." → "(X is busy.)".
  if (step.waitingFor) {
    const why = step.waitingFor.replace(/^Waiting for memory(: | to free up\.)?/, '').trim();
    return why ? `${name}: waiting for memory (${why})` : `${name}: waiting for memory`;
  }
  switch (step.status) {
    case 'done': {
      const output = getStepOutput(request.commandId, step.stepId);
      const text = output ? readableOutput(output) : '';
      return `${name}: ${text ? firstSentence(text) : 'done'}`;
    }
    case 'waiting_approval': {
      const why = String(step.waitFor || '').trim();
      return why ? `${name}: waiting for you (${why})` : `${name}: waiting for your approval`;
    }
    case 'setup_needed': return `${name}: needs setup (${reason || 'something needs setting up'})`;
    case 'failed': return `${name}: failed (${reason || 'no reason was recorded'})`;
    case 'rejected': return `${name}: you rejected it`;
    case 'not_run': return `${name}: not run`;
    default: return `${name}: ${String(step.status || 'waiting').replace(/_/g, ' ')}`;
  }
}

export function closingSummary(request: JoseRequest): string {
  const steps = request.steps || [];
  if (steps.length === 1 && steps[0].status === 'done') {
    const output = getStepOutput(request.commandId, steps[0].stepId);
    // A review's hand-over says everything; its data (with a kind) is for the board (agent phase 4).
    const handOver = typeof output?.summary === 'string' ? output.summary.trim() : '';
    const isReview = Boolean(output?.schema && typeof output.schema === 'object' && (output.schema as { kind?: unknown }).kind);
    const full = output ? (isReview && handOver ? handOver : readableOutput(output)) : '';
    if (full) return full;
  }
  const lines = steps.map((step) => stepLine(request, step));
  // A stopped request says so first (Jose phase 7).
  if (request.status === 'stopped') lines.unshift('Stopped by you.');
  const waiting = steps.filter((step) => step.status === 'waiting_approval' || step.status === 'setup_needed').length;
  if (waiting && steps.length > 1) lines.push(`Waiting for you: ${waiting}`);
  lines.push('Open on the board.');
  return lines.join('\n');
}
