import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Send } from 'lucide-react';
import { listAgentProfiles } from '../agents/agentRegistry';
import {
  createThread,
  listThreads,
  listThreadMessages,
  addThreadMessage,
  migrateLegacySessions,
  type BoardroomThread,
  type BoardroomThreadMessage
} from '../services/boardroomThreadService';

const AGENT_PROFILES = listAgentProfiles();

function agentLabel(speakerId: string): string {
  if (speakerId === 'user') return 'You';
  const profile = AGENT_PROFILES.find((p: { id: string }) => p.id === speakerId);
  return profile?.name || speakerId;
}

function MessageBubble({ message }: { message: BoardroomThreadMessage }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-[var(--text-1)]">{agentLabel(message.speaker)}</span>
        {message.approvalRequired && (
          <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-300">
            approval required
          </span>
        )}
      </div>
      <div className="mt-1 whitespace-pre-wrap text-[var(--text-2)]">{message.content}</div>
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

  function handleSend() {
    if (!activeThreadId || !composerText.trim()) return;
    addThreadMessage({ threadId: activeThreadId, speaker: composerSpeaker, content: composerText.trim() });
    setMessages(listThreadMessages(activeThreadId));
    setComposerText('');
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
