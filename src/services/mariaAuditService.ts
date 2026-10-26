// Maria's step (agent phase 3, owner 2026-10-25): when her step reviews another step's work,
// a review of that work (pass or fix, quoting it, with unbacked claims); otherwise a review
// of the plan or action (risk, rules, points, what needs your approval). Her model only: the
// keyword check that used to stand in silently is gone. One memory note per review.
import type { StepInput } from './jose/stepInput';
import { TRUST_STATES } from './trustModel';
import { pushMemoryItem } from './memoryService';
import { addNode, addEdge } from './memoryGraphService';
import { runMariaWorkReview } from './maria/mariaWorkReview';
import { runMariaPlanReview } from './maria/mariaPlanReview';
import type { MariaAssignment, MariaStepResult } from './maria/mariaTypes';

export interface MariaAuditOptions {
  stepInput?: StepInput | null;
  commandId?: string;
  projectDirectory?: string;
  workspaceRoot?: string;
  draftDisabled?: boolean;
  signal?: AbortSignal;
  [key: string]: unknown;
}

function emptyInput(request: string): StepInput {
  return { instruction: '', request, needs: [], others: [], memory: '', review: null };
}

function aboutOf(request: string): string {
  const line = String(request || '').replace(/^\s*\/jose\s+/i, '').split('\n')[0].trim();
  return line.length <= 80 ? line : line.slice(0, 80).replace(/\s+\S*$/, '');
}

function outcomeOf(result: MariaStepResult): string {
  const schema = result.schema || {};
  if (schema.kind === 'work') return schema.verdict === 'fix' ? 'Fix' : 'Pass';
  return `Risk ${schema.riskLevel}${schema.approvalRequired ? ', needs approval' : ''}`;
}

export async function runMariaGovernanceAudit(commandText: string, assignment: MariaAssignment, options: MariaAuditOptions = {}): Promise<MariaStepResult> {
  const input = options.stepInput || emptyInput(String(commandText || ''));
  // draftDisabled only says Ollama at the Settings address didn't answer: her model may be
  // another provider or the step's paid model, so she asks it; an unreachable model fails
  // her step as an unreadable review.
  const result = input.review
    ? await runMariaWorkReview(assignment || {}, input, { commandId: options.commandId, workspaceRoot: options.projectDirectory || options.workspaceRoot, signal: options.signal })
    : await runMariaPlanReview(assignment || {}, input, { signal: options.signal });
  if (result.resultState !== 'completed') return result;

  const memoryItem = pushMemoryItem({
    title: `Maria: ${aboutOf(input.request)} — ${outcomeOf(result)}`,
    category: 'governance_memory',
    content: result.schema,
    source: 'maria-audit-service',
    sourceAgent: 'maria',
    confidence: TRUST_STATES.INFERRED,
    verificationState: TRUST_STATES.INFERRED,
  });
  // The memory graph keeps which packet she reviewed (phase 2 writer).
  const packetRefId = assignment?.packetId ?? assignment?.commandId;
  if (memoryItem?.id && packetRefId) {
    addNode('memory_item', memoryItem.id).then((memoryNode) => {
      if (!memoryNode) return;
      return addNode('packet', String(packetRefId)).then((packetNode) => {
        if (packetNode) addEdge(memoryNode, packetNode, 'audits', { confidence: TRUST_STATES.INFERRED, createdBy: 'maria', createdEvent: memoryItem.id });
      });
    }).catch(() => {});
  }
  return { ...result, schema: { ...result.schema, confidenceLevel: TRUST_STATES.INFERRED } };
}
