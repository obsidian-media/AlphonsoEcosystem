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
  parseMentions,
  findCrossThreadContext,
  type BoardroomThread,
  type BoardroomThreadMessage
} from '../services/boardroomThreadService';
import { generateAgentResponse, detectLowConfidence } from '../services/boardroomFacilitatorService';

const AGENT_PROFILES = listAgentProfiles();

// Spec 1.10.2: a hard cap on chained AI-generated hops per message, so an
// unbroken chain of agents @mentioning each other can't run forever. This
// is deliberately a simple global depth cap per cascade, not full
// per-topic round tracking (which needs real disagreement detection) —
// see the phase 5 plan doc for the honest scope statement.
const MAX_CHAIN_DEPTH = 3;

function agentLabel(speakerId: string): string {
  if (speakerId === 'user') return 'You';
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
  onConfirm
}: {
  message: BoardroomThreadMessage;
  onRetry: (message: BoardroomThreadMessage) => void;
  onAcknowledge: (message: BoardroomThreadMessage) => void;
  onConfirm: (message: BoardroomThreadMessage) => void;
}) {
  const isEscalation = message.kind === 'escalation';
  const isFailure = message.kind === 'failure';
  const isGated = message.approvalRequired && !message.confirmed;
  const toneClass = isEscalation
    ? 'border-amber-400/40 bg-amber-500/10'
    : isFailure
      ? 'border-rose-400/40 bg-rose-500/10'
      : 'border-[var(--border)] bg-[var(--surface-2)]';
  return (
    <div data-message-kind={message.kind} className={`rounded-lg border p-2.5 text-xs ${toneClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`font-semibold ${isEscalation ? 'text-amber-300' : isFailure ? 'text-rose-300' : 'text-[var(--text-1)]'}`}>
          {isEscalation ? 'Needs your decision' : isFailure ? `${agentLabel(message.speaker)} — failed` : agentLabel(message.speaker)}
        </span>
        {message.approvalRequired && (
          <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-300">
            {message.confirmed ? 'confirmed' : 'approval required'}
          </span>
        )}
      </div>
      {isGated ? (
        <div className="mt-1.5 rounded-md border border-amber-400/30 bg-amber-500/5 p-2">
          <p className="text-amber-300">This message proposes a high-risk action — content hidden until confirmed.</p>
          <button
            onClick={() => onConfirm(message)}
            className="mt-1.5 rounded-md border border-amber-400/40 px-2 py-0.5 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/10"
          >
            Confirm to reveal
          </button>
        </div>
      ) : (
        <div className={`mt-1 whitespace-pre-wrap ${isEscalation ? 'text-amber-200' : isFailure ? 'text-rose-200' : 'text-[var(--text-2)]'}`}>{message.content}</div>
      )}
      {!isEscalation && !isFailure && message.model && (
        <div className="mt-1 text-[9px] text-[var(--text-3)]">
          {message.model} · {formatLatency(message.latencyMs || 0)}
        </div>
      )}
      {isFailure && message.retryContext && (
        <button
          onClick={() => onRetry(message)}
          className="mt-1.5 rounded-md border border-rose-400/30 px-2 py-0.5 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/10"
        >
          Retry
        </button>
      )}
      {isEscalation && (
        message.acknowledged ? (
          <span className="mt-1.5 inline-block text-[10px] font-semibold text-amber-400/70">✓ Acknowledged</span>
        ) : (
          <button
            onClick={() => onAcknowledge(message)}
            className="mt-1.5 rounded-md border border-amber-400/30 px-2 py-0.5 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/10"
          >
            Acknowledge
          </button>
        )
      )}
      {message.mentionedAgents.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {message.mentionedAgents.map((agentId) => (
            <span key={agentId} className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-dim)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--accent)]">
              → {agentLabel(agentId)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function BoardroomChatView() {
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
  const [composerSpeaker, setComposerSpeaker] = useState('user');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [facilitatorPending, setFacilitatorPending] = useState(false);
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
    if (!activeThreadId || !activeThread || !composerText.trim()) return;
    const text = composerText.trim();
    addThreadMessage({ threadId: activeThreadId, speaker: composerSpeaker, content: text });
    setMessages(listThreadMessages(activeThreadId));
    setComposerText('');

    const agentIds = AGENT_PROFILES.map((p: { id: string }) => p.id);
    const mentions = parseMentions(text, agentIds);
    const respondingAgents = mentions.length > 0
      ? mentions.filter((agentId) => agentId !== composerSpeaker)
      : (composerSpeaker !== 'alphonso' ? ['alphonso'] : []);

    if (respondingAgents.length === 0) return;

    setFacilitatorPending(true);
    stopRequestedRef.current = false;
    generationAbortControllerRef.current = new AbortController();
    let hopsUsed = 0;

    while (respondingAgents.length > 0) {
      const agentId = respondingAgents.shift() as string;

      if (stopRequestedRef.current) {
        addThreadMessage({
          threadId: activeThreadId,
          speaker: 'alphonso',
          content: 'Generation stopped by user.',
          kind: 'system'
        });
        setMessages(listThreadMessages(activeThreadId));
        break;
      }

      if (hopsUsed >= MAX_CHAIN_DEPTH) {
        addThreadMessage({
          threadId: activeThreadId,
          speaker: 'alphonso',
          content: `The conversation reached ${MAX_CHAIN_DEPTH} chained replies without stopping — further @mentions won't auto-trigger. Reply directly to keep it going, or make a call on where this should land.`,
          kind: 'escalation'
        });
        setMessages(listThreadMessages(activeThreadId));
        break;
      }

      hopsUsed += 1;

      const priorMessages = listThreadMessages(activeThreadId).map((m) => ({ speaker: m.speaker, content: m.content }));
      const crossThreadContext = findCrossThreadContext({ excludeThreadId: activeThreadId, queryText: text });
      const result = await generateAgentResponse({
        agentId,
        topic: activeThread.topic,
        priorMessages,
        newMessageText: text,
        crossThreadContext,
        signal: generationAbortControllerRef.current.signal
      });

      if (stopRequestedRef.current) {
        addThreadMessage({
          threadId: activeThreadId,
          speaker: 'alphonso',
          content: 'Generation stopped by user.',
          kind: 'system'
        });
        setMessages(listThreadMessages(activeThreadId));
        break;
      }

      const replyText = result.ok ? result.text : `${agentId} couldn't respond: ${result.error}`;
      addThreadMessage({
        threadId: activeThreadId,
        speaker: agentId,
        content: replyText,
        kind: result.ok ? 'message' : 'failure',
        retryContext: result.ok ? undefined : text,
        model: result.ok ? result.model : undefined,
        latencyMs: result.ok ? result.latencyMs : undefined
      });
      setMessages(listThreadMessages(activeThreadId));

      if (result.ok) {
        if (detectLowConfidence(replyText)) {
          addThreadMessage({
            threadId: activeThreadId,
            speaker: 'alphonso',
            content: `${agentLabel(agentId)} flagged low confidence in that reply — needs your decision.`,
            kind: 'escalation'
          });
          setMessages(listThreadMessages(activeThreadId));
        }
        const chainedMentions = parseMentions(replyText, agentIds).filter((id) => id !== agentId);
        respondingAgents.push(...chainedMentions);
      }
    }
    generationAbortControllerRef.current = null;
    setFacilitatorPending(false);
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
    const result = await generateAgentResponse({
      agentId,
      topic: activeThread.topic,
      priorMessages,
      newMessageText: message.retryContext,
      crossThreadContext
    });
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
      <div className="w-56 shrink-0 border-r border-[var(--border)] overflow-y-auto p-3 space-y-3">
        <div className="space-y-2">
          <input
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            placeholder="New thread topic..."
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs text-[var(--text-1)] outline-none"
          />
          <button
            onClick={handleCreateThread}
            disabled={!newTopic.trim()}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] px-2.5 py-1.5 text-xs font-semibold text-[var(--surface-0)] disabled:opacity-40"
          >
            <Plus className="h-3 w-3" /> New Thread
          </button>
        </div>
        {threads.length === 0 ? (
          <p className="text-xs text-[var(--text-3)]">No threads yet.</p>
        ) : (
          <div className="space-y-1">
            {threads.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveThreadId(t.id)}
                className={`w-full truncate rounded-lg px-2.5 py-1.5 text-left text-xs ${
                  t.id === activeThreadId ? 'bg-[var(--accent-dim)] text-[var(--accent)]' : 'text-[var(--text-2)] hover:bg-[var(--surface-2)]'
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
            <div className="flex-1 overflow-y-auto space-y-2 p-4">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} onRetry={handleRetry} onAcknowledge={handleAcknowledge} onConfirm={handleConfirm} />
              ))}
            </div>
            {facilitatorPending && (
              <div className="flex items-center justify-between px-4 pb-1 text-xs text-[var(--text-3)]">
                <span>Alphonso is thinking…</span>
                <button
                  onClick={handleStop}
                  className="rounded-md border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-2)] hover:bg-[var(--surface-2)]"
                >
                  Stop
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 border-t border-[var(--border)] p-3">
              <select
                value={composerSpeaker}
                onChange={(e) => setComposerSpeaker(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text-1)]"
              >
                <option value="user">You</option>
                {AGENT_PROFILES.map((p: { id: string; name: string }) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <div className="relative flex-1">
                <input
                  value={composerText}
                  onChange={(e) => handleComposerChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && mentionQuery === null) handleSend();
                  }}
                  placeholder="Message the room..."
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-sm text-[var(--text-1)] outline-none"
                />
                {mentionMatches.length > 0 && (
                  <ul role="listbox" className="absolute bottom-full mb-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] shadow-lg">
                    {mentionMatches.map((p: { id: string; name: string }) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={false}
                          onClick={() => handleSelectMention(p.name)}
                          className="block w-full px-3 py-1.5 text-left text-xs text-[var(--text-1)] hover:bg-[var(--surface-2)]"
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
                className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--surface-0)] disabled:opacity-40"
              >
                <Send className="h-3 w-3" /> Send
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-[var(--text-3)]">
            Select or create a thread to start.
          </div>
        )}
      </div>
    </div>
  );
}
