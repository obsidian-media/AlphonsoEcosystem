import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  Palette,
  Sparkles,
} from 'lucide-react';

const stateStyles = {
  idle: {
    ring: 'ring-white/10',
    glow: 'shadow-none',
    badge: Sparkles,
    badgeClass: 'bg-zinc-800/70 text-zinc-200 border-zinc-600/30',
    animation: 'miya-breathe'
  },
  creating: {
    ring: 'ring-rose-400/20',
    glow: 'shadow-none',
    badge: Palette,
    badgeClass: 'bg-zinc-800/70 text-zinc-200 border-zinc-600/30',
    animation: 'miya-creating'
  },
  thinking: {
    ring: 'ring-violet-400/20',
    glow: 'shadow-none',
    badge: Lightbulb,
    badgeClass: 'bg-zinc-800/70 text-zinc-200 border-zinc-600/30',
    animation: 'miya-breathe'
  },
  rendering: {
    ring: 'ring-pink-400/20',
    glow: 'shadow-none',
    badge: Sparkles,
    badgeClass: 'bg-zinc-800/70 text-zinc-200 border-zinc-600/30',
    animation: 'miya-rendering'
  },
  brainstorming: {
    ring: 'ring-indigo-300/20',
    glow: 'shadow-none',
    badge: Lightbulb,
    badgeClass: 'bg-zinc-800/70 text-zinc-200 border-zinc-600/30',
    animation: 'miya-breathe'
  },
  exporting: {
    ring: 'ring-cyan-300/20',
    glow: 'shadow-none',
    badge: Palette,
    badgeClass: 'bg-zinc-800/70 text-zinc-200 border-zinc-600/30',
    animation: 'miya-rendering'
  },
  warning: {
    ring: 'ring-amber-400/20',
    glow: 'shadow-none',
    badge: AlertTriangle,
    badgeClass: 'bg-zinc-800/70 text-zinc-200 border-zinc-600/30',
    animation: 'miya-warning'
  },
  waiting: {
    ring: 'ring-zinc-500/35',
    glow: 'shadow-none',
    badge: Sparkles,
    badgeClass: 'bg-zinc-800/70 text-zinc-200 border-zinc-600/30',
    animation: 'opacity-70'
  },
  task_complete: {
    ring: 'ring-emerald-300/20',
    glow: 'shadow-none',
    badge: CheckCircle2,
    badgeClass: 'bg-zinc-800/70 text-zinc-200 border-zinc-600/30',
    animation: 'miya-breathe'
  }
};

export function MiyaCompanionWidget({
  state = 'idle',
  message = 'Miya is ready.',
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
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-fuchsia-200">Miya</div>
            <div className="text-[11px] text-fuchsia-50 truncate">{message}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
