// Boardroom's reply loop (phone app phase 3 part A, 2026-11-02): moved out of BoardroomChatView so a
// message from the phone gets exactly the replies and limits the desktop gives. A message is posted,
// work asked for goes to Jose as a request, else the mentioned agents (Alphonso when none is
// mentioned) reply in turn; a reply that mentions another agent brings that agent in, up to
// MAX_CHAIN_DEPTH replies and the fan-out character budget, after which the thread asks you.
import { listAgentProfiles } from '../agents/agentRegistry';
import {
  addThreadMessage, findCrossThreadContext, getThread, listThreadMessages, parseMentions, setThreadGovernance, BOARDROOM_SPEAKER,
} from './boardroomThreadService';
import { detectLowConfidence, generateAgentResponse } from './boardroomFacilitatorService';
import { concludeOnJose, creativeBriefOnJose, distributeOnJose, workOnJose, workRequestIn } from './boardroomJoseService';
import { createFanOutBudgetTracker, DEFAULT_FANOUT_CHAR_BUDGET } from './fanOutBudgetService';
import { getAgentProvider } from './modelSelectionService';
import { getRuntimePolicySettings } from './policyEnforcementService';

// Spec 1.10.2: a hard cap on chained AI-generated hops per message, so an unbroken chain of agents
// @mentioning each other can't run forever (a simple global depth cap per cascade).
export const MAX_CHAIN_DEPTH = 3;
export const JOSE_STARTED = 'Started on the board: Jose is planning it.';
/** A phone can't show the desktop's approval window, so a Hermes reply waits for the computer. */
export const HERMES_ON_COMPUTER = 'Replies through Hermes need your approval on the computer.';
export const STOPPED_LINE = 'Generation stopped by user.';

function profiles(): Array<{ id: string; name: string }> {
  return listAgentProfiles() as Array<{ id: string; name: string }>;
}

export function boardroomAgentLabel(speakerId: string): string {
  if (speakerId === 'user') return 'You';
  if (speakerId === BOARDROOM_SPEAKER) return 'Boardroom';
  return profiles().find((p) => p.id === speakerId)?.name || speakerId;
}

/** The phone's approval for a reply: yes, unless the agent answers through Hermes while Approval Mode is on. */
export async function phoneApprove(agentId: string): Promise<boolean> {
  if (getAgentProvider(agentId)?.provider !== 'hermes') return true;
  return !getRuntimePolicySettings().approvalMode;
}

export interface BoardroomRepliesInput {
  threadId: string;
  text: string;
  /** Whether this agent may answer (the desktop asks for Hermes; the phone uses phoneApprove). */
  approve: (agentId: string) => Promise<boolean>;
  /** Said in the failure when `approve` says no. */
  deniedReason?: string;
  isStopped?: () => boolean;
  signal?: AbortSignal;
  onChange?: () => void;
  onResponder?: (agentId: string | null) => void;
}

/** Work asked for in a thread ("/jose …", "research …") is a Jose request, its notes in the thread. */
export async function boardroomWorkOnJose(threadId: string, work: string, onChange?: () => void): Promise<void> {
  let started: string | null = null;
  try {
    const history = listThreadMessages(threadId).slice(-6).map((m) => ({ role: m.speaker === 'user' ? 'user' : 'assistant', content: m.content }));
    const result = await workOnJose(work, {
      history,
      onStarted: (requestId) => {
        started = requestId;
        addThreadMessage({ threadId, speaker: BOARDROOM_SPEAKER, content: JOSE_STARTED, kind: 'system', requestId });
        onChange?.();
      },
    });
    addThreadMessage({
      threadId,
      speaker: result.requestId ? 'jose' : BOARDROOM_SPEAKER,
      content: result.summary,
      kind: result.waiting ? 'system' : 'message',
      ...(result.requestId || started ? { requestId: result.requestId || started } : {}),
    });
  } catch (error) {
    addThreadMessage({ threadId, speaker: BOARDROOM_SPEAKER, content: `Jose couldn't run it: ${error instanceof Error ? error.message : String(error)}`, kind: 'failure' });
  } finally {
    onChange?.();
  }
}

export async function runBoardroomReplies(input: BoardroomRepliesInput): Promise<void> {
  const { threadId, text } = input;
  const changed = () => input.onChange?.();
  const thread = getThread(threadId);
  if (!thread || !text.trim()) return;
  const userMessage = addThreadMessage({ threadId, speaker: 'user', content: text });
  let previousMessageId: string | undefined = userMessage?.id;
  changed();

  const agentIds = profiles().map((p) => p.id);
  const work = workRequestIn(text, profiles().map((p) => p.name));
  if (work) {
    input.onResponder?.('jose');
    try { await boardroomWorkOnJose(threadId, work, changed); } finally { input.onResponder?.(null); }
    return;
  }

  const mentions = parseMentions(text, agentIds);
  const respondingAgents = mentions.length > 0 ? mentions : ['alphonso'];
  const stopped = () => Boolean(input.isStopped?.());
  const note = (content: string, kind: 'system' | 'escalation') => { addThreadMessage({ threadId, speaker: BOARDROOM_SPEAKER, content, kind }); changed(); };
  let hopsUsed = 0;
  const budget = createFanOutBudgetTracker(DEFAULT_FANOUT_CHAR_BUDGET);

  try {
    while (respondingAgents.length > 0) {
      const agentId = respondingAgents.shift() as string;
      input.onResponder?.(agentId);
      if (stopped()) { note(STOPPED_LINE, 'system'); break; }
      if (hopsUsed >= MAX_CHAIN_DEPTH) {
        note(`The conversation reached ${MAX_CHAIN_DEPTH} chained replies without stopping — further @mentions won't auto-trigger. Reply directly to keep it going, or make a call on where this should land.`, 'escalation');
        break;
      }
      if (budget.isExceeded()) {
        note(`This cascade generated more content than the ${DEFAULT_FANOUT_CHAR_BUDGET.toLocaleString()}-character budget for one chain — further @mentions won't auto-trigger. Reply directly to keep it going, or make a call on where this should land.`, 'escalation');
        break;
      }
      hopsUsed += 1;

      const priorMessages = listThreadMessages(threadId).map((m) => ({ speaker: m.speaker, content: m.content }));
      const crossThreadContext = findCrossThreadContext({ excludeThreadId: threadId, queryText: text });
      const approved = await input.approve(agentId);
      const result = approved
        ? await generateAgentResponse({ agentId, topic: thread.topic, priorMessages, newMessageText: text, crossThreadContext, signal: input.signal, threadId, approved })
        : { ok: false, text: '', error: input.deniedReason || HERMES_ON_COMPUTER };

      if (stopped()) { note(STOPPED_LINE, 'system'); break; }

      const replyText = result.ok ? result.text : `${agentId} couldn't respond: ${result.error}`;
      budget.recordUsage(text.length + replyText.length);
      const replyMessage = addThreadMessage({
        threadId,
        speaker: agentId,
        content: replyText,
        kind: result.ok ? 'message' : 'failure',
        retryContext: result.ok ? undefined : text,
        model: result.ok ? result.model : undefined,
        latencyMs: result.ok ? result.latencyMs : undefined,
        informedByMessageId: previousMessageId,
      });
      changed();

      if (result.ok) {
        previousMessageId = replyMessage?.id;
        if (detectLowConfidence(replyText)) note(`${boardroomAgentLabel(agentId)} flagged low confidence in that reply — needs your decision.`, 'escalation');
        respondingAgents.push(...parseMentions(replyText, agentIds).filter((id) => id !== agentId));
      }
    }
  } finally {
    input.onResponder?.(null);
  }
}

// ── Thread actions (moved from BoardroomChatView, 2026-11-02, so the phone gets the same notes). Each is
// a one-step Jose request and posts what really happened into the thread.

type NoteKind = 'system' | 'failure' | 'conclusion' | 'message';
function threadNote(threadId: string, speaker: string, content: string, kind: NoteKind = 'system', requestId?: string | null): void {
  addThreadMessage({ threadId, speaker, content, kind, ...(requestId ? { requestId } : {}) });
}

/** Maria's governance review of the thread, saved on it as `governance`. */
export async function concludeThread(threadId: string): Promise<void> {
  const thread = getThread(threadId);
  if (!thread) return;
  const messages = listThreadMessages(threadId);
  try {
    const transcript = messages
      .filter((m) => ['message', 'response', 'briefing'].includes(m.kind))
      .slice(-20)
      .map((m) => `${boardroomAgentLabel(m.speaker)}: ${m.content}`)
      .join('\n')
      .slice(0, 6000);
    const { review, waiting, requestId } = await concludeOnJose(thread.topic, transcript);
    if (waiting) { threadNote(threadId, BOARDROOM_SPEAKER, "Maria's review is waiting for your approval.", 'system', requestId); return; }
    if (!review?.riskLevel) throw new Error('Maria returned no review');
    const governance = {
      riskLevel: String(review.riskLevel),
      approvalRequired: Boolean(review.approvalRequired),
      summary: String(review.summary || '').trim(),
      reviewedAt: new Date().toISOString(),
      source: 'model' as const,
    };
    setThreadGovernance(threadId, governance);
    const approval = governance.approvalRequired ? ', approval required before anything is sent out' : '';
    threadNote(threadId, 'maria', `Maria's governance review: risk ${governance.riskLevel}${approval}. ${governance.summary}`, 'conclusion');
    try {
      const { pushMemory } = await import('./unifiedMemoryService.js');
      pushMemory({ title: `Boardroom: ${thread.topic}`, content: { governance, messages: messages.length }, category: 'decision_memory', namespace: 'ecosystem', sourceAgent: 'maria' } as Parameters<typeof pushMemory>[0]);
    } catch { /* saving to memory must not undo the conclusion */ }
  } catch (error) {
    threadNote(threadId, BOARDROOM_SPEAKER, `Maria's review did not complete: ${error instanceof Error ? error.message : String(error)}. The thread stays open.`, 'failure');
  }
}

/** Marcus: a review only (sends nothing), or a Slack post that waits for your approval. Needs Conclude first. */
export async function distributeThread(threadId: string, mode: 'review' | 'slack', channel = ''): Promise<boolean> {
  const thread = getThread(threadId);
  const governance = thread?.governance;
  if (!thread || !governance) return false;
  const target = channel.trim();
  if (mode === 'slack' && !target) return false;
  try {
    const result = await distributeOnJose(thread.topic, governance.summary, mode, target);
    if (result.waiting) {
      threadNote(threadId, BOARDROOM_SPEAKER, `Posting to Slack ${target} is waiting for your approval. Nothing is sent until you approve it.`, 'system', result.requestId);
    } else {
      const summary = result.summary || 'Marcus returned no summary.';
      threadNote(threadId, 'marcus', mode === 'review' ? `Distribution review only, nothing was sent. ${summary}` : summary);
    }
    return true;
  } catch (error) {
    threadNote(threadId, BOARDROOM_SPEAKER, `Distribution failed, nothing was sent: ${error instanceof Error ? error.message : String(error)}`, 'failure');
    return false;
  }
}

/** Miya's creative brief for the thread's topic. */
export async function creativeBriefThread(threadId: string): Promise<void> {
  const thread = getThread(threadId);
  if (!thread) return;
  try {
    const context = thread.governance?.summary || listThreadMessages(threadId).slice(-5).map((m) => m.content).join(' ').slice(0, 800);
    const result = await creativeBriefOnJose(thread.topic, context);
    let content = "Miya's creative brief did not produce anything.";
    if (result.waiting) content = "Miya's creative brief is waiting for your approval.";
    else if (result.summary) content = `Creative brief: ${result.summary}`;
    threadNote(threadId, result.summary && !result.waiting ? 'miya' : BOARDROOM_SPEAKER, content, 'system', result.requestId);
  } catch (error) {
    threadNote(threadId, BOARDROOM_SPEAKER, `The creative brief request failed: ${error instanceof Error ? error.message : String(error)}`, 'failure');
  }
}

