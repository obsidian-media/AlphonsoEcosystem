import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Send } from 'lucide-react';
import { listAgentProfiles } from '../agents/agentRegistry';
import {
  createThread,
  listThreads,
  listThreadMessages,
  addThreadMessage,
  acknowledgeThreadMessage,
  confirmThreadMessage,
  migrateLegacySessions,
  setThreadGovernance,
  parseMentions,
  findCrossThreadContext,
  BOARDROOM_SPEAKER,
  type BoardroomThread,
  type BoardroomThreadMessage
} from '../services/boardroomThreadService';
import { workOnJose, workRequestIn } from '../services/boardroomJoseService';

const JOSE_STARTED = 'Started on the board: Jose is planning it.';
import { generateAgentResponse, detectLowConfidence } from '../services/boardroomFacilitatorService';
import { getAgentProvider } from '../services/modelSelectionService';
import { getRuntimePolicySettings } from '../services/policyEnforcementService';
import { createFanOutBudgetTracker, DEFAULT_FANOUT_CHAR_BUDGET } from '../services/fanOutBudgetService';

const AGENT_PROFILES = listAgentProfiles();

/**
 * Closes the Phase 1b gap in docs/governance/DEFERRED_WORK.md: Boardroom
 * has no packet/queue system (unlike Jose's pipeline), so it can't reuse
 * that gate — it calls the existing app-wide `requestApproval()` bridge
 * (already used by PluginProvider/WorkspaceProvider in App.tsx) directly,
 * synchronously, before the Hermes call, since this runs inside a live
 * React event handler.
 */
export interface BoardroomApprovalRequest {
  actionLabel: string;
  agent?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  /** Prompt even when the label has no high-risk keyword (see useAppShellState). */
  requireApproval?: boolean;
}
export type BoardroomRequestApproval = (request: BoardroomApprovalRequest) => Promise<boolean>;

async function resolveHermesApproval(agentId: string, requestApproval?: BoardroomRequestApproval): Promise<boolean> {
  if (getAgentProvider(agentId)?.provider !== 'hermes') return true;
  if (!getRuntimePolicySettings().approvalMode) return true;
  if (!requestApproval) return false;
  // Must be an object: the shell's requestApproval destructures its argument,
  // so a bare string left actionLabel undefined and the gate auto-approved.
  return (await requestApproval({
    actionLabel: `${agentId} wants to use your Hermes profile to answer — it can run real tools, not just generate text.`,
    agent: agentId,
    riskLevel: 'high',
    requireApproval: true
  })) === true;
}

// Spec 1.10.2: a hard cap on chained AI-generated hops per message, so an
// unbroken chain of agents @mentioning each other can't run forever. This
// is deliberately a simple global depth cap per cascade, not full
// per-topic round tracking (which needs real disagreement detection) —
// see the phase 5 plan doc for the honest scope statement.
const MAX_CHAIN_DEPTH = 3;

function agentLabel(speakerId: string): string {
  if (speakerId === 'user') return 'You';
  if (speakerId === BOARDROOM_SPEAKER) return 'Boardroom';
  const profile = AGENT_PROFILES.find((p: { id: string }) => p.id === speakerId);
  return profile?.name || speakerId;
}

function formatLatency(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function MessageBubble({
  message,
  onRetry,
  onAcknowledge,
  onConfirm,
  onOpenBoard
}: {
  message: BoardroomThreadMessage;
  onRetry: (message: BoardroomThreadMessage) => void;
  onAcknowledge: (message: BoardroomThreadMessage) => void;
  onConfirm: (message: BoardroomThreadMessage) => void;
  onOpenBoard?: (requestId: string) => void;
}) {
  const isEscalation = message.kind === 'escalation';
  const isFailure = message.kind === 'failure';
  const isGated = message.approvalRequired && !message.confirmed;
  const toneClass = isEscalation
    ? 'bg-(--warning-dim)'
    : isFailure
      ? 'bg-(--error-dim)'
      : 'bg-(--surface-2)';
  return (
    <div data-message-kind={message.kind} className={`rounded-lg p-2.5 text-xs ${toneClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`font-semibold ${isEscalation ? 'text-(--warning)' : isFailure ? 'text-(--error)' : 'text-(--text-1)'}`}>
          {isEscalation ? 'Needs your decision' : isFailure ? `${agentLabel(message.speaker)} — failed` : agentLabel(message.speaker)}
        </span>
        {message.approvalRequired && (
          <span className="rounded-full border border-(--warning-border) bg-(--warning-dim) px-1.5 py-0.5 text-[9px] font-bold uppercase text-(--warning)">
            {message.confirmed ? 'confirmed' : 'approval required'}
          </span>
        )}
      </div>
      {isGated ? (
        <div className="mt-1.5 rounded-md bg-(--warning-dim) p-2">
          <p className="text-(--warning)">This message proposes a high-risk action — content hidden until confirmed.</p>
          <button
            onClick={() => onConfirm(message)}
            className="mt-1.5 rounded-md border border-(--warning-border) px-2 py-0.5 text-[10px] font-semibold text-(--warning) hover:bg-(--warning-dim)"
          >
            Confirm to reveal
          </button>
        </div>
      ) : (
        <div className={`mt-1 whitespace-pre-wrap ${isEscalation ? 'text-(--warning)' : isFailure ? 'text-(--error)' : 'text-(--text-2)'}`}>{message.content}</div>
      )}
      {!isEscalation && !isFailure && message.model && (
        <div className="mt-1 text-[9px] text-(--text-3)">
          {message.model} · {formatLatency(message.latencyMs || 0)}
        </div>
      )}
      {message.requestId && onOpenBoard && (
        <button
          type="button"
          data-testid="boardroom-open-board"
          onClick={() => onOpenBoard(message.requestId!)}
          className="mt-1.5 rounded-md border border-(--accent-border) px-2 py-0.5 text-[10px] font-semibold text-(--accent) hover:bg-(--accent-dim)"
        >
          Open on the board
        </button>
      )}
      {isFailure && message.retryContext && (
        <button
          onClick={() => onRetry(message)}
          className="mt-1.5 rounded-md border border-(--error-border) px-2 py-0.5 text-[10px] font-semibold text-(--error) hover:bg-(--error-dim)"
        >
          Retry
        </button>
      )}
      {isEscalation && (
        message.acknowledged ? (
          <span className="mt-1.5 inline-block text-[10px] font-semibold text-(--warning)">✓ Acknowledged</span>
        ) : (
          <button
            onClick={() => onAcknowledge(message)}
            className="mt-1.5 rounded-md border border-(--warning-border) px-2 py-0.5 text-[10px] font-semibold text-(--warning) hover:bg-(--warning-dim)"
          >
            Acknowledge
          </button>
        )
      )}
      {message.mentionedAgents.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {message.mentionedAgents.map((agentId) => (
            <span key={agentId} className="rounded-full border border-(--accent-border) bg-(--accent-dim) px-1.5 py-0.5 text-[9px] font-semibold text-(--accent)">
              → {agentLabel(agentId)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function BoardroomChatView({ requestApproval, onOpenJoseBoard }: { requestApproval?: BoardroomRequestApproval; onOpenJoseBoard?: (requestId: string) => void } = {}) {
  const [threads, setThreads] = useState<BoardroomThread[]>(() => {
    migrateLegacySessions();
    return listThreads();
  });
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => threads[0]?.id ?? null);
  const [messages, setMessages] = useState<BoardroomThreadMessage[]>(() =>
    activeThreadId ? listThreadMessages(activeThreadId) : []
  );
  const [newTopic, setNewTopic] = useState('');
  const [composerText, setComposerText] = useState('');
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [facilitatorPending, setFacilitatorPending] = useState(false);
  const [activeResponder, setActiveResponder] = useState<string | null>(null);
  const [threadAction, setThreadAction] = useState<'conclude' | 'distribute' | 'brief' | null>(null);
  const [distributeOpen, setDistributeOpen] = useState(false);
  const [slackChannel, setSlackChannel] = useState('');
  const stopRequestedRef = useRef(false);
  const generationAbortControllerRef = useRef<AbortController | null>(null);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId]
  );

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return AGENT_PROFILES.filter((p: { id: string; name: string }) => p.name.toLowerCase().startsWith(q));
  }, [mentionQuery]);

  useEffect(() => {
    setMessages(activeThreadId ? listThreadMessages(activeThreadId) : []);
  }, [activeThreadId]);

  function handleCreateThread() {
    if (!newTopic.trim()) return;
    const thread = createThread({
      topic: newTopic.trim(),
      participants: AGENT_PROFILES.map((p: { id: string }) => p.id)
    });
    setThreads(listThreads());
    setActiveThreadId(thread.id);
    setNewTopic('');
  }

  async function handleSend() {
    if (!activeThreadId || !activeThread || !composerText.trim() || generationAbortControllerRef.current) return;
    const text = composerText.trim();
    const userMessage = addThreadMessage({ threadId: activeThreadId, speaker: 'user', content: text });
    let previousMessageId: string | undefined = userMessage?.id;
    setMessages(listThreadMessages(activeThreadId));
    setComposerText('');

    // Work asked for in a thread ("/jose …", "research …") is a real Jose request, not a chat
    // where an agent promises work it can't do (2.11.0 QA, owner 2026-11-01).
    const work = workRequestIn(text, AGENT_PROFILES.map((p: { name: string }) => p.name));
    if (work) {
      await handOffToJose(activeThreadId, work);
      return;
    }

    const agentIds = AGENT_PROFILES.map((p: { id: string }) => p.id);
    const mentions = parseMentions(text, agentIds);
    const respondingAgents = mentions.length > 0
      ? mentions
      : ['alphonso'];

    if (respondingAgents.length === 0) return;

    const controller = new AbortController();
    generationAbortControllerRef.current = controller;
    setFacilitatorPending(true);
    stopRequestedRef.current = false;
    let hopsUsed = 0;
    const budget = createFanOutBudgetTracker(DEFAULT_FANOUT_CHAR_BUDGET);

    try {
    while (respondingAgents.length > 0) {
      const agentId = respondingAgents.shift() as string;
      setActiveResponder(agentId);

      if (stopRequestedRef.current) {
        addThreadMessage({
          threadId: activeThreadId,
          speaker: BOARDROOM_SPEAKER,
          content: 'Generation stopped by user.',
          kind: 'system'
        });
        setMessages(listThreadMessages(activeThreadId));
        break;
      }

      if (hopsUsed >= MAX_CHAIN_DEPTH) {
        addThreadMessage({
          threadId: activeThreadId,
          speaker: BOARDROOM_SPEAKER,
          content: `The conversation reached ${MAX_CHAIN_DEPTH} chained replies without stopping — further @mentions won't auto-trigger. Reply directly to keep it going, or make a call on where this should land.`,
          kind: 'escalation'
        });
        setMessages(listThreadMessages(activeThreadId));
        break;
      }

      if (budget.isExceeded()) {
        addThreadMessage({
          threadId: activeThreadId,
          speaker: BOARDROOM_SPEAKER,
          content: `This cascade generated more content than the ${DEFAULT_FANOUT_CHAR_BUDGET.toLocaleString()}-character budget for one chain — further @mentions won't auto-trigger. Reply directly to keep it going, or make a call on where this should land.`,
          kind: 'escalation'
        });
        setMessages(listThreadMessages(activeThreadId));
        break;
      }

      hopsUsed += 1;

      const priorMessages = listThreadMessages(activeThreadId).map((m) => ({ speaker: m.speaker, content: m.content }));
      const crossThreadContext = findCrossThreadContext({ excludeThreadId: activeThreadId, queryText: text });
      const approved = await resolveHermesApproval(agentId, requestApproval);
      const result = approved
        ? await generateAgentResponse({
            agentId,
            topic: activeThread.topic,
            priorMessages,
            newMessageText: text,
            crossThreadContext,
            signal: controller.signal,
            threadId: activeThreadId,
            approved
          })
        : { ok: false, text: '', error: 'Approval denied — Hermes delegation was not confirmed.' };

      if (stopRequestedRef.current) {
        addThreadMessage({
          threadId: activeThreadId,
          speaker: BOARDROOM_SPEAKER,
          content: 'Generation stopped by user.',
          kind: 'system'
        });
        setMessages(listThreadMessages(activeThreadId));
        break;
      }

      const replyText = result.ok ? result.text : `${agentId} couldn't respond: ${result.error}`;
      budget.recordUsage(text.length + replyText.length);
      const replyMessage = addThreadMessage({
        threadId: activeThreadId,
        speaker: agentId,
        content: replyText,
        kind: result.ok ? 'message' : 'failure',
        retryContext: result.ok ? undefined : text,
        model: result.ok ? result.model : undefined,
        latencyMs: result.ok ? result.latencyMs : undefined,
        informedByMessageId: previousMessageId
      });
      setMessages(listThreadMessages(activeThreadId));

      if (result.ok) {
        previousMessageId = replyMessage?.id;
        if (detectLowConfidence(replyText)) {
          addThreadMessage({
            threadId: activeThreadId,
            speaker: BOARDROOM_SPEAKER,
            content: `${agentLabel(agentId)} flagged low confidence in that reply — needs your decision.`,
            kind: 'escalation'
          });
          setMessages(listThreadMessages(activeThreadId));
        }
        const chainedMentions = parseMentions(replyText, agentIds).filter((id) => id !== agentId);
        respondingAgents.push(...chainedMentions);
      }
    }
    } finally {
      if (generationAbortControllerRef.current === controller) {
        generationAbortControllerRef.current = null;
        setFacilitatorPending(false);
        setActiveResponder(null);
      }
    }
  }

  // ── Thread actions, moved here from the old Boardroom session view (owner,
  // 2026-10-21). Each one posts what really happened into the thread. The old
  // view showed a random "risk score" (Maria returns a risk level, not a
  // number) and said "sent via Marcus" even when nothing was sent.
  function refreshActiveThread() {
    setThreads(listThreads());
    if (activeThreadId) setMessages(listThreadMessages(activeThreadId));
  }

  async function handOffToJose(threadId: string, work: string) {
    const show = () => setMessages(listThreadMessages(threadId));
    setFacilitatorPending(true);
    setActiveResponder('jose');
    let started: string | null = null;
    try {
      const history = listThreadMessages(threadId).slice(-6).map((m) => ({ role: m.speaker === 'user' ? 'user' : 'assistant', content: m.content }));
      const result = await workOnJose(work, {
        history,
        onStarted: (requestId) => {
          started = requestId;
          addThreadMessage({ threadId, speaker: BOARDROOM_SPEAKER, content: JOSE_STARTED, kind: 'system', requestId });
          show();
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
      setActiveResponder(null);
      setFacilitatorPending(false);
      show();
    }
  }

  function postThreadNote(speaker: string, content: string, kind: BoardroomThreadMessage['kind'] = 'system', requestId?: string | null) {
    if (!activeThreadId) return;
    addThreadMessage({ threadId: activeThreadId, speaker, content, kind, ...(requestId ? { requestId } : {}) });
  }

  async function handleConclude() {
    if (!activeThreadId || !activeThread || threadAction) return;
    setThreadAction('conclude');
    try {
      const transcript = messages
        .filter((m) => ['message', 'response', 'briefing'].includes(m.kind))
        .slice(-20)
        .map((m) => `${agentLabel(m.speaker)}: ${m.content}`)
        .join('\n')
        .slice(0, 6000);
      // Phase 6a: Maria's review is a step in a Jose request (shown on the board).
      const { concludeOnJose } = await import('../services/boardroomJoseService');
      const { review, waiting, requestId } = await concludeOnJose(activeThread.topic, transcript);
      if (waiting) {
        postThreadNote(BOARDROOM_SPEAKER, "Maria's review is waiting for your approval.", 'system', requestId);
        return;
      }
      if (!review?.riskLevel) throw new Error('Maria returned no review');
      // Always her model's review now (agent phase 3): the rule-based check is gone.
      const source = 'model' as const;
      const governance = {
        riskLevel: String(review.riskLevel),
        approvalRequired: Boolean(review.approvalRequired),
        summary: String(review.summary || '').trim(),
        reviewedAt: new Date().toISOString(),
        source
      };
      setThreadGovernance(activeThreadId, governance);
      const label = "Maria's governance review";
      postThreadNote(
        'maria',
        `${label}: risk ${governance.riskLevel}${governance.approvalRequired ? ', approval required before anything is sent out' : ''}. ${governance.summary}`,
        'conclusion'
      );
      try {
        const { pushMemory } = await import('../services/unifiedMemoryService.js');
        // pushMemory is plain JS; its inferred parameter type lists only
        // `namespace`, though it stores every field (same call as the old view).
        pushMemory({
          title: `Boardroom: ${activeThread.topic}`,
          content: { governance, messages: messages.length },
          category: 'decision_memory',
          namespace: 'ecosystem',
          sourceAgent: 'maria'
        } as Parameters<typeof pushMemory>[0]);
      } catch { /* saving to memory must not undo the conclusion */ }
    } catch (error) {
      postThreadNote(BOARDROOM_SPEAKER, `Maria's review did not complete: ${error instanceof Error ? error.message : String(error)}. The thread stays open.`, 'failure');
    } finally {
      refreshActiveThread();
      setThreadAction(null);
    }
  }

  async function handleDistribute(mode: 'review' | 'slack') {
    const governance = activeThread?.governance;
    if (!activeThreadId || !activeThread || !governance || threadAction) return;
    const channel = slackChannel.trim();
    if (mode === 'slack' && !channel) return;
    setThreadAction('distribute');
    try {
      // Phase 6a: Marcus's step in a Jose request. Posting to Slack sends, so
      // the step waits for your approval (on the board, or on Telegram).
      const { distributeOnJose } = await import('../services/boardroomJoseService');
      const result = await distributeOnJose(activeThread.topic, governance.summary, mode, channel);
      if (result.waiting) {
        postThreadNote(BOARDROOM_SPEAKER, `Posting to Slack ${channel} is waiting for your approval. Nothing is sent until you approve it.`, 'system', result.requestId);
      } else {
        const summary = result.summary || 'Marcus returned no summary.';
        postThreadNote('marcus', mode === 'review' ? `Distribution review only, nothing was sent. ${summary}` : summary);
      }
      if (mode === 'slack') setDistributeOpen(false);
    } catch (error) {
      postThreadNote(BOARDROOM_SPEAKER, `Distribution failed, nothing was sent: ${error instanceof Error ? error.message : String(error)}`, 'failure');
    } finally {
      refreshActiveThread();
      setThreadAction(null);
    }
  }

  async function handleCreativeBrief() {
    if (!activeThreadId || !activeThread || threadAction) return;
    setThreadAction('brief');
    try {
      const { creativeBriefOnJose } = await import('../services/boardroomJoseService');
      const context = activeThread.governance?.summary || messages.slice(-5).map((m) => m.content).join(' ').slice(0, 800);
      const result = await creativeBriefOnJose(activeThread.topic, context);
      postThreadNote(
        result.summary && !result.waiting ? 'miya' : BOARDROOM_SPEAKER,
        result.waiting
          ? "Miya's creative brief is waiting for your approval."
          : result.summary
            ? `Creative brief: ${result.summary}`
            : "Miya's creative brief did not produce anything.",
        'system',
        result.requestId
      );
    } catch (error) {
      postThreadNote(BOARDROOM_SPEAKER, `The creative brief request failed: ${error instanceof Error ? error.message : String(error)}`, 'failure');
    } finally {
      refreshActiveThread();
      setThreadAction(null);
    }
  }

  function handleStop() {
    stopRequestedRef.current = true;
    generationAbortControllerRef.current?.abort();
  }

  async function handleRetry(message: BoardroomThreadMessage) {
    if (!activeThreadId || !activeThread || !message.retryContext) return;
    const agentId = message.speaker;
    const priorMessages = listThreadMessages(activeThreadId).map((m) => ({ speaker: m.speaker, content: m.content }));
    const crossThreadContext = findCrossThreadContext({ excludeThreadId: activeThreadId, queryText: message.retryContext });
    const retryApproved = await resolveHermesApproval(agentId, requestApproval);
    const result = retryApproved
      ? await generateAgentResponse({
          agentId,
          topic: activeThread.topic,
          priorMessages,
          newMessageText: message.retryContext,
          crossThreadContext,
          threadId: activeThreadId,
          approved: retryApproved
        })
      : { ok: false, text: '', error: 'Approval denied — Hermes delegation was not confirmed.' };
    const replyText = result.ok ? result.text : `${agentId} couldn't respond: ${result.error}`;
    addThreadMessage({
      threadId: activeThreadId,
      speaker: agentId,
      content: replyText,
      kind: result.ok ? 'message' : 'failure',
      retryContext: result.ok ? undefined : message.retryContext,
      model: result.ok ? result.model : undefined,
      latencyMs: result.ok ? result.latencyMs : undefined
    });
    setMessages(listThreadMessages(activeThreadId));
  }

  function handleAcknowledge(message: BoardroomThreadMessage) {
    if (!activeThreadId) return;
    acknowledgeThreadMessage(message.id);
    setMessages(listThreadMessages(activeThreadId));
  }

  function handleConfirm(message: BoardroomThreadMessage) {
    if (!activeThreadId) return;
    confirmThreadMessage(message.id);
    setMessages(listThreadMessages(activeThreadId));
  }

  function handleComposerChange(value: string) {
    setComposerText(value);
    const atIndex = value.lastIndexOf('@');
    if (atIndex === -1) {
      setMentionQuery(null);
      return;
    }
    const afterAt = value.slice(atIndex + 1);
    if (/\s/.test(afterAt)) {
      setMentionQuery(null);
      return;
    }
    setMentionQuery(afterAt);
  }

  function handleSelectMention(agentName: string) {
    const atIndex = composerText.lastIndexOf('@');
    const before = composerText.slice(0, atIndex);
    setComposerText(`${before}@${agentName} `);
    setMentionQuery(null);
  }

  return (
    <div className="h-full flex overflow-hidden">
      <div className="w-56 shrink-0 border-r border-(--border) overflow-y-auto p-3 space-y-3">
        <div className="space-y-2">
          <input
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            placeholder="New thread topic..."
            className="w-full rounded-lg border border-(--border) bg-(--surface-2) px-2.5 py-1.5 text-xs text-(--text-1) outline-hidden"
          />
          <button
            onClick={handleCreateThread}
            disabled={!newTopic.trim()}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-(--accent) px-2.5 py-1.5 text-xs font-semibold text-(--accent-contrast) disabled:opacity-40"
          >
            <Plus className="h-3 w-3" /> New Thread
          </button>
        </div>
        {threads.length === 0 ? (
          <p className="text-xs text-(--text-3)">No threads yet.</p>
        ) : (
          <div className="space-y-1">
            {threads.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveThreadId(t.id)}
                className={`w-full truncate rounded-lg px-2.5 py-1.5 text-left text-xs ${
                  t.id === activeThreadId ? 'bg-(--accent-dim) text-(--accent)' : 'text-(--text-2) hover:bg-(--surface-2)'
                }`}
              >
                {t.topic}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {activeThread ? (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-(--border) px-4 py-2" data-testid="boardroom-thread-actions">
              <button
                onClick={handleConclude}
                disabled={Boolean(threadAction) || activeThread.status === 'concluded'}
                title="Maria reviews this discussion for governance and risk, and the thread is marked concluded"
                className="rounded-md border border-(--border) px-2.5 py-1 text-[11px] font-semibold text-(--text-2) hover:bg-(--surface-2) disabled:opacity-40"
              >
                {threadAction === 'conclude' ? 'Maria is reviewing…' : activeThread.status === 'concluded' ? 'Concluded' : 'Conclude'}
              </button>
              <button
                onClick={() => setDistributeOpen((open) => !open)}
                disabled={Boolean(threadAction) || !activeThread.governance}
                title={activeThread.governance ? 'Marcus prepares or sends the conclusion' : 'Conclude the thread first, so Maria has reviewed it'}
                className="rounded-md border border-(--border) px-2.5 py-1 text-[11px] font-semibold text-(--text-2) hover:bg-(--surface-2) disabled:opacity-40"
              >
                {threadAction === 'distribute' ? 'Marcus is working…' : 'Distribute'}
              </button>
              <button
                onClick={handleCreativeBrief}
                disabled={Boolean(threadAction)}
                title="Ask Miya, through Jose, for a creative brief on this topic"
                className="rounded-md border border-(--border) px-2.5 py-1 text-[11px] font-semibold text-(--text-2) hover:bg-(--surface-2) disabled:opacity-40"
              >
                {threadAction === 'brief' ? 'Sending to Miya…' : 'Creative brief'}
              </button>
              {activeThread.governance && (
                <span className="text-[10px] text-(--text-3)" data-testid="boardroom-governance-badge">
                  Maria: risk {activeThread.governance.riskLevel}
                  {activeThread.governance.approvalRequired ? ' · approval required' : ''}
                </span>
              )}
            </div>
            {distributeOpen && activeThread.governance && (
              <div className="flex flex-wrap items-center gap-2 border-b border-(--border) bg-(--surface-1) px-4 py-2 text-[11px]">
                <button
                  onClick={() => handleDistribute('review')}
                  disabled={Boolean(threadAction)}
                  className="rounded-md border border-(--border) px-2.5 py-1 font-semibold text-(--text-2) hover:bg-(--surface-2) disabled:opacity-40"
                >
                  Review only (sends nothing)
                </button>
                <span className="text-(--text-3)">or post to Slack</span>
                <input
                  aria-label="Slack channel"
                  value={slackChannel}
                  onChange={(e) => setSlackChannel(e.target.value)}
                  placeholder="#channel"
                  className="w-32 rounded-md border border-(--border) bg-(--surface-2) px-2 py-1 text-(--text-1)"
                />
                <button
                  onClick={() => handleDistribute('slack')}
                  disabled={Boolean(threadAction) || !slackChannel.trim()}
                  className="rounded-md border border-(--border) px-2.5 py-1 font-semibold text-(--text-2) hover:bg-(--surface-2) disabled:opacity-40"
                >
                  Post to Slack (asks first)
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto space-y-2 p-4">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} onRetry={handleRetry} onAcknowledge={handleAcknowledge} onConfirm={handleConfirm} onOpenBoard={onOpenJoseBoard} />
              ))}
            </div>
            {facilitatorPending && (
              <div className="flex items-center justify-between px-4 pb-1 text-xs text-(--text-3)">
                <span>{agentLabel(activeResponder || 'alphonso')} is thinking…</span>
                <button
                  onClick={handleStop}
                  className="rounded-md border border-(--border) px-2 py-0.5 text-[10px] font-semibold text-(--text-2) hover:bg-(--surface-2)"
                >
                  Stop
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 border-t border-(--border) p-3">
              <div className="relative flex-1">
                <input
                  value={composerText}
                  onChange={(e) => handleComposerChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && mentionQuery === null) handleSend();
                  }}
                  placeholder="Message the room..."
                  className="w-full rounded-lg border border-(--border) bg-(--surface-2) px-3 py-1.5 text-sm text-(--text-1) outline-hidden"
                />
                {mentionMatches.length > 0 && (
                  <ul role="listbox" className="absolute bottom-full mb-1 w-full rounded-lg border border-(--border) bg-(--surface-1) shadow-lg">
                    {mentionMatches.map((p: { id: string; name: string }) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={false}
                          onClick={() => handleSelectMention(p.name)}
                          className="block w-full px-3 py-1.5 text-left text-xs text-(--text-1) hover:bg-(--surface-2)"
                        >
                          {p.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                onClick={handleSend}
                disabled={!composerText.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-(--accent) px-3 py-1.5 text-xs font-semibold text-(--accent-contrast) disabled:opacity-40"
              >
                <Send className="h-3 w-3" /> Send
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-(--text-3)">
            Select or create a thread to start.
          </div>
        )}
      </div>
    </div>
  );
}
