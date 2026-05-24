import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Compass,
  Radar,
} from 'lucide-react';

const stateStyles = {
  idle: {
    ring: 'ring-white/10',
    glow: 'shadow-none',
    badge: Cloud,
    badgeClass: 'bg-zinc-800/70 text-zinc-200 border-zinc-600/30',
    animation: 'hector-breathe'
  },
  researching: {
    ring: 'ring-cyan-300/20',
    glow: 'shadow-none',
    badge: Radar,
    badgeClass: 'bg-zinc-800/70 text-zinc-200 border-zinc-600/30',
    animation: 'hector-researching'
  },
  thinking: {
    ring: 'ring-sky-300/20',
    glow: 'shadow-none',
    badge: Compass,
    badgeClass: 'bg-zinc-800/70 text-zinc-200 border-zinc-600/30',
    animation: 'hector-breathe'
  },
  warning: {
    ring: 'ring-amber-300/20',
    glow: 'shadow-none',
    badge: AlertTriangle,
    badgeClass: 'bg-zinc-800/70 text-zinc-200 border-zinc-600/30',
    animation: 'hector-warning'
  },
  task_complete: {
    ring: 'ring-emerald-300/20',
    glow: 'shadow-none',
    badge: CheckCircle2,
    badgeClass: 'bg-zinc-800/70 text-zinc-200 border-zinc-600/30',
    animation: 'hector-breathe'
  },
  waiting: {
    ring: 'ring-zinc-600/25',
    glow: 'shadow-none',
    badge: Cloud,
    badgeClass: 'bg-zinc-800/70 text-zinc-200 border-zinc-600/30',
    animation: 'opacity-70'
  }
};

export function HectorCompanionWidget({
  state = 'idle',
  message = 'Hector is standing by.',
  currentSourceUrl = null,
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
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-100">Hector</div>
            <div className="text-[11px] text-teal-50 truncate">{message}</div>
            <div className="text-[9px] text-zinc-500 truncate">{currentSourceUrl ? `Current: ${currentSourceUrl}` : 'Cloud scout companion'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
