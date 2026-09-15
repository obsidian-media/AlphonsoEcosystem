import React, { useMemo, useState } from 'react';
import { UserRound } from 'lucide-react';
import { getAgentInitials, getAgentMascotPath } from '../services/agentVisualService';

interface Props {
  agentId: string;
  name?: string;
  className?: string;
  sizeClass?: string;
  roundedClass?: string;
}

export function AgentAvatar({
  agentId,
  name,
  className = '',
  sizeClass = 'h-8 w-8',
  roundedClass = 'rounded-full'
}: Props) {
  const [imageFailed, setImageFailed] = useState<boolean>(false);
  const src = useMemo(() => getAgentMascotPath(agentId), [agentId]);
  const initials = useMemo(() => getAgentInitials(name || agentId), [name, agentId]);

  if (src && !imageFailed) {
    return (
      <img
        src={src}
        alt={`${name || agentId || 'Agent'} mascot`}
        onError={() => setImageFailed(true)}
        className={`${sizeClass} ${roundedClass} border border-[var(--border)] object-cover object-center ${className}`.trim()}
      />
    );
  }

  return (
    <div className={`${sizeClass} ${roundedClass} flex items-center justify-center border border-[var(--border)] bg-[var(--surface-2)] text-[10px] font-bold uppercase tracking-widest text-[var(--text-2)] ${className}`.trim()}>
      {initials === '?' ? <UserRound className="h-3.5 w-3.5 text-[var(--text-3)]" /> : initials}
    </div>
  );
}
