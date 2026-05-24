import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Crown,
  GitBranch,
  Route,
  ShieldCheck,
} from 'lucide-react';

const stateStyles = {
  idle: {
    ring: 'ring-white/10',
    glow: 'shadow-none',
    badge: Crown,
    badgeClass: 'bg-zinc-800/70 text-zinc-200 border-zinc-600/30',
    animation: 'jose-breathe'
  },
  thinking: {
    ring: 'ring-yellow-200/20',
    glow: 'shadow-none',
    badge: GitBranch,
    badgeClass: 'bg-zinc-800/70 text-zinc-200 border-zinc-600/30',
    animation: 'jose-breathe'
  },
  directing: {
    ring: 'ring-orange-300/20',
    glow: 'shadow-none',
    badge: Route,
    badgeClass: 'bg-zinc-800/70 text-zinc-200 border-zinc-600/30',
    animation: 'jose-directing'
  },
  approving: {
    ring: 'ring-amber-200/25',
    glow: 'shadow-none',
    badge: ShieldCheck,
    badgeClass: 'bg-zinc-800/70 text-zinc-200 border-zinc-600/30',
    animation: 'jose-approval'
  },
  warning: {
    ring: 'ring-red-300/20',
    glow: 'shadow-none',
    badge: AlertTriangle,
    badgeClass: 'bg-zinc-800/70 text-zinc-200 border-zinc-600/30',
    animation: 'jose-warning'
  },
  task_complete: {
    ring: 'ring-emerald-300/20',
    glow: 'shadow-none',
    badge: CheckCircle2,
    badgeClass: 'bg-zinc-800/70 text-zinc-200 border-zinc-600/30',
    animation: 'jose-breathe'
  }
};

export function JoseCompanionWidget({
  state = 'idle',
  message = 'Jose is coordinating quietly.',
  pinned = true
}) {
  const style = stateStyles[state] || stateStyles.idle;
  const BadgeIcon = style.badge;

  return (
    <div className={`${pinned ? 'fixed bottom-4 right-4 z-30' : 'relative'} pointer-events-none`}>
      <div className="pointer-events-auto w-56 rounded-xl border border-white/10 bg-zinc-950/95 shadow-xl backdrop-blur-xl overflow-hidden px-3 py-2">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-full border ${style.badgeClass}`}>
            <BadgeIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-100">Jose</div>
            <div className="text-[11px] text-amber-50 truncate">{message}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
