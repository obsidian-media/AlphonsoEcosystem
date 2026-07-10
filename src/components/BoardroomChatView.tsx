import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Send } from 'lucide-react';
import { listAgentProfiles } from '../agents/agentRegistry';
import {
  createThread,
  listThreads,
  listThreadMessages,
  addThreadMessage,
  migrateLegacySessions,
  parseMentions,
  type BoardroomThread,
  type BoardroomThreadMessage
} from '../services/boardroomThreadService';
import { generateAgentResponse } from '../services/boardroomFacilitatorService';

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

function MessageBubble({ message }: { message: BoardroomThreadMessage }) {
  const isEscalation = message.kind === 'escalation';
  return (
    <div
      data-message-kind={message.kind}
      className={
        isEscalation
          ? 'rounded-lg border border-amber-400/40 bg-amber-500/10 p-2.5 text-xs'
          : 'rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-xs'
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`font-semibold ${isEscalation ? 'text-amber-300' : 'text-[var(--text-1)]'}`}>
          {isEscalation ? 'Needs your decision' : agentLabel(message.speaker)}
        </span>
        {message.approvalRequired && (
          <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-300">
            approval required
          </span>
        )}
      </div>
      <div className={`mt-1 whitespace-pre-wrap ${isEscalation ? 'text-amber-200' : 'text-[var(--text-2)]'}`}>{message.content}</div>
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
    let hopsUsed = 0;

    while (respondingAgents.length > 0) {
      const agentId = respondingAgents.shift() as string;

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
      const result = await generateAgentResponse({
        agentId,
        topic: activeThread.topic,
        priorMessages,
        newMessageText: text
      });
      const replyText = result.ok ? result.text : `${agentId} couldn't respond: ${result.error}`;
      addThreadMessage({ threadId: activeThreadId, speaker: agentId, content: replyText });
      setMessages(listThreadMessages(activeThreadId));

      if (result.ok) {
        const chainedMentions = parseMentions(replyText, agentIds).filter((id) => id !== agentId);
        respondingAgents.push(...chainedMentions);
      }
    }
    setFacilitatorPending(false);
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
                <MessageBubble key={m.id} message={m} />
              ))}
            </div>
            {facilitatorPending && (
              <div className="px-4 pb-1 text-xs text-[var(--text-3)]">Alphonso is thinking…</div>
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
