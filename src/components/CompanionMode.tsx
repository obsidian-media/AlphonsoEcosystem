import React, { useMemo, useState } from 'react';
import { Menu, Settings as SettingsIcon } from 'lucide-react';
import { listAgentProfiles } from '../agents/agentRegistry';
import { getCompanionContent } from '../services/companionGreetingsService';
import { generateAgentLlmResponse } from '../lib/ollama';
import { handleAsyncError } from '../lib/errorHandler';
import { CompanionAgentRow } from './companion/CompanionAgentRow';
import { CompanionChatBubble, type CompanionMessage } from './companion/CompanionChatBubble';
import { CompanionInputBar } from './companion/CompanionInputBar';
import { ModeToggle } from './ModeToggle';
import type { UxMode } from '../hooks/useUxMode';
import alphonsoIcon from '../assets/alphonso-app-icon.png';
import { useTheme } from '../hooks/useTheme';

// Text-only companion persona -- same "no fabricated tool/file claims"
// contract as chatUtils.js's CHAT_ASSISTANT_PROMPT, generalized across all
// 9 real agents instead of hardcoded to Alphonso. Companion Mode does not
// route through Jose's real orchestration/tool pipeline (see
// docs/ui-redesign/24-phase3-companion-mode-implementation-plan.md's
// Non-goals) -- it is a real conversation with a persona, not a tool runner.
function buildSystemPrompt(agentName: string, purpose: string): string {
  return [
    `You are ${agentName}, one of a team of AI agents inside a local-first desktop assistant app.`,
    `Your role: ${purpose}`,
    'Answer like a helpful, knowledgeable companion -- warm and direct, not a generic chatbot.',
    'CRITICAL: in this mode you have NO file system, tool, or execution access -- you are a text-only conversation.',
    'NEVER claim to have created, moved, deleted, run, or generated anything. If the user needs a real action taken, tell them to switch to Advanced mode or ask another agent to help.'
  ].join(' ');
}

let messageIdCounter = 0;
function nextMessageId(): string {
  messageIdCounter += 1;
  return `companion-msg-${messageIdCounter}`;
}

interface Props {
  uxMode: UxMode;
  onModeChange: (mode: UxMode) => void;
  onOpenSettings: () => void;
}

const DEFAULT_COMPANION_AGENT_ID = 'alphonso';

export function CompanionMode({ uxMode, onModeChange, onOpenSettings }: Props) {
  // Simple Mode never mounts Sidebar.tsx/TopBar.tsx (the only two places that
  // otherwise call useTheme()) -- without this, data-theme is never applied
  // while Simple Mode is the whole experience, and the page silently falls
  // back to the OS's prefers-color-scheme instead of the user's saved
  // choice. Same root cause as CoachWindow.tsx (bug-log #119) and
  // OnboardingWizard.tsx (bug-log #122).
  useTheme();
  const agents = useMemo(() => listAgentProfiles(), []);
  // Alphonso (general-purpose 💬) is the right default landing agent for a
  // chat-first companion screen, not CORE_AGENT_REGISTRY's array order --
  // that list happens to put Jose (orchestration) first for unrelated
  // reasons, which made Jose the accidental default before this was caught.
  const [activeAgentId, setActiveAgentId] = useState<string>(
    agents.some((a) => a.id === DEFAULT_COMPANION_AGENT_ID) ? DEFAULT_COMPANION_AGENT_ID : (agents[0]?.id || DEFAULT_COMPANION_AGENT_ID)
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [showQuickStarts, setShowQuickStarts] = useState(true);
  const [conversations, setConversations] = useState<Record<string, CompanionMessage[]>>({});
  const [isPending, setIsPending] = useState(false);

  const activeAgent = agents.find((a) => a.id === activeAgentId) || agents[0];
  const content = getCompanionContent(activeAgentId);
  const messages = conversations[activeAgentId] || [];

  const handleSelectAgent = (agentId: string) => {
    setActiveAgentId(agentId);
    setShowQuickStarts(true);
  };

  const sendMessage = async (text: string) => {
    if (!activeAgent) return;
    setShowQuickStarts(false);
    const userMsg: CompanionMessage = { id: nextMessageId(), role: 'user', text };
    const pendingId = nextMessageId();
    const pendingMsg: CompanionMessage = { id: pendingId, role: 'agent', agentId: activeAgent.id, agentName: activeAgent.name, text: '', pending: true };

    setConversations((prev) => ({
      ...prev,
      [activeAgentId]: [...(prev[activeAgentId] || []), userMsg, pendingMsg]
    }));
    setIsPending(true);

    try {
      const history = (conversations[activeAgentId] || [])
        .map((m) => `${m.role === 'user' ? 'User' : activeAgent.name}: ${m.text}`)
        .join('\n');
      const prompt = [
        buildSystemPrompt(activeAgent.name, activeAgent.purpose || activeAgent.title || 'general assistant'),
        history ? `\nConversation so far:\n${history}` : '',
        `\nUser: ${text}`,
        `\n${activeAgent.name}:`
      ].join('');

      const result = await generateAgentLlmResponse(activeAgent.id, { prompt });

      setConversations((prev) => ({
        ...prev,
        [activeAgentId]: (prev[activeAgentId] || []).map((m) =>
          m.id === pendingId ? { ...m, text: result.response, pending: false } : m
        )
      }));
    } catch (err) {
      handleAsyncError(err, 'companion_mode_send');
      setConversations((prev) => ({
        ...prev,
        [activeAgentId]: (prev[activeAgentId] || []).map((m) =>
          m.id === pendingId ? { ...m, text: "Sorry, I couldn't respond just now. Try again in a moment.", pending: false } : m
        )
      }));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="relative flex flex-col h-screen w-full overflow-hidden bg-[var(--companion-surface)]" data-companion-mode-ready="true">
      <div className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-[var(--companion-blob-peach)] blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 -right-20 h-80 w-80 rounded-full bg-[var(--companion-blob-pink)] blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 h-64 w-64 rounded-full bg-[var(--companion-blob-lavender)] blur-3xl pointer-events-none" />

      <header className="relative z-10 flex items-center justify-between px-4 py-3">
        <button type="button" aria-label="Menu" onClick={() => setMenuOpen((v) => !v)} className="h-9 w-9 flex items-center justify-center rounded-full bg-[var(--companion-bubble-theirs)] backdrop-blur-sm">
          <Menu className="h-4 w-4 text-[var(--companion-bubble-theirs-text)]" />
        </button>
        <span className="flex items-center gap-1.5">
          <img src={alphonsoIcon} alt="Alphonso" className="h-5 w-5 rounded-md shrink-0" />
          <span className="font-serif text-sm font-semibold text-[var(--companion-bubble-theirs-text)]">Alphonso</span>
        </span>
        <button type="button" aria-label="Settings" onClick={onOpenSettings} className="h-9 w-9 flex items-center justify-center rounded-full bg-[var(--companion-bubble-theirs)] backdrop-blur-sm">
          <SettingsIcon className="h-4 w-4 text-[var(--companion-bubble-theirs-text)]" />
        </button>
      </header>

      {menuOpen && (
        <div className="relative z-20 mx-4 mb-2 rounded-2xl bg-[var(--companion-bubble-theirs)] backdrop-blur-md p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--companion-text-muted)]">Display mode</div>
          <ModeToggle mode={uxMode} onModeChange={(m) => { onModeChange(m); setMenuOpen(false); }} />
          <button type="button" onClick={() => { onOpenSettings(); setMenuOpen(false); }} className="text-sm font-medium text-[var(--companion-bubble-theirs-text)] underline underline-offset-2">
            Open Settings
          </button>
        </div>
      )}

      <CompanionAgentRow agents={agents} activeAgentId={activeAgentId} onSelectAgent={handleSelectAgent} />

      <div className="relative z-10 px-5 pt-1 pb-2">
        <div className="font-serif text-2xl font-semibold text-[var(--companion-bubble-theirs-text)]">{activeAgent?.name}</div>
        <div className="text-sm text-[var(--companion-text-muted)] mt-0.5">{content.greeting}</div>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto px-4 space-y-3">
        {messages.map((m) => (
          <CompanionChatBubble key={m.id} message={m} />
        ))}
      </div>

      {showQuickStarts && messages.length === 0 && (
        <div className="relative z-10 flex gap-2 overflow-x-auto px-4 py-2">
          {content.quickStarts.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => sendMessage(chip)}
              className="shrink-0 rounded-full bg-[var(--companion-bubble-theirs)] backdrop-blur-sm px-3 py-1.5 text-xs font-medium text-[var(--companion-bubble-theirs-text)]"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      <div className="relative z-10 px-4 pb-4 pt-2">
        <CompanionInputBar agentEmoji={content.emoji} onSend={sendMessage} disabled={isPending} />
      </div>
    </div>
  );
}
