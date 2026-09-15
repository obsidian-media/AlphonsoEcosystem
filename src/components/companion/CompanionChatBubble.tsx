import React from 'react';
import { AgentAvatar } from '../AgentAvatar';

export interface CompanionMessage {
  id: string;
  role: 'user' | 'agent';
  agentId?: string;
  agentName?: string;
  text: string;
  pending?: boolean;
}

export function CompanionChatBubble({ message }: { message: CompanionMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <AgentAvatar agentId={message.agentId || 'alphonso'} name={message.agentName} sizeClass="h-6 w-6" className="shrink-0 mb-1" />
      )}
      <div
        className={`max-w-[75%] px-4 py-2.5 text-sm leading-relaxed backdrop-blur-sm ${
          isUser
            ? 'bg-[var(--companion-bubble-mine)] text-[var(--companion-bubble-mine-text)] rounded-2xl rounded-br-sm'
            : 'bg-[var(--companion-bubble-theirs)] text-[var(--companion-bubble-theirs-text)] rounded-2xl rounded-bl-sm'
        }`}
      >
        {message.pending ? <TypingIndicator /> : message.text}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Typing">
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-bounce [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-bounce [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-bounce" />
    </span>
  );
}
