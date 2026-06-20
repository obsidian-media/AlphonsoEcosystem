import React, { useMemo, useState } from 'react';
import { UserRound } from 'lucide-react';
import { getAgentInitials, getAgentMascotPath } from '../services/agentVisualService';

export function AgentAvatar({
  agentId,
  name,
  className = '',
  sizeClass = 'h-8 w-8',
  roundedClass = 'rounded-full'
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const src = useMemo(() => getAgentMascotPath(agentId), [agentId]);
  const initials = useMemo(() => getAgentInitials(name || agentId), [name, agentId]);

  if (src && !imageFailed) {
    return (
      <img
        src={src}
        alt={`${name || agentId || 'Agent'} mascot`}
        onError={() => setImageFailed(true)}
        className={`${sizeClass} ${roundedClass} border border-white/10 object-cover object-center ${className}`.trim()}
      />
    );
  }

  return (
    <div className={`${sizeClass} ${roundedClass} flex items-center justify-center border border-white/10 bg-zinc-900/70 text-[10px] font-bold uppercase tracking-widest text-zinc-200 ${className}`.trim()}>
      {initials === '?' ? <UserRound className="h-3.5 w-3.5 text-zinc-400" /> : initials}
    </div>
  );
}
