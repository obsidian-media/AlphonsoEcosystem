import React from 'react';
import { AgentAvatar } from '../AgentAvatar';
import { getCompanionContent } from '../../services/companionGreetingsService';

interface AgentRowItem {
  id: string;
  name: string;
}

interface Props {
  agents: AgentRowItem[];
  activeAgentId: string;
  onSelectAgent: (agentId: string) => void;
}

export function CompanionAgentRow({ agents, activeAgentId, onSelectAgent }: Props) {
  return (
    <div className="flex gap-4 overflow-x-auto px-4 py-3 -mx-1" role="tablist" aria-label="Choose an agent">
      {agents.map((agent) => {
        const isActive = agent.id === activeAgentId;
        const { emoji } = getCompanionContent(agent.id);
        return (
          <button
            key={agent.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={agent.name}
            onClick={() => onSelectAgent(agent.id)}
            className={`flex flex-col items-center gap-1 shrink-0 transition-opacity ${isActive ? 'opacity-100' : 'opacity-45 hover:opacity-75'}`}
          >
            <div className={`relative rounded-full transition-transform ${isActive ? 'scale-105 ring-2 ring-offset-2 ring-offset-[var(--companion-surface)] ring-[var(--accent)]' : ''}`}>
              <AgentAvatar agentId={agent.id} name={agent.name} sizeClass="h-14 w-14" className="border-2 border-white/60" />
              <span className="absolute -bottom-1 -right-1 text-sm leading-none bg-white rounded-full h-5 w-5 flex items-center justify-center shadow-sm">
                {emoji}
              </span>
            </div>
            <span className="text-[11px] font-medium text-[var(--companion-text-muted)] max-w-[64px] truncate">{agent.name}</span>
          </button>
        );
      })}
    </div>
  );
}
